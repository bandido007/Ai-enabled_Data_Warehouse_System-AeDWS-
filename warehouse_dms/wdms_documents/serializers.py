"""
Document Serializers (five-per-entity pattern from secured_SRS).

Per entity:
  - TableSerializer       — list/detail output shape, extends BaseSerializer
  - InputSerializer       — POST/PUT payload shape, extends BaseInputSerializer
  - FilteringSerializer   — query params for list endpoints, extends BasePagedFilteringSerializer
  - PagedResponseSerializer     — envelope wrapping List[TableSerializer]
  - NonPagedResponseSerializer  — envelope wrapping a single TableSerializer

AI fields (extracted_text, ai_classification, ai_extracted_fields,
ai_review_notes, ai_confidence_score, ai_summary, ai_keywords) are always
present on the Document table serializer so the frontend shape does not
change between phases. In Phase 2 they stay empty.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from ninja import Schema
from pydantic import model_validator

from wdms_utils.SharedSerializer import (
    BaseInputSerializer,
    BaseNonPagedResponseData,
    BasePagedFilteringSerializer,
    BasePagedResponseList,
    BaseSchema,
    BaseSerializer,
    UserResponse,
    to_camel,
)


# ──────────────────────────────────────────────────────────────────────────────
# Workflow transition (embedded in document detail responses)
# ──────────────────────────────────────────────────────────────────────────────


class WorkflowTransitionItemSerializer(BaseSchema):
    id: int
    unique_id: UUID
    from_status: str
    to_status: str
    action: str
    reason: str = ""
    actor: Optional[UserResponse] = None
    edited_fields: Dict[str, Any] = {}
    ai_corrections: Dict[str, Any] = {}
    created_date: datetime

    @model_validator(mode="before")
    @classmethod
    def flatten_actor(cls, data):
        if hasattr(data, "pk") and hasattr(data, "actor"):
            actor_user = data.actor
            actor_payload = None
            if actor_user is not None:
                actor_payload = {
                    "username": actor_user.username,
                    "first_name": actor_user.first_name,
                    "last_name": actor_user.last_name,
                }
            return {
                "id": data.pk,
                "unique_id": data.unique_id,
                "from_status": data.from_status,
                "to_status": data.to_status,
                "action": data.action,
                "reason": data.reason or "",
                "actor": actor_payload,
                "edited_fields": data.edited_fields or {},
                "ai_corrections": data.ai_corrections or {},
                "created_date": data.created_date,
            }
        return data


# ──────────────────────────────────────────────────────────────────────────────
# Document
# ──────────────────────────────────────────────────────────────────────────────


class DocumentTableSerializer(BaseSerializer):
    warehouse_id: int
    warehouse_name: str
    uploader_id: int
    uploader_username: str
    document_type_id: str
    title: str
    file_url: Optional[str] = None
    status: str
    # AI fields — empty in Phase 2, populated in Phase 4.
    extracted_text: str = ""
    ai_classification: str = ""
    ai_extracted_fields: Dict[str, Any] = {}
    ai_summary: str = ""
    ai_confidence_score: Optional[float] = None
    ai_review_notes: str = ""
    ai_keywords: List[str] = []
    # Workflow context
    soft_warning_override: bool = False
    current_correction_note: str = ""
    # Embedded transitions — populated on detail, empty on list to keep
    # list payloads small. The detail endpoint prefetches and sets these.
    transitions: List[WorkflowTransitionItemSerializer] = []

    @model_validator(mode="before")
    @classmethod
    def extract_fields(cls, data):
        if hasattr(data, "pk") and hasattr(data, "warehouse"):
            file_url = None
            raw_file = getattr(data, "file", None)
            if raw_file:
                try:
                    # When called via Django Ninja's DjangoGetter, FieldFile is already
                    # converted to its URL string by _convert_result — so we check for str.
                    if isinstance(raw_file, str):
                        file_url = raw_file or None
                    else:
                        # plain Django ORM object — FieldFile needs .url
                        file_url = raw_file.url if raw_file.name else None
                except Exception:
                    file_url = None
            created_by_user = data.created_by
            created_by_payload = None
            if created_by_user is not None:
                created_by_payload = {
                    "username": created_by_user.username,
                    "first_name": created_by_user.first_name,
                    "last_name": created_by_user.last_name,
                }
            # Transitions may be prefetched by the caller into
            # `prefetched_transitions`; otherwise leave empty.
            transitions = getattr(data, "prefetched_transitions", []) or []
            return {
                "id": data.pk,
                "unique_id": data.unique_id,
                "created_date": data.created_date,
                "updated_date": data.updated_date,
                "is_active": data.is_active,
                "created_by": created_by_payload,
                "warehouse_id": data.warehouse_id,
                "warehouse_name": data.warehouse.name if data.warehouse else "",
                "uploader_id": data.uploader_id,
                "uploader_username": data.uploader.username if data.uploader else "",
                "document_type_id": data.document_type_id,
                "title": data.title,
                "file_url": file_url,
                "status": data.status,
                "extracted_text": data.extracted_text or "",
                "ai_classification": data.ai_classification or "",
                "ai_extracted_fields": data.ai_extracted_fields or {},
                "ai_summary": data.ai_summary or "",
                "ai_confidence_score": data.ai_confidence_score,
                "ai_review_notes": data.ai_review_notes or "",
                "ai_keywords": list(data.ai_keywords or []),
                "soft_warning_override": data.soft_warning_override,
                "current_correction_note": data.current_correction_note or "",
                "transitions": transitions,
            }
        return data


class DocumentFilteringSerializer(BasePagedFilteringSerializer):
    status: Optional[str] = None
    document_type_id: Optional[str] = None
    uploader_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    search_term: Optional[str] = None


class DocumentPagedResponseSerializer(BasePagedResponseList):
    data: Optional[List[DocumentTableSerializer]] = None


class DocumentNonPagedResponseSerializer(BaseNonPagedResponseData):
    data: Optional[DocumentTableSerializer] = None


# Transition action payload (for POST /documents/{id}/transition/)
class TransitionActionInputSerializer(BaseSchema):
    action: str
    reason: str = ""
    edited_fields: Dict[str, Any] = {}
    ai_corrections: Dict[str, Any] = {}


# Form-fill payload (for POST /documents/form-fill/)
class FormFillInputSerializer(BaseSchema):
    document_type_id: str
    warehouse_id: int
    title: str
    fields: Dict[str, Any] = {}


# Allowed-transitions list response (for GET /documents/{id}/transitions/)
class AllowedTransitionSerializer(BaseSchema):
    from_state: str
    to_state: str
    action: str
    required_role: str
    reason_required: bool


class AllowedTransitionsResponseSerializer(BaseNonPagedResponseData):
    data: Optional[List[AllowedTransitionSerializer]] = None


# ──────────────────────────────────────────────────────────────────────────────
# Document type metadata (GET /documents/types/)
# ──────────────────────────────────────────────────────────────────────────────


class DocumentTypeTransitionSerializer(BaseSchema):
    from_state: str
    to_state: str
    required_role: str
    action: str
    reason_required: bool = False


class DocumentTypeValidationRulesSerializer(BaseSchema):
    min_ocr_confidence: Optional[float] = None
    require_signature: Optional[bool] = None
    require_stamp: Optional[bool] = None
    require_date: Optional[bool] = None


class DocumentTypeMetadataSerializer(BaseSchema):
    id: str
    label: str
    form_number: str = ""
    category: str
    initial_state: str
    allowed_uploader_roles: List[str]
    allowed_transitions: List[DocumentTypeTransitionSerializer]
    required_fields: List[str]
    optional_fields: List[str] = []
    file_formats: List[str]
    validation_rules: DocumentTypeValidationRulesSerializer
    classification_hints: List[str]


class DocumentTypesListResponseSerializer(BaseNonPagedResponseData):
    data: Optional[List[DocumentTypeMetadataSerializer]] = None


# ──────────────────────────────────────────────────────────────────────────────
# Phase 4 — reclassification, AI correction, and search
# ──────────────────────────────────────────────────────────────────────────────


class ReclassifyInputSerializer(BaseSchema):
    new_type_id: str
    reason: str = ""


class CorrectAIInputSerializer(BaseSchema):
    corrections: Dict[str, Any]
    reason: str = ""


class SearchInputSerializer(BaseSchema):
    query: str
    type: str = "auto"  # 'keyword' | 'semantic' | 'auto'


class SearchHitSerializer(BaseSchema):
    id: int
    title: str
    document_type_id: str
    status: str
    warehouse_name: str = ""
    snippet: str = ""
    score: Optional[float] = None


class SearchResponseDataSerializer(BaseSchema):
    mode: str  # 'keyword' or 'semantic' (the actual mode used)
    detected: bool = False  # true when 'auto' picked a mode
    results: List[SearchHitSerializer] = []


class SearchResponseSerializer(BaseNonPagedResponseData):
    data: Optional[SearchResponseDataSerializer] = None


# ──────────────────────────────────────────────────────────────────────────────
# Bulk transitions — POST /documents/transitions/bulk/
# ──────────────────────────────────────────────────────────────────────────────


class BulkTransitionsInputSerializer(BaseSchema):
    document_ids: List[int]


class BulkTransitionsResponseSerializer(BaseNonPagedResponseData):
    data: Optional[Dict[str, List[AllowedTransitionSerializer]]] = None


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard statistics — GET /documents/stats/
# ──────────────────────────────────────────────────────────────────────────────


class RecentActivityItemSerializer(BaseSchema):
    document_id: int
    document_title: str
    action: str
    from_status: str
    to_status: str
    actor_name: str
    created_date: datetime


class DocumentStatsSerializer(BaseSchema):
    status_counts: Dict[str, int]
    approved_this_week: int
    rejected_this_week: int
    avg_approval_hours: Optional[float]
    recent_activity: List[RecentActivityItemSerializer]


class DocumentStatsResponseSerializer(BaseNonPagedResponseData):
    data: Optional[DocumentStatsSerializer] = None

# ──────────────────────────────────────────────────────────────────────────────
# Form validation (AI review before submit)
# ──────────────────────────────────────────────────────────────────────────────


class FormValidationInputSerializer(BaseInputSerializer):
    """Request to validate form fields before submission."""
    fields: Dict[str, Any] = {}


class FormValidationDraftInputSerializer(BaseInputSerializer):
    """Request to validate form fields before creating document (draft mode)."""
    document_type_id: str
    fields: Dict[str, Any] = {}


class FormValidationResultSerializer(BaseSchema):
    """AI validation result for form submission."""
    confidence: float  # 0.0 to 1.0
    verdict: str  # "PASS", "SOFT_WARNING", "HARD_REJECT"
    issues: List[str] = []  # Problems found
    recommendations: List[str] = []  # Suggested fixes
    warnings: List[str] = []  # Additional context


class FormValidationResponseSerializer(BaseNonPagedResponseData):
    data: Optional[FormValidationResultSerializer] = None
