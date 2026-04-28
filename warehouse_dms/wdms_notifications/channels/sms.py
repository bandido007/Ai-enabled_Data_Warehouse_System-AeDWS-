"""
SMS notification channel via Africa's Talking.

SMS is expensive. The default preference for SMS is OFF.
Only terminal events (APPROVED, REJECTED, SENT_BACK) should be enabled
by default, and even then only for users who have explicitly opted in.

send_sms_task reads the NotificationEvent, resolves the recipient's phone
number from their UserProfile, and sends via the africastalking SDK.
"""

import logging
from django.conf import settings
from celery import shared_task

logger = logging.getLogger("wdms_logger")


def _get_at_service():
    """Initialise the Africa's Talking SMS service."""
    import africastalking
    africastalking.initialize(
        username=settings.AFRICASTALKING_USERNAME,
        api_key=settings.AFRICASTALKING_API_KEY,
    )
    return africastalking.SMS


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def send_sms_task(self, event_id: int):
    """
    Load a NotificationEvent and send an SMS to the recipient.

    The recipient's phone number is read from their UserProfile.contact_phone.
    If no phone number is configured, the task exits silently.

    Retries up to 3 times on API failure with a 2-minute delay.
    """
    from wdms_notifications.models import NotificationEvent

    try:
        event = NotificationEvent.objects.select_related(
            "recipient__user_profile"
        ).get(pk=event_id)
    except NotificationEvent.DoesNotExist:
        logger.error(f"send_sms_task: NotificationEvent {event_id} not found")
        return

    profile = getattr(event.recipient, "user_profile", None)
    phone = getattr(profile, "contact_phone", "") if profile else ""

    if not phone:
        logger.warning(
            f"send_sms_task: recipient {event.recipient.username} has no phone — skipping"
        )
        return

    # Keep SMS short — strip the body to a summary line
    sms_body = event.subject[:160]

    try:
        sms = _get_at_service()
        sender_id = settings.AFRICASTALKING_SENDER_ID or None
        response = sms.send(
            message=sms_body,
            recipients=[phone],
            sender_id=sender_id,
        )
        logger.info(
            f"SMS sent for event {event_id} ({event.event_type}) "
            f"to {phone}: {response}"
        )
    except Exception as exc:
        logger.error(f"send_sms_task: Africa's Talking failure for event {event_id}: {exc}")
        raise self.retry(exc=exc)
