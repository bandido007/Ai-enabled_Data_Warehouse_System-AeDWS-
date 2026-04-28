from django.apps import AppConfig


class WdmsDocumentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "wdms_documents"

    def ready(self):
        # Import signal handlers so they subscribe to document_transitioned.
        from wdms_documents import signals  # noqa: F401
