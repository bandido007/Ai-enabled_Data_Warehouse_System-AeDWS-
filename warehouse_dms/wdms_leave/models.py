"""
Leave Application models.

LeavePolicy   – stores the annual leave allocation for each user (defaults to
                30 days/year).  A policy record is created automatically when
                it does not yet exist for the current year.

LeaveApplication – one row per leave request submitted by a staff member.
                The application moves through a lightweight approval FSM:

                PENDING → MANAGER_REVIEWED (approved or rejected by Manager)
                        → CEO_REVIEWED      (final approval / rejection by CEO)

                If an employee has exhausted their allocated days the request
                is still allowed; is_emergency is set to True so approvers can
                see the context at a glance.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator
from django.db import models

from wdms_utils.BaseModel import BaseModel

User = get_user_model()


class LeaveType(models.TextChoices):
    ANNUAL = "ANNUAL", "Annual Leave"
    SICK = "SICK", "Sick Leave"
    EMERGENCY = "EMERGENCY", "Emergency Leave"
    BEREAVEMENT = "BEREAVEMENT", "Bereavement Leave"
    MATERNITY = "MATERNITY", "Maternity Leave"
    PATERNITY = "PATERNITY", "Paternity Leave"
    OTHER = "OTHER", "Other"


class LeaveStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    MANAGER_APPROVED = "MANAGER_APPROVED", "Approved by Manager"
    MANAGER_REJECTED = "MANAGER_REJECTED", "Rejected by Manager"
    CEO_APPROVED = "CEO_APPROVED", "Approved by CEO"
    CEO_REJECTED = "CEO_REJECTED", "Rejected by CEO"
    CANCELLED = "CANCELLED", "Cancelled"


class LeavePolicy(BaseModel):
    """
    Annual leave allocation for one employee in one calendar year.

    One record per (employee, year).  The `annual_days` value defaults to 30
    but an ADMIN or MANAGER can override it.
    """

    employee = models.ForeignKey(
        User,
        related_name="leave_policies",
        on_delete=models.CASCADE,
    )
    year = models.PositiveIntegerField(
        help_text="Calendar year this policy applies to (e.g. 2026).",
    )
    annual_days = models.PositiveIntegerField(
        default=30,
        validators=[MinValueValidator(1)],
        help_text="Total leave days allocated for the year.",
    )

    class Meta:
        db_table = "leave_policies"
        verbose_name = "Leave Policy"
        verbose_name_plural = "LEAVE POLICIES"
        unique_together = [("employee", "year")]

    def __str__(self) -> str:
        return f"{self.employee.username} — {self.year} ({self.annual_days} days)"

    # ── helpers ───────────────────────────────────────────────────────────────

    @property
    def days_used(self) -> int:
        """Count approved leave days consumed this year."""
        approved_statuses = [
            LeaveStatus.MANAGER_APPROVED,
            LeaveStatus.CEO_APPROVED,
        ]
        return sum(
            a.days_requested
            for a in LeaveApplication.objects.filter(
                applicant=self.employee,
                status__in=approved_statuses,
                start_date__year=self.year,
            )
        )

    @property
    def days_remaining(self) -> int:
        return max(0, self.annual_days - self.days_used)

    # ── class-level factory ───────────────────────────────────────────────────

    @classmethod
    def get_or_create_for_year(cls, employee: User, year: int) -> "LeavePolicy":
        """Return existing policy or create a default 30-day one."""
        policy, _ = cls.objects.get_or_create(
            employee=employee,
            year=year,
            defaults={"annual_days": 30, "created_by": employee},
        )
        return policy


class LeaveApplication(BaseModel):
    """
    One leave request submitted by an employee.

    Days are calculated automatically from start_date and end_date (inclusive,
    Mon–Sat counted; Sundays are excluded).  Callers may also provide
    `days_requested` directly to override the computation (useful when
    company-specific rules apply).

    If `is_emergency` is True the application bypasses the balance-exhaustion
    guard and always reaches the approver queue.
    """

    applicant = models.ForeignKey(
        User,
        related_name="leave_applications",
        on_delete=models.CASCADE,
    )
    leave_type = models.CharField(
        max_length=20,
        choices=LeaveType.choices,
        default=LeaveType.ANNUAL,
    )
    start_date = models.DateField()
    end_date = models.DateField()
    days_requested = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
    )
    reason = models.TextField(blank=True)
    status = models.CharField(
        max_length=30,
        choices=LeaveStatus.choices,
        default=LeaveStatus.PENDING,
    )
    is_emergency = models.BooleanField(
        default=False,
        help_text="True when the employee has exceeded their annual allocation.",
    )

    # Approval chain
    manager_reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        related_name="manager_reviewed_leaves",
        on_delete=models.SET_NULL,
    )
    manager_review_date = models.DateField(null=True, blank=True)
    manager_comment = models.TextField(blank=True)

    ceo_reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        related_name="ceo_reviewed_leaves",
        on_delete=models.SET_NULL,
    )
    ceo_review_date = models.DateField(null=True, blank=True)
    ceo_comment = models.TextField(blank=True)

    class Meta:
        db_table = "leave_applications"
        verbose_name = "Leave Application"
        verbose_name_plural = "LEAVE APPLICATIONS"
        ordering = ["-created_date"]

    def __str__(self) -> str:
        return (
            f"{self.applicant.username} | {self.leave_type} | "
            f"{self.start_date} → {self.end_date} | {self.status}"
        )

    # ── helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def calculate_working_days(start: date, end: date) -> int:
        """Count Mon–Sat between start and end inclusive (Sun excluded)."""
        if end < start:
            return 0
        total = 0
        current = start
        while current <= end:
            if current.weekday() != 6:  # 6 = Sunday
                total += 1
            current += timedelta(days=1)
        return total

    def save(self, *args, **kwargs):
        # Auto-compute days if not explicitly set
        if self.start_date and self.end_date:
            self.days_requested = self.calculate_working_days(
                self.start_date, self.end_date
            )
        super().save(*args, **kwargs)
