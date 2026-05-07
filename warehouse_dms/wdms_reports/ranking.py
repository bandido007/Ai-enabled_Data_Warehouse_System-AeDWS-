"""
Warehouse ranking computation.

Rule-based scoring engine that produces a 0-100 compliance score for a
warehouse and derives a risk category (LOW / MEDIUM / HIGH).  The results
are persisted as a `WarehouseRanking` row, and the previous latest row for
the same warehouse has its is_latest flag cleared atomically.

Scoring formula (total 100 points):
  - Approval ratio  (approved / total docs)               : 40 pts
  - Low correction rate (1 - correction_ratio)            : 25 pts
  - Inspection coverage (inspection forms count > 0)      : 20 pts
  - Recent activity  (document in last 30 days)           : 15 pts
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Count, Max, Q

from wdms_documents.models import Document, DocumentStatus
from wdms_reports.models import RiskCategory, WarehouseRanking
from wdms_tenants.models import Warehouse

logger = logging.getLogger("wdms_logger")


def _score_components(warehouse: Warehouse) -> dict:
    """Compute the raw scoring components for one warehouse."""
    docs_qs = Document.objects.filter(warehouse=warehouse, is_active=True)
    total = docs_qs.count()

    if total == 0:
        return {
            "total_documents": 0,
            "approved_ratio": 0.0,
            "correction_ratio": 0.0,
            "inspection_coverage": 0.0,
            "recent_activity": 0.0,
        }

    approved = docs_qs.filter(status=DocumentStatus.APPROVED).count()
    corrections = docs_qs.filter(status=DocumentStatus.CORRECTION_NEEDED).count()
    inspections = docs_qs.filter(document_type_id="inspection_form").count()

    thirty_days_ago = date.today() - timedelta(days=30)
    recent = docs_qs.filter(created_date__gte=thirty_days_ago).exists()

    return {
        "total_documents": total,
        "approved_ratio": round(approved / total, 4),
        "correction_ratio": round(corrections / total, 4),
        "inspection_coverage": 1.0 if inspections > 0 else 0.0,
        "recent_activity": 1.0 if recent else 0.0,
    }


def _derive_score(components: dict) -> float:
    """Turn raw components into a 0-100 float score."""
    score = (
        components["approved_ratio"] * 40
        + (1 - components["correction_ratio"]) * 25
        + components["inspection_coverage"] * 20
        + components["recent_activity"] * 15
    )
    return round(score, 2)


def _derive_risk(score: float) -> str:
    if score >= 70:
        return RiskCategory.LOW
    if score >= 40:
        return RiskCategory.MEDIUM
    return RiskCategory.HIGH


def _contributing_factors(components: dict, score: float) -> list:
    """Return a human-readable list of the top contributing factors."""
    factors: list[dict] = []

    if components["approved_ratio"] >= 0.75:
        factors.append({"type": "positive", "label": "High document approval rate"})
    elif components["approved_ratio"] < 0.4:
        factors.append({"type": "negative", "label": "Low document approval rate"})

    if components["correction_ratio"] > 0.2:
        factors.append({"type": "negative", "label": "High correction request rate"})

    if components["inspection_coverage"] == 1.0:
        factors.append({"type": "positive", "label": "Inspection report on file"})
    else:
        factors.append({"type": "negative", "label": "No inspection report found"})

    if components["recent_activity"] == 1.0:
        factors.append({"type": "positive", "label": "Active submissions in last 30 days"})
    else:
        factors.append({"type": "neutral", "label": "No recent document activity"})

    if components["total_documents"] == 0:
        factors.append({"type": "negative", "label": "No documents submitted yet"})

    return factors


def compute_ranking(warehouse: Warehouse) -> WarehouseRanking:
    """
    Compute and persist a new WarehouseRanking for the given warehouse.

    The previous latest ranking has its is_latest flag cleared in the same
    atomic transaction so queries for is_latest=True always return exactly
    one row per warehouse.
    """
    components = _score_components(warehouse)
    score = _derive_score(components)
    risk = _derive_risk(score)
    factors = _contributing_factors(components, score)

    explanation = (
        f"Warehouse '{warehouse.name}' achieved a compliance score of "
        f"{score:.1f}/100 (risk: {risk}). "
        f"Approval rate: {components['approved_ratio'] * 100:.0f}%, "
        f"correction rate: {components['correction_ratio'] * 100:.0f}%, "
        f"inspection coverage: {'yes' if components['inspection_coverage'] else 'no'}, "
        f"recent activity: {'yes' if components['recent_activity'] else 'no'}."
    )

    with transaction.atomic():
        # Clear previous latest flag for this warehouse
        WarehouseRanking.objects.filter(
            warehouse=warehouse, is_latest=True
        ).update(is_latest=False)

        ranking = WarehouseRanking.objects.create(
            warehouse=warehouse,
            score_components=components,
            final_score=score,
            risk_category=risk,
            ai_explanation=explanation,
            contributing_factors=factors,
            is_latest=True,
        )

    logger.info(
        "Ranking computed for warehouse %s: score=%.2f risk=%s",
        warehouse.id,
        score,
        risk,
    )
    return ranking
