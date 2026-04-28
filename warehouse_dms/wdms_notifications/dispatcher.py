"""
Notification Dispatcher

Subscribes to the document_transitioned signal (fired by the FSM engine)
and dispatches notifications to affected users according to their
per-channel preferences.

Dispatch is async: the actual email and SMS sending happen in Celery
tasks. This function creates the NotificationEvent record (which is
the dashboard feed) synchronously, then enqueues background tasks
for email and SMS.
"""

import logging
from typing import List
from django.contrib.auth.models import User
from django.dispatch import receiver

from wdms_documents.fsm.engine import document_transitioned
from wdms_notifications.models import (
    NotificationEvent,
    NotificationPreference,
    NotificationChannel,
    NotificationEventType,
)
from wdms_notifications.channels.email import send_email_task
from wdms_notifications.channels.sms import send_sms_task

logger = logging.getLogger("wdms_logger")


# Map of FSM (from_state, to_state, action) tuples to notification event types
TRANSITION_TO_EVENT = {
    ("PENDING_STAFF", "PENDING_MANAGER", "confirm"): NotificationEventType.DOCUMENT_CONFIRMED_BY_STAFF,
    ("PENDING_MANAGER", "PENDING_CEO", "approve"): NotificationEventType.DOCUMENT_APPROVED_BY_MANAGER,
    ("PENDING_CEO", "APPROVED", "final_approve"): NotificationEventType.DOCUMENT_APPROVED_FINAL,
    # send_back transitions
    ("PENDING_STAFF", "CORRECTION_NEEDED", "send_back"): NotificationEventType.DOCUMENT_SENT_BACK,
    ("PENDING_MANAGER", "CORRECTION_NEEDED", "send_back"): NotificationEventType.DOCUMENT_SENT_BACK,
    ("PENDING_CEO", "CORRECTION_NEEDED", "send_back"): NotificationEventType.DOCUMENT_SENT_BACK,
    # reject transitions
    ("PENDING_MANAGER", "REJECTED", "reject"): NotificationEventType.DOCUMENT_REJECTED,
    ("PENDING_CEO", "REJECTED", "reject"): NotificationEventType.DOCUMENT_REJECTED,
}


def _resolve_recipients(document, event_type: NotificationEventType) -> List[User]:
    """
    Determine which users should receive this notification.

    Rules:
    - The uploader always receives notifications about their own document
    - Staff receive notifications when a document is ready for their review
    - Managers receive notifications when a document needs their approval
    - CEOs receive notifications when a document needs final approval
    """
    recipients = {document.uploader}  # always notify the uploader

    from wdms_uaa.models import UsersWithRoles

    def users_with_role(role_name: str, warehouse=None, tenant=None):
        qs = UsersWithRoles.objects.filter(
            user_with_role_role__name=role_name, is_active=True
        ).select_related("user_with_role_user__user_profile")
        users = []
        for ur in qs:
            u = ur.user_with_role_user
            profile = getattr(u, "user_profile", None)
            if profile is None:
                continue
            if tenant and getattr(profile, "tenant_id", None) != tenant.pk:
                continue
            if warehouse and getattr(profile, "warehouse_id", None) != warehouse.pk:
                continue
            users.append(u)
        return users

    warehouse = document.warehouse
    tenant = warehouse.tenant

    if event_type == NotificationEventType.DOCUMENT_UPLOADED:
        recipients.update(users_with_role("STAFF", warehouse=warehouse))
    elif event_type == NotificationEventType.DOCUMENT_CONFIRMED_BY_STAFF:
        recipients.update(users_with_role("MANAGER", tenant=tenant))
    elif event_type == NotificationEventType.DOCUMENT_APPROVED_BY_MANAGER:
        recipients.update(users_with_role("CEO", tenant=tenant))

    return list(recipients)


def _user_channels(user: User, event_type: NotificationEventType) -> List[str]:
    """Return the list of channels this user has opted into for this event type."""
    prefs = NotificationPreference.objects.filter(
        user=user, event_type=event_type, enabled=True, is_active=True
    ).values_list("channel", flat=True)

    # Default: dashboard always on, email on, SMS off
    if not prefs.exists():
        return [NotificationChannel.DASHBOARD, NotificationChannel.EMAIL]

    return list(prefs)


