from django.contrib import admin

from wdms_leave.models import LeaveApplication, LeavePolicy


@admin.register(LeavePolicy)
class LeavePolicyAdmin(admin.ModelAdmin):
    list_display = ("employee", "year", "annual_days", "days_used", "days_remaining", "is_active")
    list_filter = ("year", "is_active")
    search_fields = ("employee__username", "employee__first_name", "employee__last_name")
    ordering = ("-year", "employee__username")


@admin.register(LeaveApplication)
class LeaveApplicationAdmin(admin.ModelAdmin):
    list_display = (
        "applicant", "leave_type", "start_date", "end_date",
        "days_requested", "status", "is_emergency", "created_date",
    )
    list_filter = ("status", "leave_type", "is_emergency")
    search_fields = ("applicant__username", "reason")
    ordering = ("-created_date",)
    readonly_fields = ("days_requested", "is_emergency")
