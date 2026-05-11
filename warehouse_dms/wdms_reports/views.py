"""
Reports API views (rankings, warehouse compliance metrics).

Endpoints:
  GET  /api/v1/reports/warehouses/{id}/ranking/ → WarehouseRankingSerializer
  POST /api/v1/reports/warehouses/{id}/ranking/recompute/ → trigger compute + return new ranking
  GET  /api/v1/reports/analytics/aggregates/ → document count aggregates globally or by warehouse

Rate limiting:
  - On-demand recompute: 1 per hour per warehouse per user
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from django.core.cache import cache
from django.db.models import Count, Q, Sum
from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import Router, Query
from ninja.errors import HttpError

from wdms_documents.models import Document, DocumentStatus, UploadAttempt, UploadAttemptStatus
from wdms_reports.models import WarehouseRanking
from wdms_reports.ranking import compute_ranking
from wdms_reports.serializers import (
    WarehouseRankingResponseSerializer,
    WarehouseRankingSerializer,
)
from wdms_tenants.models import Warehouse
from wdms_tenants.querysets import get_regulator_queryset
from wdms_uaa.authorization import PermissionAuth
from wdms_utils.SharedSerializer import BaseNonPagedResponseData, BaseSchema
from wdms_utils.response import ResponseObject

logger = logging.getLogger("wdms_logger")

reports_router = Router(tags=["reports"])
_auth = PermissionAuth()


# ──────────────────────────────────────────────────────────────────────────────
# Warehouse Ranking Endpoints
# ──────────────────────────────────────────────────────────────────────────────


@reports_router.get(
    "/warehouses/{warehouse_id}/ranking/",
    response=WarehouseRankingResponseSerializer,
    auth=_auth,
)
def get_warehouse_ranking(request, warehouse_id: int):
    """
    Retrieve the latest warehouse ranking (pre-computed compliance score).
    
    Accessible by:
      - ADMIN (any warehouse)
      - REGULATOR (warehouses in their jurisdiction via get_regulator_queryset)
      - MANAGER/CEO (their own warehouse)
      - STAFF (read-only, their warehouse)
    """
    user = request.user
    warehouse = get_object_or_404(Warehouse, pk=warehouse_id, is_active=True)
    
    # Verify user can view this warehouse
    if user.is_superuser:
        pass  # ADMIN sees all
    elif hasattr(user, "regulator_profile"):
        # REGULATOR: use jurisdiction scoping
        allowed_qs = get_regulator_queryset(user)
        if not allowed_qs.filter(pk=warehouse_id).exists():
            raise HttpError(403, "Not authorized to view this warehouse")
    else:
        # Non-ADMIN, non-REGULATOR: must be manager/staff of this warehouse
        if not hasattr(user, "staff_profile") or user.staff_profile.warehouse_id != warehouse_id:
            if not hasattr(user, "manager_profile") or user.manager_profile.warehouse_id != warehouse_id:
                if not hasattr(user, "depositor_profile") or user.depositor_profile.warehouse_id != warehouse_id:
                    raise HttpError(403, "Not authorized to view this warehouse")
    
    # Get latest ranking
    ranking = WarehouseRanking.objects.filter(
        warehouse=warehouse, is_latest=True
    ).first()
    
    if ranking is None:
        raise HttpError(404, "No ranking computed yet for this warehouse")
    
    return WarehouseRankingResponseSerializer(
        response=ResponseObject.get_response(1),
        data=WarehouseRankingSerializer(
            id=ranking.id,
            warehouse_id=ranking.warehouse_id,
            warehouse_name=ranking.warehouse.name,
            region=ranking.warehouse.region.name if hasattr(ranking.warehouse, "region") and ranking.warehouse.region else None,
            computation_date=ranking.computation_date,
            score_components=ranking.score_components,
            final_score=float(ranking.final_score),
            risk_category=ranking.risk_category,
            ai_explanation=ranking.ai_explanation,
            contributing_factors=ranking.contributing_factors or [],
            is_latest=ranking.is_latest,
        ),
    )


@reports_router.post(
    "/warehouses/{warehouse_id}/ranking/recompute/",
    response=WarehouseRankingResponseSerializer,
    auth=_auth,
)
def recompute_warehouse_ranking(request, warehouse_id: int):
    """
    Trigger on-demand ranking recomputation with rate limiting (1/hour per warehouse).
    
    Only ADMIN, MANAGER, or CEO can trigger recomputes.
    """
    user = request.user
    warehouse = get_object_or_404(Warehouse, pk=warehouse_id, is_active=True)
    
    # Verify authorization (ADMIN, MANAGER of warehouse, or CEO of warehouse)
    if user.is_superuser:
        pass  # ADMIN can recompute any
    elif hasattr(user, "manager_profile") and user.manager_profile.warehouse_id == warehouse_id:
        pass  # MANAGER of this warehouse
    elif hasattr(user, "ceo_profile") and user.ceo_profile.warehouse_id == warehouse_id:
        pass  # CEO of this warehouse
    else:
        raise HttpError(403, "Not authorized to recompute ranking for this warehouse")
    
    # Rate limiting: 1 recompute per hour per warehouse per user
    cache_key = f"ranking_recompute:{warehouse_id}:{user.id}"
    last_recompute = cache.get(cache_key)
    if last_recompute is not None:
        raise HttpError(
            429,
            "Too many recompute requests. Please try again in 60 minutes.",
        )
    
    try:
        # Compute new ranking
        new_ranking = compute_ranking(warehouse)
        cache.set(cache_key, datetime.now(), timeout=3600)  # 1 hour
        
        logger.info(
            f"Ranking recomputed for warehouse={warehouse_id} by user={user.id}",
            extra={"warehouse_id": warehouse_id, "user_id": user.id},
        )
        
        return WarehouseRankingResponseSerializer(
            response=ResponseObject.get_response(1),
            data=WarehouseRankingSerializer(
                id=new_ranking.id,
                warehouse_id=new_ranking.warehouse_id,
                warehouse_name=new_ranking.warehouse.name,
                region=new_ranking.warehouse.region.name if hasattr(new_ranking.warehouse, "region") and new_ranking.warehouse.region else None,
                computation_date=new_ranking.computation_date,
                score_components=new_ranking.score_components,
                final_score=float(new_ranking.final_score),
                risk_category=new_ranking.risk_category,
                ai_explanation=new_ranking.ai_explanation,
                contributing_factors=new_ranking.contributing_factors or [],
                is_latest=new_ranking.is_latest,
            ),
        )
    except Exception as e:
        logger.error(
            f"Error recomputing ranking: {str(e)}",
            extra={"warehouse_id": warehouse_id, "error": str(e)},
        )
        raise HttpError(500, f"Failed to recompute ranking: {str(e)}")


# ──────────────────────────────────────────────────────────────────────────────
# Analytics Aggregates
# ──────────────────────────────────────────────────────────────────────────────


class AggregatesSchema(BaseSchema):
    """Analytics aggregates (document counts by status, upload attempts, etc.)."""
    total_documents: int
    approved_documents: int
    pending_documents: int
    rejected_documents: int
    correction_needed_documents: int
    total_upload_attempts: int
    passed_uploads: int
    rejected_uploads: int
    warehouses_count: int


class AggregatesResponseSchema(BaseNonPagedResponseData):
    data: Optional[AggregatesSchema] = None


@reports_router.get(
    "/analytics/aggregates/",
    response=AggregatesResponseSchema,
    auth=_auth,
)
def get_analytics_aggregates(
    request,
    warehouse_id: Optional[int] = Query(None),
):
    """
    Retrieve aggregated document and upload statistics.
    
    Scoped by:
      - ADMIN: global stats or warehouse-specific if warehouse_id provided
      - REGULATOR: stats scoped to their jurisdiction
      - MANAGER/CEO/STAFF: their warehouse only
    """
    user = request.user
    
    # Determine warehouse filter
    if user.is_superuser:
        if warehouse_id:
            warehouse_qs = Warehouse.objects.filter(pk=warehouse_id, is_active=True)
        else:
            warehouse_qs = Warehouse.objects.filter(is_active=True)
    elif hasattr(user, "regulator_profile"):
        warehouse_qs = get_regulator_queryset(user)
        if warehouse_id:
            warehouse_qs = warehouse_qs.filter(pk=warehouse_id)
    else:
        # MANAGER/CEO/STAFF/DEPOSITOR: their warehouse only
        if hasattr(user, "manager_profile"):
            warehouse_qs = Warehouse.objects.filter(
                pk=user.manager_profile.warehouse_id, is_active=True
            )
        elif hasattr(user, "ceo_profile"):
            warehouse_qs = Warehouse.objects.filter(
                pk=user.ceo_profile.warehouse_id, is_active=True
            )
        elif hasattr(user, "staff_profile"):
            warehouse_qs = Warehouse.objects.filter(
                pk=user.staff_profile.warehouse_id, is_active=True
            )
        elif hasattr(user, "depositor_profile"):
            warehouse_qs = Warehouse.objects.filter(
                pk=user.depositor_profile.warehouse_id, is_active=True
            )
        else:
            warehouse_qs = Warehouse.objects.none()
    
    warehouse_ids = list(warehouse_qs.values_list("primary_key", flat=True))
    
    # Compute aggregates
    doc_filter = Q(warehouse__primary_key__in=warehouse_ids, is_active=True)
    upload_filter = Q(warehouse__primary_key__in=warehouse_ids)
    
    docs_qs = Document.objects.filter(doc_filter)
    uploads_qs = UploadAttempt.objects.filter(upload_filter)
    
    total_docs = docs_qs.count()
    approved = docs_qs.filter(status=DocumentStatus.APPROVED).count()
    pending = docs_qs.filter(
        status__in=[
            DocumentStatus.PENDING_STAFF,
            DocumentStatus.PENDING_MANAGER,
            DocumentStatus.PENDING_CEO,
        ]
    ).count()
    rejected = docs_qs.filter(status=DocumentStatus.REJECTED).count()
    correction = docs_qs.filter(status=DocumentStatus.CORRECTION_NEEDED).count()
    
    total_uploads = uploads_qs.count()
    passed_uploads = uploads_qs.filter(
        validation_status__in=[
            UploadAttemptStatus.PASSED,
            UploadAttemptStatus.PROMOTED,
        ]
    ).count()
    rejected_uploads = uploads_qs.filter(
        validation_status__in=[
            UploadAttemptStatus.HARD_REJECT,
        ]
    ).count()
    
    return AggregatesResponseSchema(
        response=ResponseObject.get_response(1),
        data=AggregatesSchema(
            total_documents=total_docs,
            approved_documents=approved,
            pending_documents=pending,
            rejected_documents=rejected,
            correction_needed_documents=correction,
            total_upload_attempts=total_uploads,
            passed_uploads=passed_uploads,
            rejected_uploads=rejected_uploads,
            warehouses_count=len(warehouse_ids),
        ),
    )
