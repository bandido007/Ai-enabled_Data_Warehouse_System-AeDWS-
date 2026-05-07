"""
Reports serializers.

Five-serializer pattern following the secured_SRS convention.
Covers WarehouseRanking for the regulator and CEO dashboards.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from wdms_utils.SharedSerializer import BaseNonPagedResponseData, BaseSchema


class ScoreComponentsSchema(BaseSchema):
    total_documents: int = 0
    approved_ratio: float = 0.0
    correction_ratio: float = 0.0
    inspection_coverage: float = 0.0
    recent_activity: float = 0.0


class ContributingFactorSchema(BaseSchema):
    type: str  # 'positive' | 'negative' | 'neutral'
    label: str


class WarehouseRankingSerializer(BaseSchema):
    id: int
    warehouse_id: int
    warehouse_name: str
    region: Optional[str] = None
    computation_date: date
    score_components: ScoreComponentsSchema
    final_score: float
    risk_category: str
    ai_explanation: str
    contributing_factors: List[ContributingFactorSchema] = []
    is_latest: bool


class WarehouseRankingResponseSerializer(BaseNonPagedResponseData):
    data: Optional[WarehouseRankingSerializer] = None
