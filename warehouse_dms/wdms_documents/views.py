"""
Document endpoints for Phase 3.

Phase 3 scope (SSE validation, notifications):
  - POST /upload/                     Stage file + create UploadAttempt(PENDING),
                                      enqueue Celery task, return stream_url
  - GET  /upload/{attempt_id}/stream/ SSE stream (plain Django view, not Ninja)
  - POST /upload/{attempt_id}/confirm/ Promote UploadAttempt → Document
  - POST /{id}/transition/            FSM transition via the engine
  - GET  /                            role-scoped list
  - GET  /{id}/                       detail with full transition history
  - GET  /{id}/transitions/           available transitions for the caller
  - GET  /types/                      document type config metadata

Tenant isolation is enforced at the view layer by `_scope_documents_for_user`.
Workflow correctness is enforced by `FSMEngine.execute_transition`.
Views never mutate `document.status` directly — every state change goes through
the engine so the audit trail stays consistent.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q, QuerySet
from django.http import HttpRequest
from django.shortcuts import get_object_or_404


def _jwt_authenticate(request: HttpRequest):
    """
    Manually resolve a Bearer token for plain Django views (non-Ninja).

    Tokens in this system are AES-encrypted JWTs validated via
    AuthenticationService.get_user_from_token().  Plain Django views don't
    go through Ninja's PermissionAuth middleware, so request.user is always
    AnonymousUser for API clients that send Authorization: Bearer <token>.
    """
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth_header.startswith("Bearer "):
        return None
    try:
        from wdms_uaa.authentication.services import AuthenticationService
        return AuthenticationService().get_user_from_token(auth_header.split(" ", 1)[1])
    except Exception:
        return None
from ninja import File, Form, Query, Router
from ninja.files import UploadedFile

from wdms_documents.fsm.engine import FSMEngine
from wdms_documents.fsm.types import (
    get_all_document_types,
    get_document_type,
)
from wdms_documents.models import (
    Document,
    UploadAttempt,
    UploadAttemptStatus,
    WorkflowTransition,
)
from wdms_documents.serializers import (
    AllowedTransitionSerializer,
    AllowedTransitionsResponseSerializer,
    CorrectAIInputSerializer,
    DocumentFilteringSerializer,
    DocumentNonPagedResponseSerializer,
    DocumentPagedResponseSerializer,
    DocumentTableSerializer,
    DocumentTypeMetadataSerializer,
    DocumentTypesListResponseSerializer,
    ReclassifyInputSerializer,
    SearchHitSerializer,
    SearchInputSerializer,
    SearchResponseDataSerializer,
    SearchResponseSerializer,
    TransitionActionInputSerializer,
)
from wdms_notifications.serializers import (
    UploadAttemptStartResponseSerializer,
    UploadAttemptStartSerializer,
)
from wdms_tenants.models import Warehouse
from wdms_tenants.querysets import get_tenant_scoped_queryset, get_user_tenant
from wdms_uaa.authorization import PermissionAuth
from wdms_uaa.models import UsersWithRoles
from wdms_utils.response import (
    ResponseObject,
    get_paginated_and_non_paginated_data,
)

logger = logging.getLogger("wdms_logger")

documents_router = Router()

# Any authenticated user — per-endpoint role/config gating is done inside handlers.
_auth = PermissionAuth()


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────


def _get_user_role(user: User) -> Optional[str]:
    """Return the user's primary role name, matching FSMEngine's logic."""
    ur = (
        UsersWithRoles.objects.filter(user_with_role_user=user, is_active=True)
        .select_related("user_with_role_role")
        .first()
    )
    return ur.user_with_role_role.name if ur else None


def _user_warehouse(user: User) -> Optional[Warehouse]:
    profile = getattr(user, "user_profile", None)
    if profile is None:
        return None
    return profile.warehouse


def _scope_documents_for_user(request: HttpRequest) -> QuerySet:
    """
    Return a Document queryset filtered to what `request.user` is allowed to see.

    Rules:
      - Superusers / ADMIN → every document
      - DEPOSITOR          → only documents they uploaded
      - STAFF              → documents in their assigned warehouse
      - MANAGER / CEO      → documents across their tenant
      - REGULATOR          → Phase 5 will scope by jurisdiction; Phase 2 returns none
      - Anyone else / no tenant → empty queryset

    This is the single chokepoint for cross-tenant isolation on list + detail.
    """
    user = request.user
    base = Document.objects.select_related("warehouse", "uploader", "created_by")

    if getattr(user, "is_superuser", False):
        return base

    role = _get_user_role(user)

    if role == "ADMIN":
        return base

    if role == "DEPOSITOR":
        return base.filter(uploader=user)

    if role == "STAFF":
        warehouse = _user_warehouse(user)
        if warehouse is None:
            return base.none()
        return base.filter(warehouse=warehouse)

    if role in ("MANAGER", "CEO"):
        tenant = get_user_tenant(user)
        if tenant is None:
            return base.none()
        return base.filter(warehouse__tenant=tenant)

    # REGULATOR and any unknown role get nothing in Phase 2.
    return base.none()


def _attach_transitions(document: Document) -> Document:
    """Prefetch transition list onto `document` for the table serializer."""
    qs = (
        document.transitions.select_related("actor")
        .order_by("-primary_key")
        .all()
    )
    document.prefetched_transitions = list(qs)  # raw ORM objects; serializer validates on render
    return document


# ──────────────────────────────────────────────────────────────────────────────
# Upload Step 1 — Stage file and start validation (Phase 3)
# ──────────────────────────────────────────────────────────────────────────────


@documents_router.post(
    "/upload/",
    response=UploadAttemptStartResponseSerializer,
    auth=_auth,
)
def upload_document(
    request: HttpRequest,
    file: UploadedFile = File(...),
    document_type_id: str = Form(...),
    warehouse_id: int = Form(...),
    title: str = Form(...),
):
    """
    Stage the uploaded file, create a PENDING UploadAttempt, and enqueue
    the Celery validation task. Returns an attempt_id and the SSE stream URL.

    The client must open the stream URL (GET /upload/{attempt_id}/stream/)
    to receive real-time validation progress, then POST to
    /upload/{attempt_id}/confirm/ once the stream emits a 'complete' event.
    """
    try:
        from wdms_ai_pipeline.tasks import validate_upload

        type_def = get_document_type(document_type_id)
        if type_def is None:
            return UploadAttemptStartResponseSerializer(
                response=ResponseObject.get_response(
                    0, f"Unknown document type '{document_type_id}'"
                )
            )

        user_role = _get_user_role(request.user)
        if (
            not request.user.is_superuser
            and user_role not in type_def.allowed_uploader_roles
        ):
            return UploadAttemptStartResponseSerializer(
                response=ResponseObject.get_response(
                    0,
                    f"Role '{user_role}' is not permitted to upload '{document_type_id}'",
                )
            )

        try:
            warehouse = Warehouse.objects.select_related("tenant").get(
                pk=warehouse_id, is_active=True
            )
        except Warehouse.DoesNotExist:
            return UploadAttemptStartResponseSerializer(
                response=ResponseObject.get_response(3, "Warehouse not found")
            )

        if not request.user.is_superuser:
            caller_tenant = get_user_tenant(request.user)
            if caller_tenant is None or caller_tenant.pk != warehouse.tenant_id:
                return UploadAttemptStartResponseSerializer(
                    response=ResponseObject.get_response(
                        0, "You do not belong to this warehouse's tenant"
                    )
                )

        attempt = UploadAttempt.objects.create(
            uploader=request.user,
            warehouse=warehouse,
            document_type_id=document_type_id,
            title=title,
            staged_file=file,
            validation_status=UploadAttemptStatus.PENDING,
            validation_warnings=[],
            created_by=request.user,
        )

        # Kick off async validation — Celery will publish SSE events via Redis
        validate_upload.delay(attempt.pk)

        stream_url = f"/api/v1/documents/upload/{attempt.pk}/stream/"
        return UploadAttemptStartResponseSerializer(
            response=ResponseObject.get_response(1, "Upload started"),
            data=UploadAttemptStartSerializer(
                attempt_id=attempt.pk,
                stream_url=stream_url,
            ),
        )

    except Exception as e:
        logger.error(f"Upload start error: {e}")
        return UploadAttemptStartResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


# ──────────────────────────────────────────────────────────────────────────────
# Upload Step 2 — SSE stream (plain Django view, wired in urls.py)
# ──────────────────────────────────────────────────────────────────────────────


def upload_stream_view(request: HttpRequest, attempt_id: int):
    """
    Server-Sent Events stream for validation progress.

    This is a plain Django view (not a Ninja endpoint) because
    StreamingHttpResponse is not compatible with Ninja's response schema.
    It is wired in wdms_documents/urls.py (or the root urls.py) directly.

    The client opens this as an EventSource. The Celery task publishes to
    the Redis channel upload:{attempt_id}; this view subscribes and forwards
    each event to the browser as SSE frames until a 'complete' event fires.
    """
    from wdms_ai_pipeline.sse import stream_upload_progress

    # Plain Django views don't run through Ninja's HttpBearer middleware.
    # If the user is not already authenticated via session, try JWT Bearer.
    if not request.user.is_authenticated:
        user = _jwt_authenticate(request)
        if user:
            request.user = user

    if not request.user.is_authenticated:
        from django.http import HttpResponse
        return HttpResponse("Unauthorized", status=401)

    # Scope check: only the uploader (or superuser) may watch this stream
    attempt = UploadAttempt.objects.filter(pk=attempt_id).first()
    if attempt is None:
        from django.http import HttpResponse
        return HttpResponse("Not found", status=404)

    if not request.user.is_superuser and attempt.uploader_id != request.user.pk:
        from django.http import HttpResponse
        return HttpResponse("Forbidden", status=403)

    return stream_upload_progress(attempt_id)


# ──────────────────────────────────────────────────────────────────────────────
# Upload Step 3 — Confirm and promote (Phase 3)
# ──────────────────────────────────────────────────────────────────────────────


@documents_router.post(
    "/upload/{attempt_id}/confirm/",
    response=DocumentNonPagedResponseSerializer,
    auth=_auth,
)
def confirm_upload(
    request: HttpRequest,
    attempt_id: int,
    soft_warning_override: bool = Form(False),
):
    """
    Promote a validated UploadAttempt to a live Document.

    - If the attempt's validation_status is PASSED: proceed unconditionally.
    - If SOFT_WARNING: only proceed when soft_warning_override=True.
    - If HARD_REJECT or PENDING: reject with an explanatory message.
    - If already PROMOTED: return the existing document (idempotent).
    """
    try:
        attempt = UploadAttempt.objects.select_related(
            "warehouse", "uploader"
        ).filter(pk=attempt_id).first()

        if attempt is None:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Upload attempt not found")
            )

        # Scope: only the uploader or superuser may confirm
        if not request.user.is_superuser and attempt.uploader_id != request.user.pk:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(0, "Forbidden")
            )

        if attempt.validation_status == UploadAttemptStatus.PROMOTED:
            # Idempotent — return existing document
            doc = attempt.promoted_document
            _attach_transitions(doc)
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(1, "Already promoted"),
                data=DocumentTableSerializer.model_validate(doc),
            )

        if attempt.validation_status == UploadAttemptStatus.HARD_REJECT:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(
                    0, "Document failed validation and cannot be promoted"
                )
            )

        if attempt.validation_status == UploadAttemptStatus.PENDING:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(
                    0, "Validation is still in progress — wait for the stream to emit 'complete'"
                )
            )

        if (
            attempt.validation_status == UploadAttemptStatus.SOFT_WARNING
            and not soft_warning_override
        ):
            warnings = attempt.validation_warnings or []
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(
                    0,
                    f"Validation warnings: {warnings}. Re-submit with softWarningOverride=true to accept.",
                )
            )

        type_def = get_document_type(attempt.document_type_id)
        if type_def is None:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(
                    0, f"Unknown document type '{attempt.document_type_id}'"
                )
            )

        with transaction.atomic():
            document = Document.objects.create(
                warehouse=attempt.warehouse,
                uploader=attempt.uploader,
                document_type_id=attempt.document_type_id,
                title=attempt.title,
                file=attempt.staged_file,
                status=type_def.initial_state,
                created_by=request.user,
            )

            attempt.promoted_document = document
            attempt.validation_status = UploadAttemptStatus.PROMOTED
            attempt.save(
                update_fields=[
                    "promoted_document",
                    "validation_status",
                    "updated_date",
                ]
            )

        # Kick off the Stage-1 AI pre-review chain so the document arrives
        # at staff review with classification, fields, summary, and embedding
        # already populated.
        try:
            from wdms_ai_pipeline.tasks import trigger_ai_pre_review
            trigger_ai_pre_review(document.pk)
        except Exception as ai_exc:
            logger.error(
                f"trigger_ai_pre_review failed for doc={document.pk}: {ai_exc}"
            )

        logger.info(
            f"Document confirmed: id={document.pk} type={attempt.document_type_id} "
            f"status={document.status} by={request.user.username}"
        )

        _attach_transitions(document)
        return DocumentNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, "Document created"),
            data=DocumentTableSerializer.model_validate(document),
        )

    except Exception as e:
        logger.error(f"confirm_upload error: {e}")
        return DocumentNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


# ──────────────────────────────────────────────────────────────────────────────
# Transition (FSM)
# ──────────────────────────────────────────────────────────────────────────────


@documents_router.post(
    "/{document_id}/transition/",
    response=DocumentNonPagedResponseSerializer,
    auth=_auth,
)
def transition_document(
    request: HttpRequest,
    document_id: int,
    input: TransitionActionInputSerializer,
):
    """
    Move a document through the FSM. All validation (role, state, reason) lives
    inside FSMEngine.execute_transition; the view enforces only tenant scoping.
    """
    try:
        scoped = _scope_documents_for_user(request)
        document = scoped.filter(pk=document_id).first()
        if document is None:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Document not found")
            )

        engine = FSMEngine()
        result = engine.execute_transition(
            document=document,
            user=request.user,
            action=input.action,
            reason=input.reason or "",
            edited_fields=input.edited_fields or {},
            ai_corrections=input.ai_corrections or {},
        )

        if not result.success:
            # Business-rule failure — not allowed / reason missing / etc.
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(0, result.message)
            )

        # Re-fetch via the scoped queryset so the returned payload reflects
        # the post-transition state with fresh related rows.
        fresh = _scope_documents_for_user(request).filter(pk=document.pk).first()
        _attach_transitions(fresh)
        return DocumentNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, result.message),
            data=DocumentTableSerializer.model_validate(fresh),
        )

    except Exception as e:
        logger.error(f"Transition error doc={document_id}: {e}")
        return DocumentNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


# ──────────────────────────────────────────────────────────────────────────────
# List + detail (tenant-scoped)
# ──────────────────────────────────────────────────────────────────────────────


@documents_router.get(
    "/",
    response=DocumentPagedResponseSerializer,
    auth=_auth,
)
def list_documents(
    request: HttpRequest,
    filtering: Query[DocumentFilteringSerializer] = None,
):
    try:
        queryset = _scope_documents_for_user(request)

        if filtering:
            if filtering.status:
                queryset = queryset.filter(status=filtering.status)
            if filtering.document_type_id:
                queryset = queryset.filter(
                    document_type_id=filtering.document_type_id
                )
            if filtering.uploader_id:
                queryset = queryset.filter(uploader_id=filtering.uploader_id)
            if filtering.warehouse_id:
                queryset = queryset.filter(warehouse_id=filtering.warehouse_id)

        return get_paginated_and_non_paginated_data(
            queryset, filtering, DocumentPagedResponseSerializer
        )
    except Exception as e:
        logger.error(f"List documents error: {e}")
        return DocumentPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


@documents_router.get(
    "/types/",
    response=DocumentTypesListResponseSerializer,
    auth=_auth,
)
def list_document_types(request: HttpRequest):
    """Return all document types with their full configuration."""
    try:
        payload: List[DocumentTypeMetadataSerializer] = []
        for t in get_all_document_types():
            payload.append(
                DocumentTypeMetadataSerializer(
                    id=t.id,
                    label=t.label,
                    category=t.category,
                    initial_state=t.initial_state,
                    allowed_uploader_roles=list(t.allowed_uploader_roles),
                    allowed_transitions=[dict(item) for item in t.allowed_transitions],
                    required_fields=list(t.required_fields),
                    optional_fields=list(t.optional_fields),
                    file_formats=list(t.file_formats),
                    validation_rules=dict(t.validation_rules),
                    classification_hints=list(t.classification_hints),
                )
            )
        return DocumentTypesListResponseSerializer(
            response=ResponseObject.get_response(1),
            data=payload,
        )
    except Exception as e:
        logger.error(f"List document types error: {e}")
        return DocumentTypesListResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


@documents_router.get(
    "/{document_id}/",
    response=DocumentNonPagedResponseSerializer,
    auth=_auth,
)
def get_document(request: HttpRequest, document_id: int):
    try:
        scoped = _scope_documents_for_user(request)
        document = scoped.filter(pk=document_id).first()
        if document is None:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Document not found")
            )
        _attach_transitions(document)
        return DocumentNonPagedResponseSerializer(
            response=ResponseObject.get_response(1),
            data=DocumentTableSerializer.model_validate(document),
        )
    except Exception as e:
        logger.error(f"Get document error id={document_id}: {e}")
        return DocumentNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


@documents_router.get(
    "/{document_id}/transitions/",
    response=AllowedTransitionsResponseSerializer,
    auth=_auth,
)
def get_document_transitions(request: HttpRequest, document_id: int):
    """Return the list of actions the calling user can perform on this document."""
    try:
        scoped = _scope_documents_for_user(request)
        document = scoped.filter(pk=document_id).first()
        if document is None:
            return AllowedTransitionsResponseSerializer(
                response=ResponseObject.get_response(3, "Document not found")
            )

        engine = FSMEngine()
        allowed = engine.get_allowed_transitions(document, request.user)
        payload = [
            AllowedTransitionSerializer(
                from_state=t.from_state,
                to_state=t.to_state,
                action=t.action,
                required_role=t.required_role,
                reason_required=t.reason_required,
            )
            for t in allowed
        ]
        return AllowedTransitionsResponseSerializer(
            response=ResponseObject.get_response(1),
            data=payload,
        )
    except Exception as e:
        logger.error(f"Get transitions error doc={document_id}: {e}")
        return AllowedTransitionsResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


# ──────────────────────────────────────────────────────────────────────────────
# Phase 4 — reclassification, AI-correction, and search
# ──────────────────────────────────────────────────────────────────────────────


def _staff_or_above(role: Optional[str]) -> bool:
    return role in ("STAFF", "MANAGER", "CEO", "ADMIN")


@documents_router.post(
    "/{document_id}/reclassify/",
    response=DocumentNonPagedResponseSerializer,
    auth=_auth,
)
def reclassify_document(
    request: HttpRequest,
    document_id: int,
    payload: ReclassifyInputSerializer,
):
    """
    Staff-initiated reclassification.

    Replaces the document's ai_classification with ``new_type_id``, records
    the change in a WorkflowTransition (ai_corrections preserves what the
    AI originally said), and re-runs extraction → review → embedding so the
    UI repopulates within a few seconds.
    """
    try:
        scoped = _scope_documents_for_user(request)
        document = scoped.filter(pk=document_id).first()
        if document is None:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Document not found")
            )

        role = _get_user_role(request.user)
        if not request.user.is_superuser and not _staff_or_above(role):
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(
                    0, "Only staff or above may reclassify"
                )
            )

        from wdms_documents.fsm.types import get_document_type
        if get_document_type(payload.new_type_id) is None:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(
                    0, f"Unknown document type '{payload.new_type_id}'"
                )
            )

        old_type = document.ai_classification or document.document_type_id
        if old_type == payload.new_type_id:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(
                    0, f"Document is already classified as '{payload.new_type_id}'"
                )
            )

        # Audit row — store the AI's previous classification + extracted fields
        # in ai_corrections so we never lose what the model originally said.
        with transaction.atomic():
            WorkflowTransition.objects.create(
                document=document,
                from_status=document.status,
                to_status=document.status,
                actor=request.user,
                action="reclassify",
                reason=payload.reason or "",
                edited_fields={
                    "ai_classification": payload.new_type_id,
                },
                ai_corrections={
                    "previous_classification": old_type,
                    "previous_extracted_fields": dict(
                        document.ai_extracted_fields or {}
                    ),
                },
                created_by=request.user,
            )

            from wdms_ai_pipeline.tasks import trigger_reclassification
            trigger_reclassification(document.pk, payload.new_type_id)

        # Reflect the new classification immediately so the response shows it.
        document.ai_classification = payload.new_type_id
        _attach_transitions(document)
        return DocumentNonPagedResponseSerializer(
            response=ResponseObject.get_response(
                1,
                "Reclassification recorded; extraction + review re-running",
            ),
            data=DocumentTableSerializer.model_validate(document),
        )

    except Exception as e:
        logger.error(f"Reclassify error doc={document_id}: {e}")
        return DocumentNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


@documents_router.post(
    "/{document_id}/correct-ai/",
    response=DocumentNonPagedResponseSerializer,
    auth=_auth,
)
def correct_ai_fields(
    request: HttpRequest,
    document_id: int,
    payload: CorrectAIInputSerializer,
):
    """
    Save reviewer corrections to ai_extracted_fields without re-running
    extraction. The original AI values are preserved in the
    WorkflowTransition.ai_corrections audit field.
    """
    try:
        scoped = _scope_documents_for_user(request)
        document = scoped.filter(pk=document_id).first()
        if document is None:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Document not found")
            )

        role = _get_user_role(request.user)
        if not request.user.is_superuser and not _staff_or_above(role):
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(
                    0, "Only staff or above may correct AI fields"
                )
            )

        if not isinstance(payload.corrections, dict) or not payload.corrections:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(
                    0, "corrections must be a non-empty object"
                )
            )

        existing_fields = dict(document.ai_extracted_fields or {})
        # Snapshot only the values the user is overriding, so the audit log
        # stays small and shows exactly what changed.
        original_for_changed = {
            k: existing_fields.get(k) for k in payload.corrections.keys()
        }

        with transaction.atomic():
            existing_fields.update(payload.corrections)
            document.ai_extracted_fields = existing_fields
            document.save(
                update_fields=["ai_extracted_fields", "updated_date"]
            )

            WorkflowTransition.objects.create(
                document=document,
                from_status=document.status,
                to_status=document.status,
                actor=request.user,
                action="correct_ai",
                reason=payload.reason or "",
                edited_fields=dict(payload.corrections),
                ai_corrections=original_for_changed,
                created_by=request.user,
            )

        _attach_transitions(document)
        return DocumentNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, "AI corrections saved"),
            data=DocumentTableSerializer.model_validate(document),
        )

    except Exception as e:
        logger.error(f"Correct AI error doc={document_id}: {e}")
        return DocumentNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


def _looks_like_keyword(query: str) -> bool:
    """Heuristic: short phrase with no sentence-like structure → keyword search."""
    q = (query or "").strip()
    if not q:
        return True
    word_count = len(q.split())
    if word_count >= 5:
        return False
    if "?" in q:
        return False
    # No sentence punctuation and short → treat as keyword.
    return True


@documents_router.post(
    "/search/",
    response=SearchResponseSerializer,
    auth=_auth,
)
def search_documents(
    request: HttpRequest,
    payload: SearchInputSerializer,
):
    """
    Role-scoped search across documents.

    Modes:
      - keyword:  PostgreSQL full-text search using the 'simple' configuration
                  (the corpus mixes Swahili and English; the English stemmer
                  would mangle Swahili words).
      - semantic: embed the query via the embedding service, then order by
                  pgvector cosine distance. Top 20.
      - auto:     pick keyword for short phrases, semantic for longer queries.
    """
    try:
        scoped = _scope_documents_for_user(request)

        query = (payload.query or "").strip()
        if not query:
            return SearchResponseSerializer(
                response=ResponseObject.get_response(0, "query is required"),
            )

        mode = (payload.type or "auto").lower()
        detected = False
        if mode not in ("keyword", "semantic", "auto"):
            return SearchResponseSerializer(
                response=ResponseObject.get_response(
                    0, "type must be one of keyword, semantic, auto"
                )
            )

        if mode == "auto":
            detected = True
            mode = "keyword" if _looks_like_keyword(query) else "semantic"

        if mode == "keyword":
            from django.contrib.postgres.search import (
                SearchQuery,
                SearchRank,
                SearchVector,
            )

            vector = SearchVector(
                "title", "extracted_text", config="simple"
            )
            search_q = SearchQuery(query, config="simple")
            qs = (
                scoped.annotate(
                    search=vector,
                    rank=SearchRank(vector, search_q),
                )
                .filter(search=search_q)
                .order_by("-rank")[:20]
            )
            results = []
            for doc in qs:
                snippet = (doc.extracted_text or "")[:240]
                results.append(
                    SearchHitSerializer(
                        id=doc.pk,
                        title=doc.title,
                        document_type_id=doc.document_type_id,
                        status=doc.status,
                        warehouse_name=doc.warehouse.name if doc.warehouse else "",
                        snippet=snippet,
                        score=float(getattr(doc, "rank", 0.0) or 0.0),
                    )
                )

        else:  # semantic
            from pgvector.django import CosineDistance

            from wdms_ai_pipeline.services.registry import get_service_registry

            services = get_service_registry()
            query_vector = services.embedding.embed(query)

            qs = (
                scoped.exclude(embedding__isnull=True)
                .annotate(distance=CosineDistance("embedding", query_vector))
                .order_by("distance")[:20]
            )
            results = []
            for doc in qs:
                snippet = (doc.ai_summary or doc.extracted_text or "")[:240]
                # Cosine distance ∈ [0, 2]; convert to a rough similarity score.
                distance = float(getattr(doc, "distance", 1.0) or 1.0)
                score = max(0.0, 1.0 - distance)
                results.append(
                    SearchHitSerializer(
                        id=doc.pk,
                        title=doc.title,
                        document_type_id=doc.document_type_id,
                        status=doc.status,
                        warehouse_name=doc.warehouse.name if doc.warehouse else "",
                        snippet=snippet,
                        score=score,
                    )
                )

        return SearchResponseSerializer(
            response=ResponseObject.get_response(1),
            data=SearchResponseDataSerializer(
                mode=mode,
                detected=detected,
                results=results,
            ),
        )

    except Exception as e:
        logger.error(f"Search error: {e}")
        return SearchResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )
