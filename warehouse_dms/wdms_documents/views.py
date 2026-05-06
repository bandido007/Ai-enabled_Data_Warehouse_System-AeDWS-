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
    BulkTransitionsInputSerializer,
    BulkTransitionsResponseSerializer,
    CorrectAIInputSerializer,
    DocumentFilteringSerializer,
    DocumentNonPagedResponseSerializer,
    DocumentPagedResponseSerializer,
    DocumentStatsResponseSerializer,
    DocumentStatsSerializer,
    DocumentTableSerializer,
    DocumentTypeMetadataSerializer,
    DocumentTypesListResponseSerializer,
    FormFillInputSerializer,
    FormValidationDraftInputSerializer,
    FormValidationInputSerializer,
    FormValidationResponseSerializer,
    ReclassifyInputSerializer,
    RecentActivityItemSerializer,
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
        # Own uploads always visible; also APPROVED docs issued to depositors
        # (e.g. warehouse receipts, quality certificates) visible within their warehouse.
        warehouse = _user_warehouse(user)
        depositor_visible_types = [
            dt.id for dt in get_all_document_types()
            if "DEPOSITOR" in dt.viewer_roles
        ]
        own_uploads = Q(uploader=user)
        if warehouse and depositor_visible_types:
            issued_to_depositor = Q(
                status="APPROVED",
                document_type_id__in=depositor_visible_types,
                warehouse=warehouse,
            )
            return base.filter(own_uploads | issued_to_depositor)
        return base.filter(own_uploads)

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

    if role == "REGULATOR":
        # Regulators see documents they uploaded (compliance reports, etc.)
        return base.filter(uploader=user)

    # Unknown role → empty queryset
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
# Form-Fill — structured in-system form submission (no file upload)
# ──────────────────────────────────────────────────────────────────────────────


@documents_router.post(
    "/form-fill/",
    response=DocumentNonPagedResponseSerializer,
    auth=_auth,
)
def form_fill(
    request: HttpRequest,
    payload: FormFillInputSerializer,
):
    """
    Create a document directly from structured form fields — no file required.

    Only available for document types whose file_formats allow it (the type
    must be listed in allowed_uploader_roles for the caller's role). The
    submitted fields are stored verbatim in ai_extracted_fields so the
    staff/manager/CEO review flow works identically to an uploaded document.
    """
    try:
        role = _get_user_role(request.user)
        if role is None:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(0, "No role assigned to this account")
            )

        type_def = get_document_type(payload.document_type_id)
        if type_def is None:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(0, f"Unknown document type '{payload.document_type_id}'")
            )

        if role not in type_def.allowed_uploader_roles:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(
                    0,
                    f"Your role ({role}) is not allowed to submit '{payload.document_type_id}' forms. "
                    f"Allowed roles: {type_def.allowed_uploader_roles}",
                )
            )

        # Validate required fields are present and non-empty
        missing = [
            f for f in type_def.required_fields
            if not payload.fields.get(f, "") and payload.fields.get(f, "") != 0
        ]
        if missing:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(
                    0, f"Missing required fields: {', '.join(missing)}"
                )
            )

        warehouse = Warehouse.objects.filter(pk=payload.warehouse_id).first()
        if warehouse is None:
            return DocumentNonPagedResponseSerializer(
                response=ResponseObject.get_response(0, "Warehouse not found")
            )

        with transaction.atomic():
            document = Document.objects.create(
                warehouse=warehouse,
                uploader=request.user,
                document_type_id=payload.document_type_id,
                title=payload.title,
                file=None,
                status=type_def.initial_state,
                ai_extracted_fields=payload.fields,
                ai_classification=payload.document_type_id,
                created_by=request.user,
            )

        logger.info(
            f"Form-fill document created: id={document.pk} "
            f"type={payload.document_type_id} by={request.user.username}"
        )

        # Kick off AI summary + embedding (skip OCR/classify — fields already set)
        try:
            from wdms_ai_pipeline.tasks import trigger_form_fill_ai_review
            trigger_form_fill_ai_review(document.pk)
        except Exception as ai_exc:
            logger.error(
                f"trigger_form_fill_ai_review failed for doc={document.pk}: {ai_exc}"
            )

        _attach_transitions(document)
        return DocumentNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, "Form submitted successfully"),
            data=DocumentTableSerializer.model_validate(document),
        )

    except Exception as e:
        logger.error(f"form_fill error: {e}")
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

        # After a resubmit with edited fields on a form-fill doc, re-run AI review
        if input.action == "resubmit" and input.edited_fields:
            try:
                from wdms_ai_pipeline.tasks import trigger_form_fill_ai_review
                trigger_form_fill_ai_review(fresh.pk)
            except Exception as ai_exc:
                logger.warning(f"AI re-review after resubmit failed for doc={fresh.pk}: {ai_exc}")

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
# Form validation — POST /{document_id}/validate-form/ OR POST /validate-form/ (draft)
# ──────────────────────────────────────────────────────────────────────────────


