"""
Leave API endpoints.

Mounted at /api/v1/leave/ in wdms_api_v1.py.

Endpoints
---------
GET  /leave/balance/                    → current user's balance for current year
GET  /leave/balance/{employee_id}/      → admin/manager view of any employee's balance
POST /leave/policies/                   → admin sets/overrides annual allocation
GET  /leave/applications/               → list (scoped by role)
POST /leave/applications/               → staff submits a leave application
GET  /leave/applications/{id}/          → detail
POST /leave/applications/{id}/transition/ → manager/CEO approves or rejects
DELETE /leave/applications/{id}/        → staff cancels their own pending request
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import HttpRequest
from ninja import Query, Router

from wdms_leave.models import (
    LeaveApplication,
    LeavePolicy,
    LeaveStatus,
    LeaveType,
)
from wdms_leave.serializers import (
    LeaveApplicationDataSerializer,
    LeaveApplicationFilterSerializer,
    LeaveApplicationInputSerializer,
    LeaveApplicationListResponseSerializer,
    LeaveApplicationResponseSerializer,
    LeaveBalanceResponseSerializer,
    LeaveBalanceSerializer,
    LeavePolicyDataSerializer,
    LeavePolicyInputSerializer,
    LeavePolicyResponseSerializer,
    LeaveTransitionInputSerializer,
)
from wdms_uaa.authorization import PermissionAuth
from wdms_uaa.models import UsersWithRoles
from wdms_utils.response import ResponseObject

logger = logging.getLogger("wdms_logger")
User = get_user_model()

leave_router = Router()
_auth = PermissionAuth()


# ── Role helpers ──────────────────────────────────────────────────────────────


def _get_role(user) -> Optional[str]:
    ur = (
        UsersWithRoles.objects.filter(user_with_role_user=user, is_active=True)
        .select_related("user_with_role_role")
        .first()
    )
    return ur.user_with_role_role.name if ur else None


def _is_internal_staff(user) -> bool:
    return _get_role(user) in ("STAFF", "MANAGER", "CEO", "ADMIN") or user.is_superuser


# ── Balance serialisation helper ──────────────────────────────────────────────


def _build_balance(employee: User, year: int) -> LeaveBalanceSerializer:
    policy = LeavePolicy.get_or_create_for_year(employee, year)
    return LeaveBalanceSerializer(
        employee_id=employee.pk,
        employee_username=employee.username,
        employee_full_name=employee.get_full_name() or employee.username,
        year=year,
        annual_days=policy.annual_days,
        days_used=policy.days_used,
        days_remaining=policy.days_remaining,
    )


# ── Application serialisation helper ─────────────────────────────────────────


def _build_app_data(app: LeaveApplication) -> LeaveApplicationDataSerializer:
    year = app.start_date.year
    policy = LeavePolicy.get_or_create_for_year(app.applicant, year)
    # days_used_before: approved days EXCLUDING this application itself
    days_used_excl = sum(
        a.days_requested
        for a in LeaveApplication.objects.filter(
            applicant=app.applicant,
            status__in=[LeaveStatus.MANAGER_APPROVED, LeaveStatus.CEO_APPROVED],
            start_date__year=year,
        ).exclude(pk=app.pk)
    )
    return LeaveApplicationDataSerializer(
        id=app.pk,
        unique_id=str(app.unique_id),
        created_date=app.created_date,
        updated_date=app.updated_date,
        is_active=app.is_active,
        created_by=None,
        applicant_id=app.applicant_id,
        applicant_username=app.applicant.username,
        applicant_full_name=app.applicant.get_full_name() or app.applicant.username,
        leave_type=app.leave_type,
        leave_type_display=app.get_leave_type_display(),
        start_date=app.start_date,
        end_date=app.end_date,
        days_requested=app.days_requested,
        reason=app.reason,
        status=app.status,
        status_display=app.get_status_display(),
        is_emergency=app.is_emergency,
        annual_days=policy.annual_days,
        days_used_before=days_used_excl,
        days_remaining_before=max(0, policy.annual_days - days_used_excl),
        manager_reviewed_by_username=(
            app.manager_reviewed_by.username if app.manager_reviewed_by else None
        ),
        manager_review_date=app.manager_review_date,
        manager_comment=app.manager_comment or "",
        ceo_reviewed_by_username=(
            app.ceo_reviewed_by.username if app.ceo_reviewed_by else None
        ),
        ceo_review_date=app.ceo_review_date,
        ceo_comment=app.ceo_comment or "",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Balance endpoints
# ─────────────────────────────────────────────────────────────────────────────


@leave_router.get(
    "/balance/",
    response=LeaveBalanceResponseSerializer,
    auth=_auth,
    summary="My leave balance for the current year",
)
def my_balance(request: HttpRequest):
    try:
        if not _is_internal_staff(request.user):
            return LeaveBalanceResponseSerializer(
                response=ResponseObject.get_response(0, "Only staff members can view leave balance.")
            )
        balance = _build_balance(request.user, date.today().year)
        return LeaveBalanceResponseSerializer(
            response=ResponseObject.get_response(1),
            data=balance,
        )
    except Exception as exc:
        logger.error(f"my_balance error: {exc}")
        return LeaveBalanceResponseSerializer(
            response=ResponseObject.get_response(2, str(exc))
        )


@leave_router.get(
    "/balance/{employee_id}/",
    response=LeaveBalanceResponseSerializer,
    auth=_auth,
    summary="Get leave balance for a specific employee (Manager / CEO / Admin only)",
)
def employee_balance(request: HttpRequest, employee_id: int, year: Optional[int] = None):
    try:
        role = _get_role(request.user)
        if not request.user.is_superuser and role not in ("MANAGER", "CEO", "ADMIN"):
            return LeaveBalanceResponseSerializer(
                response=ResponseObject.get_response(0, "Insufficient permissions.")
            )
        employee = User.objects.filter(pk=employee_id, is_active=True).first()
        if not employee:
            return LeaveBalanceResponseSerializer(
                response=ResponseObject.get_response(3, "Employee not found.")
            )
        balance = _build_balance(employee, year or date.today().year)
        return LeaveBalanceResponseSerializer(
            response=ResponseObject.get_response(1),
            data=balance,
        )
    except Exception as exc:
        logger.error(f"employee_balance error: {exc}")
        return LeaveBalanceResponseSerializer(
            response=ResponseObject.get_response(2, str(exc))
        )


# ─────────────────────────────────────────────────────────────────────────────
# Leave Policy endpoints (Admin / Manager)
# ─────────────────────────────────────────────────────────────────────────────


@leave_router.post(
    "/policies/",
    response=LeavePolicyResponseSerializer,
    auth=_auth,
    summary="Set / override annual leave allocation for an employee",
)
def set_leave_policy(request: HttpRequest, payload: LeavePolicyInputSerializer):
    try:
        role = _get_role(request.user)
        if not request.user.is_superuser and role not in ("MANAGER", "CEO", "ADMIN"):
            return LeavePolicyResponseSerializer(
                response=ResponseObject.get_response(0, "Only Managers, CEOs or Admins can set leave policies.")
            )
        employee = User.objects.filter(pk=payload.employee_id, is_active=True).first()
        if not employee:
            return LeavePolicyResponseSerializer(
                response=ResponseObject.get_response(3, "Employee not found.")
            )
        policy, _ = LeavePolicy.objects.update_or_create(
            employee=employee,
            year=payload.year,
            defaults={
                "annual_days": payload.annual_days,
                "created_by": request.user,
                "is_active": True,
            },
        )
        data = LeavePolicyDataSerializer(
            id=policy.pk,
            unique_id=str(policy.unique_id),
            created_date=policy.created_date,
            updated_date=policy.updated_date,
            is_active=policy.is_active,
            created_by=None,
            employee_id=policy.employee_id,
            employee_username=policy.employee.username,
            year=policy.year,
            annual_days=policy.annual_days,
            days_used=policy.days_used,
            days_remaining=policy.days_remaining,
        )
        return LeavePolicyResponseSerializer(
            response=ResponseObject.get_response(1),
            data=data,
        )
    except Exception as exc:
        logger.error(f"set_leave_policy error: {exc}")
        return LeavePolicyResponseSerializer(
            response=ResponseObject.get_response(2, str(exc))
        )


# ─────────────────────────────────────────────────────────────────────────────
# Leave Application endpoints
# ─────────────────────────────────────────────────────────────────────────────


def _scope_applications(user) -> "QuerySet[LeaveApplication]":
    """Return QuerySet visible to the requesting user."""
    role = _get_role(user)
    base = LeaveApplication.objects.select_related(
        "applicant", "manager_reviewed_by", "ceo_reviewed_by"
    )
    if user.is_superuser or role == "ADMIN":
        return base
    if role in ("MANAGER", "CEO"):
        # Own tenant employees — approximate by checking same tenant via UserProfile
        try:
            tenant = user.user_profile.tenant
            if tenant:
                tenant_users = User.objects.filter(
                    user_profile__tenant=tenant, is_active=True
                )
                return base.filter(applicant__in=tenant_users)
        except Exception:
            pass
        return base
    # STAFF — only own applications
    return base.filter(applicant=user)


@leave_router.get(
    "/applications/",
    response=LeaveApplicationListResponseSerializer,
    auth=_auth,
    summary="List leave applications (scoped by role)",
)
def list_applications(
    request: HttpRequest,
    filters: LeaveApplicationFilterSerializer = Query(...),
):
    try:
        if not _is_internal_staff(request.user):
            return LeaveApplicationListResponseSerializer(
                response=ResponseObject.get_response(0, "Insufficient permissions.")
            )
        qs = _scope_applications(request.user)
        if filters.status:
            qs = qs.filter(status=filters.status)
        if filters.leave_type:
            qs = qs.filter(leave_type=filters.leave_type)
        if filters.applicant_id:
            qs = qs.filter(applicant_id=filters.applicant_id)
        if filters.year:
            qs = qs.filter(start_date__year=filters.year)
        data = [_build_app_data(a) for a in qs]
        return LeaveApplicationListResponseSerializer(
            response=ResponseObject.get_response(1),
            data=data,
        )
    except Exception as exc:
        logger.error(f"list_applications error: {exc}")
        return LeaveApplicationListResponseSerializer(
            response=ResponseObject.get_response(2, str(exc))
        )


@leave_router.post(
    "/applications/",
    response=LeaveApplicationResponseSerializer,
    auth=_auth,
    summary="Submit a leave application",
)
def submit_application(request: HttpRequest, payload: LeaveApplicationInputSerializer):
    try:
        if not _is_internal_staff(request.user):
            return LeaveApplicationResponseSerializer(
                response=ResponseObject.get_response(0, "Only staff members can submit leave applications.")
            )

        start = payload.start_date
        end = payload.end_date
        if end < start:
            return LeaveApplicationResponseSerializer(
                response=ResponseObject.get_response(0, "end_date must be >= start_date.")
            )

        # Balance check
        year = start.year
        policy = LeavePolicy.get_or_create_for_year(request.user, year)
        days_requested = LeaveApplication.calculate_working_days(start, end)
        is_emergency = days_requested > policy.days_remaining

        app = LeaveApplication.objects.create(
            applicant=request.user,
            leave_type=payload.leave_type,
            start_date=start,
            end_date=end,
            days_requested=days_requested,
            reason=payload.reason,
            status=LeaveStatus.PENDING,
            is_emergency=is_emergency,
            created_by=request.user,
        )

        return LeaveApplicationResponseSerializer(
            response=ResponseObject.get_response(
                1,
                (
                    "Leave application submitted. Note: you have exceeded your annual leave balance. "
                    "Your manager will review the reason provided."
                )
                if is_emergency
                else "Leave application submitted successfully.",
            ),
            data=_build_app_data(app),
        )
    except Exception as exc:
        logger.error(f"submit_application error: {exc}")
        return LeaveApplicationResponseSerializer(
            response=ResponseObject.get_response(2, str(exc))
        )


@leave_router.get(
    "/applications/{application_id}/",
    response=LeaveApplicationResponseSerializer,
    auth=_auth,
    summary="Get a single leave application",
)
def get_application(request: HttpRequest, application_id: int):
    try:
        qs = _scope_applications(request.user)
        app = qs.filter(pk=application_id).first()
        if not app:
            return LeaveApplicationResponseSerializer(
                response=ResponseObject.get_response(3, "Leave application not found.")
            )
        return LeaveApplicationResponseSerializer(
            response=ResponseObject.get_response(1),
            data=_build_app_data(app),
        )
    except Exception as exc:
        logger.error(f"get_application error: {exc}")
        return LeaveApplicationResponseSerializer(
            response=ResponseObject.get_response(2, str(exc))
        )


@leave_router.post(
    "/applications/{application_id}/transition/",
    response=LeaveApplicationResponseSerializer,
    auth=_auth,
    summary="Approve / reject a leave application (Manager or CEO)",
)
def transition_application(
    request: HttpRequest,
    application_id: int,
    payload: LeaveTransitionInputSerializer,
):
    try:
        role = _get_role(request.user)

        if not request.user.is_superuser and role not in ("MANAGER", "CEO", "ADMIN"):
            return LeaveApplicationResponseSerializer(
                response=ResponseObject.get_response(0, "Only Managers or CEOs can review leave applications.")
            )

        app = LeaveApplication.objects.filter(pk=application_id, is_active=True).first()
        if not app:
            return LeaveApplicationResponseSerializer(
                response=ResponseObject.get_response(3, "Leave application not found.")
            )

        action = payload.action.lower()
        today = date.today()

        # ── Manager actions ─────────────────────────────────────────────
        if role in ("MANAGER", "ADMIN") and not request.user.is_superuser:
            if app.status != LeaveStatus.PENDING:
                return LeaveApplicationResponseSerializer(
                    response=ResponseObject.get_response(0, f"Cannot act on an application with status '{app.status}'.")
                )
            if action == "approve":
                app.status = LeaveStatus.MANAGER_APPROVED
            elif action == "reject":
                app.status = LeaveStatus.MANAGER_REJECTED
            else:
                return LeaveApplicationResponseSerializer(
                    response=ResponseObject.get_response(0, "Invalid action. Use 'approve' or 'reject'.")
                )
            app.manager_reviewed_by = request.user
            app.manager_review_date = today
            app.manager_comment = payload.comment

        # ── CEO / Superuser actions ─────────────────────────────────────
        elif role == "CEO" or request.user.is_superuser:
            # CEO can approve/reject at PENDING or MANAGER_APPROVED level
            if app.status not in (LeaveStatus.PENDING, LeaveStatus.MANAGER_APPROVED):
                return LeaveApplicationResponseSerializer(
                    response=ResponseObject.get_response(0, f"Cannot act on an application with status '{app.status}'.")
                )
            if action == "approve":
                app.status = LeaveStatus.CEO_APPROVED
            elif action == "reject":
                app.status = LeaveStatus.CEO_REJECTED
            else:
                return LeaveApplicationResponseSerializer(
                    response=ResponseObject.get_response(0, "Invalid action. Use 'approve' or 'reject'.")
                )
            app.ceo_reviewed_by = request.user
            app.ceo_review_date = today
            app.ceo_comment = payload.comment
        else:
            return LeaveApplicationResponseSerializer(
                response=ResponseObject.get_response(0, "You do not have permission to review this application.")
            )

        app.save()

        return LeaveApplicationResponseSerializer(
            response=ResponseObject.get_response(1, f"Leave application {action}d successfully."),
            data=_build_app_data(app),
        )
    except Exception as exc:
        logger.error(f"transition_application error: {exc}")
        return LeaveApplicationResponseSerializer(
            response=ResponseObject.get_response(2, str(exc))
        )


@leave_router.delete(
    "/applications/{application_id}/",
    response=LeaveApplicationResponseSerializer,
    auth=_auth,
    summary="Cancel a pending leave application (owner only)",
)
def cancel_application(request: HttpRequest, application_id: int):
    try:
        app = LeaveApplication.objects.filter(
            pk=application_id, applicant=request.user, is_active=True
        ).first()
        if not app:
            return LeaveApplicationResponseSerializer(
                response=ResponseObject.get_response(3, "Leave application not found.")
            )
        if app.status != LeaveStatus.PENDING:
            return LeaveApplicationResponseSerializer(
                response=ResponseObject.get_response(0, "Only PENDING applications can be cancelled.")
            )
        app.status = LeaveStatus.CANCELLED
        app.save()
        return LeaveApplicationResponseSerializer(
            response=ResponseObject.get_response(1, "Leave application cancelled."),
            data=_build_app_data(app),
        )
    except Exception as exc:
        logger.error(f"cancel_application error: {exc}")
        return LeaveApplicationResponseSerializer(
            response=ResponseObject.get_response(2, str(exc))
        )
