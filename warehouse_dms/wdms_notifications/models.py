# wdms_notifications/models.py

from django.db import models
from django.contrib.auth.models import User
from wdms_utils.BaseModel import BaseModel


class NotificationChannel(models.TextChoices):
    DASHBOARD = "DASHBOARD", "Dashboard"
    EMAIL = "EMAIL", "Email"
    SMS = "SMS", "Short Message Service"


class NotificationEventType(models.TextChoices):
    DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED", "Document Uploaded"
    DOCUMENT_VALIDATED = "DOCUMENT_VALIDATED", "Document Validated"
    DOCUMENT_CONFIRMED_BY_STAFF = "DOCUMENT_CONFIRMED_BY_STAFF", "Staff Confirmed Document"
    DOCUMENT_APPROVED_BY_MANAGER = "DOCUMENT_APPROVED_BY_MANAGER", "Manager Approved"
    DOCUMENT_APPROVED_BY_CEO = "DOCUMENT_APPROVED_BY_CEO", "CEO Approved"
    DOCUMENT_REJECTED = "DOCUMENT_REJECTED", "Document Rejected"
    DOCUMENT_SENT_BACK = "DOCUMENT_SENT_BACK", "Document Sent Back for Correction"
    DOCUMENT_APPROVED_FINAL = "DOCUMENT_APPROVED_FINAL", "Document Officially Approved"
    RANKING_REPORT_UPDATED = "RANKING_REPORT_UPDATED", "Ranking Report Updated"


class NotificationPreference(BaseModel):
    user = models.ForeignKey(
        User, related_name="notification_preferences", on_delete=models.CASCADE
    )
    event_type = models.CharField(
        max_length=50, choices=NotificationEventType.choices
    )
    channel = models.CharField(
        max_length=20, choices=NotificationChannel.choices
    )
    enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "notification_preferences"
        unique_together = ["user", "event_type", "channel"]
        verbose_name_plural = "NOTIFICATION PREFERENCES"


class NotificationEvent(BaseModel):
    recipient = models.ForeignKey(
        User, related_name="notifications", on_delete=models.CASCADE
    )
    event_type = models.CharField(
        max_length=50, choices=NotificationEventType.choices
    )
    subject = models.CharField(max_length=500)
    body = models.TextField()
    related_document_id = models.BigIntegerField(null=True, blank=True)
    channels_sent = models.JSONField(default=list, blank=True)
    read_on_dashboard = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notification_events"
        ordering = ["-primary_key"]
        verbose_name_plural = "NOTIFICATION EVENTS"
        indexes = [
            models.Index(fields=["recipient", "read_on_dashboard"]),
        ]
