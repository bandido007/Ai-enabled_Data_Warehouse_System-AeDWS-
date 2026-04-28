"""
Notification API endpoints.

Routes mounted at /api/v1/notifications/ in wdms_api_v1.py.

Endpoints:
  GET  /                          List the caller's notifications (paginated)
  POST /{id}/mark-read/           Mark one notification as read
  POST /mark-all-read/            Mark all as read
  GET  /preferences/              Retrieve per-event-type, per-channel prefs
  PUT  /preferences/              Bulk-update preferences
"""

from __future__ import annotations

import logging
from typing import List

from django.http import HttpRequest
from django.utils import timezone
from ninja import Query, Router

from wdms_notifications.models import (
    NotificationChannel,
    NotificationEvent,
    NotificationEventType,
    NotificationPreference,
)
from wdms_notifications.serializers import (
    NotificationEventTableSerializer,
    NotificationFilteringSerializer,
    NotificationNonPagedResponseSerializer,
    NotificationPagedResponseSerializer,
    PreferenceItemSerializer,
    PreferencesResponseSerializer,
    UpdatePreferencesInputSerializer,
)
from wdms_uaa.authorization import PermissionAuth
from wdms_utils.response import ResponseObject, get_paginated_and_non_paginated_data

logger = logging.getLogger("wdms_logger")

notifications_router = Router()
_auth = PermissionAuth()


# ─────────────────────────────────────────────────────────────────────────────
# List notifications
# ─────────────────────────────────────────────────────────────────────────────


@notifications_router.get(
    "/",
    response=NotificationPagedResponseSerializer,
    auth=_auth,
)
def list_notifications(
    request: HttpRequest,
    filtering: NotificationFilteringSerializer = Query(...),
):
    """
    Return the authenticated user's NotificationEvent records, newest first.
    Optional ?unreadOnly=true to filter to unread notifications only.
    """
    try:
        qs = NotificationEvent.objects.filter(
            recipient=request.user, is_active=True
        )
        if filtering.unread_only:
            qs = qs.filter(read_on_dashboard=False)

        # Strip unread_only so get_paginated_and_non_paginated_data doesn't try
        # to apply it as a queryset filter (it is not a model field).
        safe_filtering = filtering.model_copy(update={"unread_only": None})

        return get_paginated_and_non_paginated_data(
            qs,
            safe_filtering,
            NotificationPagedResponseSerializer,
            is_paged=True,
        )
    except Exception as e:
        logger.error(f"list_notifications error: {e}")
        return NotificationPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


# ─────────────────────────────────────────────────────────────────────────────
# Mark one read
# ─────────────────────────────────────────────────────────────────────────────


@notifications_router.post(
    "/{notification_id}/mark-read/",
    response=NotificationNonPagedResponseSerializer,
    auth=_auth,
)
def mark_notification_read(request: HttpRequest, notification_id: int):
    """Mark a single notification as read."""
    try:
        event = NotificationEvent.objects.filter(
            pk=notification_id, recipient=request.user, is_active=True
        ).first()
        if event is None:
            return NotificationNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Notification not found")
            )

        if not event.read_on_dashboard:
            event.read_on_dashboard = True
            event.read_at = timezone.now()
            event.save(update_fields=["read_on_dashboard", "read_at", "updated_date"])

        return NotificationNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, "Marked as read"),
            data=NotificationEventTableSerializer.model_validate(event),
        )
    except Exception as e:
        logger.error(f"mark_notification_read error: {e}")
        return NotificationNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


# ─────────────────────────────────────────────────────────────────────────────
# Mark all read
# ─────────────────────────────────────────────────────────────────────────────


@notifications_router.post(
    "/mark-all-read/",
    response=NotificationNonPagedResponseSerializer,
    auth=_auth,
)
def mark_all_notifications_read(request: HttpRequest):
    """Mark every unread notification for the caller as read."""
    try:
        count = NotificationEvent.objects.filter(
            recipient=request.user,
            read_on_dashboard=False,
            is_active=True,
        ).update(read_on_dashboard=True, read_at=timezone.now())

        return NotificationNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, f"{count} notifications marked as read")
        )
    except Exception as e:
        logger.error(f"mark_all_notifications_read error: {e}")
        return NotificationNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


# ─────────────────────────────────────────────────────────────────────────────
# Preferences — get
# ─────────────────────────────────────────────────────────────────────────────


@notifications_router.get(
    "/preferences/",
    response=PreferencesResponseSerializer,
    auth=_auth,
)
def get_notification_preferences(request: HttpRequest):
    """
    Return the caller's per-event-type, per-channel preferences.

    If a user has never set preferences they see the defaults:
    dashboard=on for every event type, email=on, sms=off.
    """
    try:
        existing = {
            (p.event_type, p.channel): p.enabled
            for p in NotificationPreference.objects.filter(
                user=request.user, is_active=True
            )
        }

        # Terminal events default email=True; SMS always defaults to False
        terminal_events = {
            NotificationEventType.DOCUMENT_APPROVED_FINAL,
            NotificationEventType.DOCUMENT_REJECTED,
            NotificationEventType.DOCUMENT_SENT_BACK,
        }

        result: List[PreferenceItemSerializer] = []
        for event_type in NotificationEventType:
            for channel in NotificationChannel:
                if channel == NotificationChannel.DASHBOARD:
                    default = True
                elif channel == NotificationChannel.EMAIL:
                    default = event_type in terminal_events
                else:  # SMS
                    default = False

                enabled = existing.get((event_type.value, channel.value), default)
                result.append(
                    PreferenceItemSerializer(
                        event_type=event_type.value,
                        channel=channel.value,
                        enabled=enabled,
                    )
                )

        return PreferencesResponseSerializer(
            response=ResponseObject.get_response(1),
            data=result,
        )
    except Exception as e:
        logger.error(f"get_notification_preferences error: {e}")
        return PreferencesResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


# ─────────────────────────────────────────────────────────────────────────────
# Preferences — update
# ─────────────────────────────────────────────────────────────────────────────


@notifications_router.put(
    "/preferences/",
    response=PreferencesResponseSerializer,
    auth=_auth,
)
def update_notification_preferences(
    request: HttpRequest, body: UpdatePreferencesInputSerializer
):
    """
    Bulk-update the caller's notification preferences.

    Each item in the array upserts a (user, event_type, channel) row.
    Dashboard channel cannot be disabled — attempts to set it to False
    are silently coerced to True.
    """
    try:
        valid_event_types = {e.value for e in NotificationEventType}
        valid_channels = {c.value for c in NotificationChannel}

        for pref in body.preferences:
            if pref.event_type not in valid_event_types:
                return PreferencesResponseSerializer(
                    response=ResponseObject.get_response(
                        0, f"Invalid event_type: {pref.event_type}"
                    )
                )
            if pref.channel not in valid_channels:
                return PreferencesResponseSerializer(
                    response=ResponseObject.get_response(
                        0, f"Invalid channel: {pref.channel}"
                    )
                )

            # Dashboard is always on — override any attempt to disable it
            enabled = (
                True
                if pref.channel == NotificationChannel.DASHBOARD
                else pref.enabled
            )

            NotificationPreference.objects.update_or_create(
                user=request.user,
                event_type=pref.event_type,
                channel=pref.channel,
                defaults={"enabled": enabled, "is_active": True},
            )

        return get_notification_preferences(request)

    except Exception as e:
        logger.error(f"update_notification_preferences error: {e}")
        return PreferencesResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )
