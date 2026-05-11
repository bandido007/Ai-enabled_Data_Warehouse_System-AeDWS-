"""
Leave serializers.

Follows the five-schema convention used throughout the warehouse DMS:
  Input  – what the client sends
  Data   – what a single record looks like in a response
  Paged  – paginated list response
  NonPaged – single-row / non-list response
  Filter – query-string filtering
"""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from wdms_utils.SharedSerializer import (
    BaseNonPagedResponseData,
    BasePagedFilteringSerializer,
    BasePagedResponseList,
    BaseSchema,
    BaseSerializer,
)


# ── Leave balance (summary for dashboards) ────────────────────────────────────


class LeaveBalanceSerializer(BaseSchema):
    """Compact balance summary used on staff / manager / CEO dashboards."""

    employee_id: int
    employee_username: str
    employee_full_name: str
    year: int
    annual_days: int
    days_used: int
    days_remaining: int


class LeaveBalanceResponseSerializer(BaseNonPagedResponseData):
    data: Optional[LeaveBalanceSerializer] = None


# ── Leave policy ──────────────────────────────────────────────────────────────


class LeavePolicyInputSerializer(BaseSchema):
    employee_id: int
    year: int
    annual_days: int = 30


class LeavePolicyDataSerializer(BaseSerializer):
    employee_id: int
    employee_username: str
    year: int
    annual_days: int
    days_used: int
    days_remaining: int


class LeavePolicyResponseSerializer(BaseNonPagedResponseData):
    data: Optional[LeavePolicyDataSerializer] = None


class LeavePolicyListResponseSerializer(BasePagedResponseList):
    data: List[LeavePolicyDataSerializer] = []


# ── Leave application ─────────────────────────────────────────────────────────


class LeaveApplicationInputSerializer(BaseSchema):
    leave_type: str = "ANNUAL"
    start_date: date
    end_date: date
    reason: str = ""


class LeaveApplicationDataSerializer(BaseSerializer):
    applicant_id: int
    applicant_username: str
    applicant_full_name: str
    leave_type: str
    leave_type_display: str
    start_date: date
    end_date: date
    days_requested: int
    reason: str
    status: str
    status_display: str
    is_emergency: bool

    # Balance snapshot at time of application
    annual_days: int = 0
    days_used_before: int = 0
    days_remaining_before: int = 0

    # Review chain
    manager_reviewed_by_username: Optional[str] = None
    manager_review_date: Optional[date] = None
    manager_comment: str = ""
    ceo_reviewed_by_username: Optional[str] = None
    ceo_review_date: Optional[date] = None
    ceo_comment: str = ""


class LeaveApplicationResponseSerializer(BaseNonPagedResponseData):
    data: Optional[LeaveApplicationDataSerializer] = None


class LeaveApplicationListResponseSerializer(BasePagedResponseList):
    data: List[LeaveApplicationDataSerializer] = []


class LeaveApplicationFilterSerializer(BasePagedFilteringSerializer):
    status: Optional[str] = None
    leave_type: Optional[str] = None
    applicant_id: Optional[int] = None
    year: Optional[int] = None


# ── Transition / review ───────────────────────────────────────────────────────


class LeaveTransitionInputSerializer(BaseSchema):
    action: str          # "approve" | "reject" | "cancel"
    comment: str = ""
