"""
Regulatory API endpoints.

Routes mounted at /api/v1/regulatory/ in wdms_api_v1.py.

Endpoints:
  GET /warehouses/{warehouse_id}/statistics/
        Return aggregated statistics for a warehouse in the regulator's jurisdiction.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

from django.db.models import Count, Max
from django.http import HttpRequest
from ninja import Router

from wdms_documents.models import Document, DocumentStatus, WorkflowTransition
from wdms_regulatory.serializers import (
    WarehouseStatisticsResponseSerializer,
    WarehouseStatisticsSerializer,
)
from wdms_tenants.models import Warehouse
from wdms_tenants.querysets import get_regulator_queryset
from wdms_uaa.authorization import PermissionAuth
from wdms_uaa.models import UsersWithRoles
from wdms_utils.response import ResponseObject

logger = logging.getLogger("wdms_logger")

regulatory_router = Router()

# Any authenticated user — role check is enforced explicitly inside handlers
# because the REGULATOR role is not yet mapped to a named permission code.
_auth = PermissionAuth()


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────


def _get_user_role(user) -> Optional[str]:
    """Return the user's primary role name, or None if no role is assigned."""
    ur = (
        UsersWithRoles.objects.filter(user_with_role_user=user, is_active=True)
        .select_related("user_with_role_role")
        .first()
    )
    return ur.user_with_role_role.name if ur else None


# ──────────────────────────────────────────────────────────────────────────────
# Warehouse statistics
# ──────────────────────────────────────────────────────────────────────────────


@regulatory_router.get(
    "/warehouses/{warehouse_id}/statistics/",
    response=WarehouseStatisticsResponseSerializer,
    auth=_auth,
)
def get_warehouse_statistics(request: HttpRequest, warehouse_id: int):
    """
    Return aggregated statistics for a single warehouse.

    Access is restricted to REGULATOR and ADMIN roles.  A REGULATOR may only
    access warehouses that fall within their jurisdiction; any warehouse
    outside that scope returns a business-failure response rather than 403 so
    the response shape stays consistent with the standard envelope.

    Ranking fields come from the latest WarehouseRanking row. If none exists
    yet, the rule-based ranking engine computes one on demand.
    """
    try:
        role = _get_user_role(request.user)
        if not request.user.is_superuser and role not in ("REGULATOR", "ADMIN"):
            return WarehouseStatisticsResponseSerializer(
                response=ResponseObject.get_response(
                    0, "Only regulators may access this endpoint"
                )
            )

        # Warehouse existence check — return 'not found' shape if absent
        try:
            warehouse = Warehouse.objects.select_related("region").get(
                pk=warehouse_id, is_active=True
            )
        except Warehouse.DoesNotExist:
            return WarehouseStatisticsResponseSerializer(
                response=ResponseObject.get_response(3, "Warehouse not found")
            )

        # Jurisdiction check — superusers bypass, regulators must be in scope
        if not request.user.is_superuser:
            scoped_ids = set(
                get_regulator_queryset(request.user).values_list("pk", flat=True)
            )
            if warehouse_id not in scoped_ids:
                return WarehouseStatisticsResponseSerializer(
                    response=ResponseObject.get_response(
                        0, "Warehouse not in your jurisdiction"
                    )
                )

        # ── Document counts ───────────────────────────────────────────────────
        docs_qs = Document.objects.filter(warehouse=warehouse, is_active=True)

        # Initialise every status at 0 so the frontend always gets a complete map
        status_counts: dict = {s.value: 0 for s in DocumentStatus}
        for row in docs_qs.values("status").annotate(count=Count("pk")):
            status_counts[row["status"]] = row["count"]

        total_documents = sum(status_counts.values())
        approved_documents = status_counts.get(DocumentStatus.APPROVED, 0)
        rejected_documents = status_counts.get(DocumentStatus.REJECTED, 0)

        # Per-type counts
        type_counts: dict = {}
        for row in docs_qs.values("document_type_id").annotate(count=Count("pk")):
            type_counts[row["document_type_id"]] = row["count"]

        inspection_forms_count = type_counts.get("inspection_form", 0)

        # Corrections requested: transitions that moved a document into
        # CORRECTION_NEEDED state, regardless of current status.
        corrections_count = WorkflowTransition.objects.filter(
            document__warehouse=warehouse,
            document__is_active=True,
            to_status=DocumentStatus.CORRECTION_NEEDED,
            is_active=True,
        ).count()

        # Last activity: most recent updated_date across all documents
        agg = docs_qs.aggregate(last_activity=Max("updated_date"))
        last_activity_at = agg.get("last_activity")

        # ── Compliance trend ──────────────────────────────────────────────────
        # Compare approved-document counts in the current 30-day window against
        # the preceding 30-day window.  Null when there is no data for either
        # window (prevents a meaningless "STABLE" on brand-new warehouses).
        today = date.today()
        thirty_days_ago = today - timedelta(days=30)
        sixty_days_ago = today - timedelta(days=60)

        recent_approved = docs_qs.filter(
            status=DocumentStatus.APPROVED,
            updated_date__gte=thirty_days_ago,
        ).count()

        previous_approved = docs_qs.filter(
            status=DocumentStatus.APPROVED,
            updated_date__gte=sixty_days_ago,
            updated_date__lt=thirty_days_ago,
        ).count()

        if recent_approved == 0 and previous_approved == 0:
            compliance_trend = None
        elif previous_approved == 0:
            # Any approvals in the recent window when there were none before is
            # unambiguously improving.
            compliance_trend = "IMPROVING"
        else:
            ratio = recent_approved / previous_approved
            if ratio >= 1.1:
                compliance_trend = "IMPROVING"
            elif ratio <= 0.9:
                compliance_trend = "DECLINING"
            else:
                compliance_trend = "STABLE"

        # ── Ranking data ──────────────────────────────────────────────────────
        current_ranking_score = None
        risk_category = None
        try:
            from wdms_reports.models import WarehouseRanking
            from wdms_reports.ranking import compute_ranking

            ranking = WarehouseRanking.objects.filter(
                warehouse=warehouse,
                is_latest=True,
                is_active=True,
            ).order_by("-created_date").first()

            if ranking is None:
                ranking = compute_ranking(warehouse)

            current_ranking_score = ranking.final_score
            risk_category = ranking.risk_category
        except Exception as ranking_exc:
            logger.warning(
                "Ranking unavailable for warehouse_id=%s: %s",
                warehouse_id,
                ranking_exc,
            )

        stats = WarehouseStatisticsSerializer(
            warehouse_id=warehouse.pk,
            warehouse_name=warehouse.name,
            region=warehouse.region.name if warehouse.region else None,
            documents_by_status=status_counts,
            total_documents=total_documents,
            approved_documents=approved_documents,
            rejected_documents=rejected_documents,
            documents_by_type=type_counts,
            inspection_forms_count=inspection_forms_count,
            corrections_requested_count=corrections_count,
            last_activity_at=last_activity_at,
            current_ranking_score=current_ranking_score,
            risk_category=risk_category,
            compliance_trend=compliance_trend,
        )

        return WarehouseStatisticsResponseSerializer(
            response=ResponseObject.get_response(1),
            data=stats,
        )

    except Exception as e:
        logger.error(
            f"get_warehouse_statistics error warehouse_id={warehouse_id}: {e}"
        )
        return WarehouseStatisticsResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )
