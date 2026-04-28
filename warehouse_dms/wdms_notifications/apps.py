from django.apps import AppConfig


class WdmsNotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "wdms_notifications"

    def ready(self):
        # Import the dispatcher so it registers its @receiver on
        # document_transitioned. Without this import the signal handler
        # is never connected and no notifications are dispatched.
        from wdms_notifications import dispatcher  # noqa: F401
