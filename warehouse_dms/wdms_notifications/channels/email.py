"""
Email notification channel.

The send_email_task Celery task loads a NotificationEvent, renders an
HTML email using Django's template engine (Jinja2-style templates), and
sends it via SMTP configured through environment variables.

Templates live in wdms_notifications/templates/email/.
"""

import logging
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from celery import shared_task

logger = logging.getLogger("wdms_logger")

# Map event_type → template name. Only terminal/significant events have
# bespoke templates. Others fall through to the generic template.
EVENT_TEMPLATE_MAP = {
    "DOCUMENT_APPROVED_FINAL": "email/document_approved_final.html",
    "DOCUMENT_APPROVED_BY_MANAGER": "email/document_approved_by_manager.html",
    "DOCUMENT_REJECTED": "email/document_rejected.html",
    "DOCUMENT_SENT_BACK": "email/document_sent_back.html",
}
GENERIC_TEMPLATE = "email/notification_generic.html"


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_task(self, event_id: int):
    """
    Load a NotificationEvent and send it as an HTML email.

    Retries up to 3 times on SMTP failure with a 60-second delay.
    """
    from wdms_notifications.models import NotificationEvent

    try:
        event = NotificationEvent.objects.select_related("recipient").get(
            pk=event_id
        )
    except NotificationEvent.DoesNotExist:
        logger.error(f"send_email_task: NotificationEvent {event_id} not found")
        return

    recipient_email = event.recipient.email
    if not recipient_email:
        logger.warning(
            f"send_email_task: recipient {event.recipient.username} has no email — skipping"
        )
        return

    template_name = EVENT_TEMPLATE_MAP.get(event.event_type, GENERIC_TEMPLATE)

    document_url = ""
    if event.related_document_id:
        document_url = (
            f"{settings.FRONTEND_DOMAIN}/documents/{event.related_document_id}/"
        )

    context = {
        "recipient_name": event.recipient.get_full_name() or event.recipient.username,
        "subject": event.subject,
        "body": event.body,
        "document_url": document_url,
        "frontend_domain": settings.FRONTEND_DOMAIN,
    }

    try:
        html_body = render_to_string(template_name, context)
    except Exception as e:
        logger.error(f"send_email_task: template render failed for event {event_id}: {e}")
        # Fall back to plain text
        html_body = f"<p>{event.body}</p>"

    try:
        send_mail(
            subject=event.subject,
            message=event.body,  # plain-text fallback
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            html_message=html_body,
            fail_silently=False,
        )
        logger.info(
            f"Email sent for event {event_id} ({event.event_type}) "
            f"to {recipient_email}"
        )
    except Exception as exc:
        logger.error(f"send_email_task: SMTP failure for event {event_id}: {exc}")
        raise self.retry(exc=exc)
