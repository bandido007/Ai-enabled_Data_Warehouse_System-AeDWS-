"""
Celery application instance for the Warehouse DMS.

Phase 3 additions:
- autodiscover_tasks across all wdms_ apps
- Celery Beat configuration (empty schedule for now — Phase 4 adds ranking task)
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "warehouse_dms.settings")

app = Celery("warehouse_dms")

# Read configuration from Django settings, namespace "CELERY_"
app.config_from_object("django.conf:settings", namespace="CELERY")

# Autodiscover tasks in every installed app that has a tasks.py module.
app.autodiscover_tasks([
    "wdms_ai_pipeline",
    "wdms_notifications",
    "wdms_documents",
    "wdms_reports",
])

# Celery Beat schedule — empty for Phase 3.
# Phase 4 will add: warehouse ranking nightly batch job.
app.conf.beat_schedule = {}
