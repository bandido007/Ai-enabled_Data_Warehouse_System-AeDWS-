from django.contrib.auth.models import User
from django.contrib.postgres.fields import ArrayField
from django.db import models
from pgvector.django import VectorField

from wdms_tenants.models import Warehouse
from wdms_utils.BaseModel import BaseModel


class DocumentStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PENDING_STAFF = "PENDING_STAFF", "Pending Staff Review"
    PENDING_MANAGER = "PENDING_MANAGER", "Pending Manager Approval"
    PENDING_CEO = "PENDING_CEO", "Pending CEO Final Approval"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CORRECTION_NEEDED = "CORRECTION_NEEDED", "Correction Needed"


class UploadAttemptStatus(models.TextChoices):
    PENDING = "PENDING", "Pending Validation"
    HARD_REJECT = "HARD_REJECT", "Hard Reject"
    SOFT_WARNING = "SOFT_WARNING", "Soft Warning"
    PASSED = "PASSED", "Passed"
    PROMOTED = "PROMOTED", "Promoted to Document"


class UploadAttempt(BaseModel):
    uploader = models.ForeignKey(
        User, related_name="upload_attempts", on_delete=models.CASCADE
    )
    warehouse = models.ForeignKey(
        Warehouse, related_name="upload_attempts", on_delete=models.CASCADE
    )
    document_type_id = models.CharField(max_length=100)
    title = models.CharField(max_length=500, blank=True)
    staged_file = models.FileField(upload_to="staging/")
    ocr_text = models.TextField(blank=True)
    ocr_confidence = models.FloatField(null=True, blank=True)
    validation_status = models.CharField(
        max_length=20,
        choices=UploadAttemptStatus.choices,
        default=UploadAttemptStatus.PENDING,
    )
    validation_warnings = models.JSONField(default=list, blank=True)
    celery_task_id = models.CharField(max_length=100, blank=True)
    promoted_document = models.ForeignKey(
        "Document",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="source_attempt",
    )

    class Meta:
        db_table = "upload_attempts"
        ordering = ["-primary_key"]
        verbose_name_plural = "UPLOAD ATTEMPTS"


class Document(BaseModel):
    warehouse = models.ForeignKey(
        Warehouse, related_name="documents", on_delete=models.CASCADE
    )
    uploader = models.ForeignKey(
        User, related_name="uploaded_documents", on_delete=models.PROTECT
    )
    document_type_id = models.CharField(max_length=100, db_index=True)
    title = models.CharField(max_length=500)
    file = models.FileField(upload_to="documents/%Y/%m/", null=True, blank=True)
    status = models.CharField(
        max_length=30,
        choices=DocumentStatus.choices,
        default=DocumentStatus.PENDING_STAFF,
        db_index=True,
    )
    # AI-populated fields — remain empty in Phase 2, wired by Phase 4.
    extracted_text = models.TextField(blank=True)
    ai_classification = models.CharField(max_length=100, blank=True)
    ai_extracted_fields = models.JSONField(default=dict, blank=True)
    ai_summary = models.TextField(blank=True)
    ai_confidence_score = models.FloatField(null=True, blank=True)
    ai_review_notes = models.TextField(blank=True)
    ai_keywords = ArrayField(
        models.CharField(max_length=100), default=list, blank=True
    )
    embedding = VectorField(dimensions=768, null=True, blank=True)
    # Workflow context
    soft_warning_override = models.BooleanField(default=False)
    current_correction_note = models.TextField(blank=True)

    class Meta:
        db_table = "documents"
        ordering = ["-primary_key"]
        verbose_name_plural = "DOCUMENTS"
        indexes = [
            models.Index(fields=["warehouse", "status"]),
            models.Index(fields=["document_type_id", "status"]),
            models.Index(fields=["uploader", "status"]),
        ]

    @property
    def file_url(self) -> str | None:
        """Expose file URL as a direct attribute so Pydantic from_attributes=True can read it."""
        if self.file and self.file.name:
            try:
                return self.file.url
            except Exception:
                return None
        return None

    def __str__(self):
        return f"{self.document_type_id}: {self.title} ({self.status})"


class WorkflowTransition(BaseModel):
    document = models.ForeignKey(
        Document, related_name="transitions", on_delete=models.CASCADE
    )
    from_status = models.CharField(max_length=30)
    to_status = models.CharField(max_length=30)
    actor = models.ForeignKey(
        User, related_name="workflow_actions", on_delete=models.PROTECT
    )
    action = models.CharField(max_length=50)
    reason = models.TextField(blank=True)
    edited_fields = models.JSONField(default=dict, blank=True)
    ai_corrections = models.JSONField(
        default=dict,
        blank=True,
        help_text="Fields where the user corrected the AI output",
    )

    class Meta:
        db_table = "workflow_transitions"
        ordering = ["-primary_key"]
        verbose_name_plural = "WORKFLOW TRANSITIONS"
        indexes = [
            models.Index(fields=["document", "-primary_key"]),
        ]

