"""
Regulatory serializers.

Five-serializer pattern per entity following the secured_SRS convention.
Currently covers warehouse statistics for the regulator dashboard.
"""

from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional

from wdms_utils.SharedSerializer import BaseNonPagedResponseData, BaseSchema


class WarehouseStatisticsSerializer(BaseSchema):
    """
    Full statistics for a single warehouse, assembled from several aggregation
    queries.  All fields are present in every response so the frontend can
    render a complete picture without null-guarding every key.
    """

    warehouse_id: int
    warehouse_name: str
    region: Optional[str] = None

    # Document counts
    documents_by_status: Dict[str, int] = {}
    total_documents: int = 0
    approved_documents: int = 0
    rejected_documents: int = 0
    documents_by_type: Dict[str, int] = {}
    inspection_forms_count: int = 0
    corrections_requested_count: int = 0

    # Temporal
    last_activity_at: Optional[date] = None

    # Ranking — null until the WarehouseRanking model is implemented in a
    # later phase.  The frontend must treat null gracefully (show "—").
    current_ranking_score: Optional[float] = None
    risk_category: Optional[str] = None

    # Trend derived from approved-doc counts across two 30-day windows
    compliance_trend: Optional[str] = None  # 'IMPROVING' | 'STABLE' | 'DECLINING'


class WarehouseStatisticsResponseSerializer(BaseNonPagedResponseData):
    data: Optional[WarehouseStatisticsSerializer] = None