@documents_router.post(
    "/validate-form/",
    response=FormValidationResponseSerializer,
    auth=_auth,
)
def validate_form_draft(
    request: HttpRequest,
    input: FormValidationDraftInputSerializer,
):
    """
    AI validation of form fields BEFORE document creation (draft mode).
    
    Unlike the document-specific endpoint, this doesn't require a document ID
    and is used during initial form fill submission.
    
    Returns confidence, verdict (PASS/SOFT_WARNING/HARD_REJECT), issues,
    and recommendations.
    """
    try:
        # Get document type config
        type_def = get_document_type(input.document_type_id)
        if not type_def:
            return FormValidationResponseSerializer(
                response=ResponseObject.get_response(3, f"Unknown document type: {input.document_type_id}")
            )
        
        required_fields: List[str] = list(type_def.required_fields) if type_def else []
        validation_rules = dict(type_def.validation_rules) if type_def else {}
        
        # Validate form fields using local validator
        verdict, issues, confidence = _validate_form_fields(
            input.document_type_id,
            input.fields,
            required_fields,
            validation_rules,
        )
        
        # Generate recommendations based on issues
        recommendations = _generate_recommendations(issues)
        
        result = {
            "confidence": min(1.0, max(0.0, confidence)),
            "verdict": verdict,
            "issues": issues,
            "recommendations": recommendations,
            "warnings": issues,  # For backward compatibility
        }
        
        return FormValidationResponseSerializer(
            response=ResponseObject.get_response(1, f"Form validation completed: {verdict}"),
            data=result,
        )
    
    except Exception as e:
        logger.error(f"Form validation error: {e}")
        return FormValidationResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


@documents_router.post(
    "/{document_id}/validate-form/",
    response=FormValidationResponseSerializer,
    auth=_auth,
)
def validate_form_before_submit(
    request: HttpRequest,
    document_id: int,
    input: FormValidationInputSerializer,
):
    """
    AI validation of form fields BEFORE submission to the next approver
    (for existing documents being corrected).
    
    Returns confidence, verdict (PASS/SOFT_WARNING/HARD_REJECT), issues,
    and recommendations. User sees these results and can either fix & re-validate,
    or submit anyway (for SOFT_WARNING).
    """
    try:
        scoped = _scope_documents_for_user(request)
        document = scoped.filter(pk=document_id).first()
        if document is None:
            return FormValidationResponseSerializer(
                response=ResponseObject.get_response(3, "Document not found")
            )

        # Get document type config
        type_def = get_document_type(document.document_type_id)
        if not type_def:
            return FormValidationResponseSerializer(
                response=ResponseObject.get_response(3, f"Unknown document type: {document.document_type_id}")
            )
        
        required_fields: List[str] = list(type_def.required_fields) if type_def else []
        validation_rules = dict(type_def.validation_rules) if type_def else {}
        
        # Validate form fields using local validator
        verdict, issues, confidence = _validate_form_fields(
            document.document_type_id,
            input.fields,
            required_fields,
            validation_rules,
        )
        
        # Generate recommendations based on issues
        recommendations = _generate_recommendations(issues)
        
        result = {
            "confidence": min(1.0, max(0.0, confidence)),
            "verdict": verdict,
            "issues": issues,
            "recommendations": recommendations,
            "warnings": issues,  # For backward compatibility
        }
        
        return FormValidationResponseSerializer(
            response=ResponseObject.get_response(1, f"Form validation completed: {verdict}"),
            data=result,
        )
    
    except Exception as e:
        logger.error(f"Form validation error doc={document_id}: {e}")
        return FormValidationResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


