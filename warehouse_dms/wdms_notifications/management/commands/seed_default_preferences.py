"""
Management command: seed_default_preferences

Creates default NotificationPreference rows for every existing user.

Default rules:
  - Dashboard: ON  for all event types (dashboard cannot be turned off)
  - Email:     ON  for terminal events (APPROVED_FINAL, REJECTED, SENT_BACK)
               OFF for all other event types
  - SMS:       OFF for all event types

Only creates rows where they do not already exist. Safe to run multiple times.

Usage:
  python manage.py seed_default_preferences
  python manage.py seed_default_preferences --user 42   # single user
"""

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from wdms_notifications.models import (
    NotificationChannel,
    NotificationEventType,
    NotificationPreference,
)

TERMINAL_EVENTS = {
    NotificationEventType.DOCUMENT_APPROVED_FINAL,
    NotificationEventType.DOCUMENT_REJECTED,
    NotificationEventType.DOCUMENT_SENT_BACK,
}


def _default_enabled(channel: str, event_type: str) -> bool:
    if channel == NotificationChannel.DASHBOARD:
        return True
    if channel == NotificationChannel.EMAIL:
        return event_type in TERMINAL_EVENTS
    # SMS
    return False


class Command(BaseCommand):
    help = "Seed default notification preferences for all existing users"

    def add_arguments(self, parser):
        parser.add_argument(
            "--user",
            type=int,
            default=None,
            help="Only seed preferences for this user (primary key)",
        )

    def handle(self, *args, **options):
        if options["user"]:
            users = User.objects.filter(pk=options["user"])
            if not users.exists():
                self.stderr.write(f"User {options['user']} not found")
                return
        else:
            users = User.objects.filter(is_active=True)

        created_count = 0
        skipped_count = 0

        for user in users:
            for event_type in NotificationEventType:
                for channel in NotificationChannel:
                    enabled = _default_enabled(channel.value, event_type.value)
                    _, created = NotificationPreference.objects.get_or_create(
                        user=user,
                        event_type=event_type.value,
                        channel=channel.value,
                        defaults={
                            "enabled": enabled,
                            "is_active": True,
                            "created_by": user,
                        },
                    )
                    if created:
                        created_count += 1
                    else:
                        skipped_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created {created_count} preference rows, "
                f"skipped {skipped_count} that already existed."
            )
        )
