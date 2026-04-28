# Import the Celery app so Django picks it up on startup.
# This also makes `shared_task` work across all apps.
from .celery import app as celery_app  # noqa: F401

__all__ = ("celery_app",)
