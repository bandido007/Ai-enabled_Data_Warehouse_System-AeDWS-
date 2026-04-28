"""
Dashboard notification channel.

Dashboard notifications ARE the NotificationEvent records themselves.
There is no separate delivery mechanism — the NotificationEvent row
created by the dispatcher IS the dashboard notification.

When the frontend calls GET /api/v1/notifications/, it reads unread
NotificationEvent records for the authenticated user. Marking a
notification as read sets read_on_dashboard=True and read_at=now().

This file exists to complete the channels/ package and to document
this architectural decision explicitly, so that future developers do
not add delivery logic here thinking something is missing.
"""

# No Celery task needed. No delivery function needed.
# The dispatcher in wdms_notifications/dispatcher.py creates the
# NotificationEvent row, which is the dashboard notification.