def _build_message(document, event_type: NotificationEventType, reason: str):
    """Produce subject + body for a notification event."""
    doc_label = f"{document.document_type_id} #{document.pk}"

    if event_type == NotificationEventType.DOCUMENT_CONFIRMED_BY_STAFF:
        return (
            f"Document confirmed by staff: {doc_label}",
            f"Your document {doc_label} has passed staff review and is now awaiting manager approval.",
        )
    if event_type == NotificationEventType.DOCUMENT_APPROVED_BY_MANAGER:
        return (
            f"Document approved by manager: {doc_label}",
            f"Document {doc_label} has been approved by the manager and is awaiting final CEO approval.",
        )
    if event_type == NotificationEventType.DOCUMENT_APPROVED_FINAL:
        return (
            f"Document officially approved: {doc_label}",
            f"Document {doc_label} has received final approval and is now an official record.",
        )
    if event_type == NotificationEventType.DOCUMENT_SENT_BACK:
        return (
            f"Document needs correction: {doc_label}",
            f"Your document {doc_label} was sent back for correction.\n\nReason: {reason}",
        )
    if event_type == NotificationEventType.DOCUMENT_REJECTED:
        return (
            f"Document rejected: {doc_label}",
            f"Document {doc_label} has been rejected.\n\nReason: {reason}",
        )

    return (f"Update on document {doc_label}", f"Document {doc_label} status has changed.")


@receiver(document_transitioned)
def dispatch_transition_notifications(sender, **kwargs):
    """Signal handler: dispatch notifications for an FSM transition."""
    document = kwargs["document"]
    from_status = kwargs["from_status"]
    to_status = kwargs["to_status"]
    action = kwargs["action"]
    reason = kwargs.get("reason", "")

    event_type = TRANSITION_TO_EVENT.get((from_status, to_status, action))
    if event_type is None:
        # No notification configured for this transition
        return

    recipients = _resolve_recipients(document, event_type)
    subject, body = _build_message(document, event_type, reason)

    for recipient in recipients:
        channels = _user_channels(recipient, event_type)

        # Always create the NotificationEvent (it IS the dashboard feed)
        event = NotificationEvent.objects.create(
            recipient=recipient,
            event_type=event_type,
            subject=subject,
            body=body,
            related_document_id=document.pk,
            channels_sent=channels,
            created_by=kwargs.get("actor"),
        )

        # Enqueue email delivery if opted in
        if NotificationChannel.EMAIL in channels:
            send_email_task.delay(event.pk)

        # Enqueue SMS delivery if opted in
        if NotificationChannel.SMS in channels:
            send_sms_task.delay(event.pk)

    logger.info(
        f"Dispatched {event_type} for document {document.pk} to {len(recipients)} recipients"
    )


# ──────────────────────────────────────────────────────────────────────────────
# Phase 4 — AI pre-review complete signal
# ──────────────────────────────────────────────────────────────────────────────


def _ai_review_message(document):
    doc_label = f"{document.document_type_id} #{document.pk}"
    classification = document.ai_classification or document.document_type_id
    return (
        f"AI pre-review ready: {doc_label}",
        (
            f"Document {doc_label} has completed AI pre-review and is ready "
            f"for staff verification.\n\n"
            f"Classification: {classification}\n"
            f"Confidence: "
            f"{document.ai_confidence_score if document.ai_confidence_score is not None else 'n/a'}\n"
        ),
    )


def _staff_for_warehouse(warehouse) -> List[User]:
    """Return STAFF users assigned to ``warehouse`` (or its tenant fallback)."""
    from wdms_uaa.models import UsersWithRoles

    qs = UsersWithRoles.objects.filter(
        user_with_role_role__name="STAFF", is_active=True
    ).select_related("user_with_role_user__user_profile")
    users: List[User] = []
    for ur in qs:
        u = ur.user_with_role_user
        profile = getattr(u, "user_profile", None)
        if profile is None:
            continue
        if getattr(profile, "warehouse_id", None) == warehouse.pk:
            users.append(u)
    return users


def _register_ai_review_receiver():
    """
    Lazy attach: the wdms_ai_pipeline.tasks module owns the signal, but
    importing it at module import time creates a circular import risk
    because tasks.py imports document models and the FSM types loader.
    Connecting in a function keeps the import cheap.
    """
    try:
        from wdms_ai_pipeline.tasks import document_ai_review_complete
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Could not connect document_ai_review_complete receiver: %s", exc
        )
        return

    @receiver(document_ai_review_complete)
    def dispatch_ai_review_notifications(sender, **kwargs):
        document = kwargs.get("document")
        if document is None:
            return
        # Notify the staff of the warehouse so they know a new AI-prepared
        # document is sitting in their queue.
        recipients = _staff_for_warehouse(document.warehouse)
        if not recipients:
            return
        subject, body = _ai_review_message(document)
        event_type = NotificationEventType.DOCUMENT_VALIDATED

        for recipient in recipients:
            channels = _user_channels(recipient, event_type)
            event = NotificationEvent.objects.create(
                recipient=recipient,
                event_type=event_type,
                subject=subject,
                body=body,
                related_document_id=document.pk,
                channels_sent=channels,
            )
            if NotificationChannel.EMAIL in channels:
                send_email_task.delay(event.pk)
            if NotificationChannel.SMS in channels:
                send_sms_task.delay(event.pk)
        logger.info(
            f"AI pre-review notifications: doc={document.pk} recipients={len(recipients)}"
        )


_register_ai_review_receiver()