def _validate_form_fields(
    document_type_id: str,
    fields: dict,
    required_fields: List[str],
    validation_rules: dict,
) -> tuple[str, List[str], float]:
    """
    Validate form fields against required fields and validation rules.
    
    Returns: (verdict, issues, confidence)
      - verdict: "PASS" | "SOFT_WARNING" | "HARD_REJECT"
      - issues: list of issue messages
      - confidence: float 0.0-1.0
    """
    issues = []
    warnings = []
    
    # Check required fields
    missing_required = []
    for field_name in required_fields:
        field_value = fields.get(field_name, "").strip()
        if not field_value:
            missing_required.append(field_name)
            issues.append(f"Required field '{field_name}' is empty")
    
    # Validate field formats and content
    for field_name, field_value in fields.items():
        if not field_value or not field_value.strip():
            continue
            
        # Phone validation
        if "phone" in field_name.lower() or "telephone" in field_name.lower():
            if len(field_value.replace("+", "").replace(" ", "").replace("-", "")) < 7:
                warnings.append(f"Field '{field_name}' appears to be an incomplete phone number: {field_value[:30]}")
        
        # Email validation (if field contains email)
        if "email" in field_name.lower():
            if "@" not in field_value or "." not in field_value:
                issues.append(f"Field '{field_name}' does not appear to be a valid email: {field_value[:50]}")
        
        # Date validation
        if "date" in field_name.lower():
            try:
                from datetime import datetime
                date_val = field_value.strip()
                if len(date_val) == 10:  # YYYY-MM-DD
                    parts = date_val.split("-")
                    if len(parts) == 3:
                        year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                        if year < 2000 or year > 2100 or month < 1 or month > 12 or day < 1 or day > 31:
                            warnings.append(f"Field '{field_name}' has invalid date: {field_value}")
            except (ValueError, AttributeError):
                warnings.append(f"Field '{field_name}' could not be parsed as a date: {field_value[:30]}")
        
        # Numeric fields
        if "quantity" in field_name.lower() or "amount" in field_name.lower():
            try:
                num_val = float(field_value.replace(",", "").replace("Tshs", "").strip())
                if num_val <= 0:
                    warnings.append(f"Field '{field_name}' should be a positive number, got: {field_value}")
            except (ValueError, AttributeError):
                warnings.append(f"Field '{field_name}' should be numeric, got: {field_value[:30]}")
    
    # Determine verdict
    if missing_required:
        verdict = "HARD_REJECT"
        base_confidence = 0.50
    elif issues:
        verdict = "HARD_REJECT"
        base_confidence = 0.50
    elif warnings:
        verdict = "SOFT_WARNING"
        base_confidence = 0.75
    else:
        verdict = "PASS"
        base_confidence = 0.95
    
    # Combine issues and warnings for display
    all_issues = issues + warnings
    
    return verdict, all_issues, base_confidence
    """
    Reconstruct readable form text from field dict for AI validation.
    
    Converts:
      {"name": "John Doe", "date": "2026-05-03", "amount": "1000"}
    To:
      "name: John Doe
       date: 2026-05-03
       amount: 1000"
    """
    lines = []
    for key, value in fields.items():
        if value is not None and value != "":
            # Handle nested objects
            if isinstance(value, dict):
                for subkey, subvalue in value.items():
                    lines.append(f"{key}_{subkey}: {subvalue}")
            elif isinstance(value, (list, tuple)):
                lines.append(f"{key}: {', '.join(str(v) for v in value)}")
            else:
                lines.append(f"{key}: {value}")
    return "\n".join(lines) or "(empty form)"


def _generate_recommendations(issues: List[str]) -> List[str]:
    """
    Generate actionable recommendations based on validation issues.
    """
    recommendations = []
    issues_text = " ".join(issues).lower()
    
    if "required field" in issues_text and "not found" in issues_text:
        recommendations.append("Please fill in all required fields marked with *")
    
    if "date" in issues_text:
        recommendations.append("Verify that all dates are in the correct format (e.g., YYYY-MM-DD)")
    
    if "match" in issues_text or "mismatch" in issues_text:
        recommendations.append("Check that related fields (e.g., dates) are consistent")
    
    if "number" in issues_text or "amount" in issues_text:
        recommendations.append("Verify numeric values are correct and properly formatted")
    
    if not recommendations:
        recommendations.append("Review the form and re-validate")
    
    return recommendations


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard statistics — GET /documents/stats/
# ──────────────────────────────────────────────────────────────────────────────


