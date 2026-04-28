"""
Re-run the AI pre-review chain for a single document.

Useful for:
  - Backfilling embeddings after the 1536 → 768 dimension change
  - Re-classifying documents after a prompt template improvement
  - Debugging a specific document end-to-end

Usage:
    python manage.py reprocess_document <document_id>
    python manage.py reprocess_document <document_id> --sync   # block on the chain
    python manage.py reprocess_document <document_id> --reset  # clear AI fields first
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from wdms_documents.models import Document


class Command(BaseCommand):
    help = "Re-run the AI pre-review chain for one document"

    def add_arguments(self, parser):
        parser.add_argument("document_id", type=int)
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run each step inline instead of enqueueing on Celery",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Clear classification, fields, summary, review, and embedding before re-running",
        )

    def handle(self, *args, **options):
        document_id = options["document_id"]
        try:
            document = Document.objects.get(pk=document_id)
        except Document.DoesNotExist as exc:
            raise CommandError(f"Document {document_id} not found") from exc

        if options["reset"]:
            document.ai_classification = ""
            document.ai_extracted_fields = {}
            document.ai_summary = ""
            document.ai_review_notes = ""
            document.ai_keywords = []
            document.ai_confidence_score = None
            document.embedding = None
            document.save(
                update_fields=[
                    "ai_classification",
                    "ai_extracted_fields",
                    "ai_summary",
                    "ai_review_notes",
                    "ai_keywords",
                    "ai_confidence_score",
                    "embedding",
                    "updated_date",
                ]
            )
            self.stdout.write(self.style.WARNING(f"Reset AI fields for document {document_id}"))

        from wdms_ai_pipeline.tasks import (
            classify_document,
            extract_structured_fields,
            generate_embedding,
            generate_review,
            run_ocr,
            signal_ai_review_complete,
            trigger_ai_pre_review,
        )

        if options["sync"]:
            # .run() invokes the underlying function directly. Safe in a
            # management command because there's no Celery worker layered on.
            run_ocr.run(document_id)
            classify_document.run(document_id)
            extract_structured_fields.run(document_id)
            generate_review.run(document_id)
            generate_embedding.run(document_id)
            signal_ai_review_complete.run(document_id)
            self.stdout.write(self.style.SUCCESS(f"Reprocessed document {document_id} synchronously"))
            return

        trigger_ai_pre_review(document_id)
        self.stdout.write(
            self.style.SUCCESS(f"Enqueued AI pre-review chain for document {document_id}")
        )
