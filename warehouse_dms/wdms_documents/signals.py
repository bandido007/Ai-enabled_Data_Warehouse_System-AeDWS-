"""
Workflow Transition Signal Handlers (Phase 2)

Subscribes to `document_transitioned` fired by FSMEngine.execute_transition.
Phase 2 responsibility: log every transition at INFO so the transition is
visible in the server logs.

Phase 3 will attach the notification dispatcher to the same signal. DO NOT
dispatch notifications here — the dispatcher lives in wdms_notifications and
subscribes to the same signal by name. Two subscribers are fine; the engine
broadcasts to all of them.
"""

import logging

from django.dispatch import receiver

from wdms_documents.fsm.engine import document_transitioned

logger = logging.getLogger("wdms_logger")


@receiver(document_transitioned)
def log_document_transition(sender, **kwargs):
    document = kwargs["document"]
    from_status = kwargs["from_status"]
    to_status = kwargs["to_status"]
    action = kwargs["action"]
    actor = kwargs["actor"]
    reason = kwargs.get("reason", "")

    logger.info(
        "doc_transition doc_id=%s type=%s %s -> %s action=%s actor=%s reason=%r",
        document.pk,
        document.document_type_id,
        from_status,
        to_status,
        action,
        getattr(actor, "username", "<unknown>"),
        reason,
    )

    # Phase 3 hook: notification dispatch will attach here via
    # wdms_notifications.dispatcher.dispatch_transition_notifications,
    # registered as a separate @receiver on document_transitioned. It reads
    # the signal kwargs, resolves recipients by role + preferences, creates
    # NotificationEvent rows for the dashboard, and enqueues email/SMS
    # Celery tasks. Nothing to do in Phase 2.
