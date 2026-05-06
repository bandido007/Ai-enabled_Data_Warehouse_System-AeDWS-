import uuid

import django.contrib.postgres.fields
import django.db.models.deletion
import pgvector.django
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
        ("wdms_tenants", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Enable the pgvector extension so VectorField can be created.
        # Idempotent — CREATE EXTENSION IF NOT EXISTS under the hood.
        pgvector.django.VectorExtension(),
        migrations.CreateModel(
            name="Document",
            fields=[
                ("primary_key", models.AutoField(primary_key=True, serialize=False)),
                ("unique_id", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("created_date", models.DateField(auto_now_add=True)),
                ("updated_date", models.DateField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                ("document_type_id", models.CharField(db_index=True, max_length=100)),
                ("title", models.CharField(max_length=500)),
                ("file", models.FileField(upload_to="documents/%Y/%m/")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "Draft"),
                            ("PENDING_STAFF", "Pending Staff Review"),
                            ("PENDING_MANAGER", "Pending Manager Approval"),
                            ("PENDING_CEO", "Pending CEO Final Approval"),
                            ("APPROVED", "Approved"),
                            ("REJECTED", "Rejected"),
                            ("CORRECTION_NEEDED", "Correction Needed"),
                        ],
                        db_index=True,
                        default="PENDING_STAFF",
                        max_length=30,
                    ),
                ),
                ("extracted_text", models.TextField(blank=True)),
                ("ai_classification", models.CharField(blank=True, max_length=100)),
                ("ai_extracted_fields", models.JSONField(blank=True, default=dict)),
                ("ai_summary", models.TextField(blank=True)),
                ("ai_confidence_score", models.FloatField(blank=True, null=True)),
                ("ai_review_notes", models.TextField(blank=True)),
                (
                    "ai_keywords",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.CharField(max_length=100),
                        blank=True,
                        default=list,
                        size=None,
                    ),
                ),
                (
                    "embedding",
                    pgvector.django.VectorField(blank=True, dimensions=1536, null=True),
                ),
                ("soft_warning_override", models.BooleanField(default=False)),
                ("current_correction_note", models.TextField(blank=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "uploader",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="uploaded_documents",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "warehouse",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="documents",
                        to="wdms_tenants.warehouse",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "DOCUMENTS",
                "db_table": "documents",
                "ordering": ["-primary_key"],
            },
        ),
        migrations.AddIndex(
            model_name="document",
            index=models.Index(
                fields=["warehouse", "status"], name="documents_warehou_1f1f00_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="document",
            index=models.Index(
                fields=["document_type_id", "status"], name="documents_documen_24c8bd_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="document",
            index=models.Index(
                fields=["uploader", "status"], name="documents_uploade_9b3c20_idx"
            ),
        ),
        migrations.CreateModel(
            name="UploadAttempt",
            fields=[
                ("primary_key", models.AutoField(primary_key=True, serialize=False)),
                ("unique_id", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("created_date", models.DateField(auto_now_add=True)),
                ("updated_date", models.DateField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                ("document_type_id", models.CharField(max_length=100)),
                ("title", models.CharField(blank=True, max_length=500)),
                ("staged_file", models.FileField(upload_to="staging/")),
                ("ocr_text", models.TextField(blank=True)),
                ("ocr_confidence", models.FloatField(blank=True, null=True)),
                (
                    "validation_status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Pending Validation"),
                            ("HARD_REJECT", "Hard Reject"),
                            ("SOFT_WARNING", "Soft Warning"),
                            ("PASSED", "Passed"),
                            ("PROMOTED", "Promoted to Document"),
                        ],
                        default="PENDING",
                        max_length=20,
                    ),
                ),
                ("validation_warnings", models.JSONField(blank=True, default=list)),
                ("celery_task_id", models.CharField(blank=True, max_length=100)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "promoted_document",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="source_attempt",
                        to="wdms_documents.document",
                    ),
                ),
                (
                    "uploader",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="upload_attempts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "warehouse",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="upload_attempts",
                        to="wdms_tenants.warehouse",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "UPLOAD ATTEMPTS",
                "db_table": "upload_attempts",
                "ordering": ["-primary_key"],
            },
        ),
        migrations.CreateModel(
            name="WorkflowTransition",
            fields=[
                ("primary_key", models.AutoField(primary_key=True, serialize=False)),
                ("unique_id", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("created_date", models.DateField(auto_now_add=True)),
                ("updated_date", models.DateField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                ("from_status", models.CharField(max_length=30)),
                ("to_status", models.CharField(max_length=30)),
                ("action", models.CharField(max_length=50)),
                ("reason", models.TextField(blank=True)),
                ("edited_fields", models.JSONField(blank=True, default=dict)),
                (
                    "ai_corrections",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        help_text="Fields where the user corrected the AI output",
                    ),
                ),
                (
                    "actor",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="workflow_actions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "document",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="transitions",
                        to="wdms_documents.document",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "WORKFLOW TRANSITIONS",
                "db_table": "workflow_transitions",
                "ordering": ["-primary_key"],
            },
        ),
        migrations.AddIndex(
            model_name="workflowtransition",
            index=models.Index(
                fields=["document", "-primary_key"], name="workflow_t_documen_3a7e4c_idx"
            ),
        ),
    ]