@documents_router.get(
    "/stats/",
    response=DocumentStatsResponseSerializer,
    auth=_auth,
)
def get_document_stats(request: HttpRequest):
    """
    Return aggregated document statistics scoped to the current user's
    tenant / warehouse / ownership (same rules as the list endpoint).

    Used by the dashboard to show real metric cards and the recent-activity
    feed without requiring the client to fetch and aggregate individual docs.
    """
    from datetime import timedelta

    from django.db.models import Avg, ExpressionWrapper, F, FloatField
    from django.utils import timezone

    try:
        scoped = _scope_documents_for_user(request)
        doc_ids = list(scoped.values_list("pk", flat=True))

        # --- Status counts ---
        from django.db.models import Count
        raw_counts = (
            scoped
            .values("status")
            .annotate(cnt=Count("pk"))
            .values_list("status", "cnt")
        )
        status_counts = {row[0]: row[1] for row in raw_counts}

        # --- This-week approved / rejected (based on when the transition happened) ---
        week_ago = timezone.now() - timedelta(days=7)
        approved_this_week = WorkflowTransition.objects.filter(
            document_id__in=doc_ids,
            to_status="APPROVED",
            created_date__gte=week_ago,
        ).count()
        rejected_this_week = WorkflowTransition.objects.filter(
            document_id__in=doc_ids,
            to_status="REJECTED",
            created_date__gte=week_ago,
        ).count()

        # --- Average approval time (doc.created_date → first APPROVED transition) ---
        avg_approval_hours = None
        try:
            from django.db.models import Min
            approval_times = (
                WorkflowTransition.objects
                .filter(document_id__in=doc_ids, to_status="APPROVED")
                .values("document_id")
                .annotate(approved_at=Min("created_date"))
            )
            # Join with document created_date to compute durations
            total_seconds = 0.0
            count = 0
            for row in approval_times:
                doc = scoped.filter(pk=row["document_id"]).first()
                if doc:
                    delta = row["approved_at"] - doc.created_date
                    total_seconds += delta.total_seconds()
                    count += 1
            if count > 0:
                avg_approval_hours = round(total_seconds / count / 3600, 2)
        except Exception:
            pass

        # --- Recent activity (last 15 transitions across all scoped docs) ---
        recent_transitions = (
            WorkflowTransition.objects
            .filter(document_id__in=doc_ids)
            .select_related("document", "actor")
            .order_by("-created_date")[:15]
        )
        recent_activity = [
            RecentActivityItemSerializer(
                document_id=t.document_id,
                document_title=getattr(t.document, "title", f"Doc #{t.document_id}"),
                action=t.action,
                from_status=t.from_status,
                to_status=t.to_status,
                actor_name=(
                    f"{t.actor.first_name} {t.actor.last_name}".strip()
                    or t.actor.username
                ) if t.actor else "System",
                created_date=t.created_date,
            )
            for t in recent_transitions
        ]

        return DocumentStatsResponseSerializer(
            response=ResponseObject.get_response(1, "OK"),
            data=DocumentStatsSerializer(
                status_counts=status_counts,
                approved_this_week=approved_this_week,
                rejected_this_week=rejected_this_week,
                avg_approval_hours=avg_approval_hours,
                recent_activity=recent_activity,
            ),
        )
    except Exception as exc:
        logger.error(f"get_document_stats error: {exc}")
        return DocumentStatsResponseSerializer(
            response=ResponseObject.get_response(2, str(exc))
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
                    form_number=t.form_number,
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


# ── Fixed-path endpoints must all be registered before /{document_id}/ to
# prevent the wildcard capturing literal path segments and returning 405. ────


@documents_router.post(
    "/transitions/bulk/",
    response=BulkTransitionsResponseSerializer,
    auth=_auth,
)
def bulk_document_transitions(
    request: HttpRequest,
    payload: BulkTransitionsInputSerializer,
):
    """
    Return the available FSM transitions for a batch of documents in one call.

    The caller supplies up to 100 document IDs.  For each ID the caller is
    allowed to see (via the standard tenant-scoping rules), the response
    maps str(document_id) → list of available transitions for the current
    user.  Documents outside the caller's scope are silently omitted — the
    frontend treats absence as "no transitions available" and never raises an
    error for unseen documents.

    Sending more than 100 IDs is rejected with a business-failure response.
    """
    try:
        if len(payload.document_ids) > 100:
            return BulkTransitionsResponseSerializer(
                response=ResponseObject.get_response(
                    0, "Maximum 100 document IDs per request"
                )
            )

        scoped = _scope_documents_for_user(request)
        documents = scoped.filter(
            pk__in=payload.document_ids, is_active=True
        ).select_related("warehouse", "uploader")

        engine = FSMEngine()
        result: dict = {}

        for document in documents:
            allowed = engine.get_allowed_transitions(document, request.user)
            result[str(document.pk)] = [
                AllowedTransitionSerializer(
                    from_state=t.from_state,
                    to_state=t.to_state,
                    action=t.action,
                    required_role=t.required_role,
                    reason_required=t.reason_required,
                )
                for t in allowed
            ]

        return BulkTransitionsResponseSerializer(
            response=ResponseObject.get_response(1),
            data=result,
        )

    except Exception as e:
        logger.error(f"bulk_document_transitions error: {e}")
        return BulkTransitionsResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


# ── Search ───────────────────────────────────────────────────────────────────

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


