"""
AI Pipeline Celery Tasks — Phase 4 (real providers via interfaces).

Two pipelines live in this module:

  Stage 0  validate_upload(attempt_id)  — runs OCR + LLM validation against
           a staged UploadAttempt before the depositor is allowed to confirm.
           Publishes SSE progress events so the browser can watch the work.

  Stage 1  trigger_ai_pre_review(document_id)  — chained tasks
                run_ocr → classify_document → extract_structured_fields
                       → generate_review → generate_embedding
                       → signal_ai_review_complete

All external calls go through the abstract services exposed by
``get_service_registry()``; nothing in this file talks to Vertex AI or
Vision directly.

Retry strategy: every task has ``max_retries=3`` and ``default_retry_delay=60``.
ResourceExhausted (HTTP 429) and quota errors trigger an exponential backoff
via ``self.retry``. After all retries are exhausted, the document is marked
with ``ai_review_notes='AI pre-review failed — please proceed with manual
review'`` so staff can still process it manually.

Privacy: we never log the OCR text or the full LLM response. Logs include
only metadata (document id, confidence, classification id, warning count).
"""

from __future__ import annotations

import logging
from typing import List, Optional

from celery import chain, shared_task
from django.dispatch import Signal

from wdms_ai_pipeline.services.registry import get_service_registry
from wdms_ai_pipeline.sse import publish_complete, publish_progress
from wdms_documents.fsm.types import (
    get_all_document_types,
    get_document_type,
)
from wdms_documents.models import (
    Document,
    UploadAttempt,
    UploadAttemptStatus,
)

logger = logging.getLogger("wdms_logger")

# Signal fired when the full Stage-1 chain completes. Subscribed to by the
# notification dispatcher so staff get a "ready for review" notification.
document_ai_review_complete = Signal()


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────


def _is_quota_error(exc: BaseException) -> bool:
    """Identify rate-limit / quota errors from Google's API core, without
    importing the SDK at module import time."""
    name = type(exc).__name__
    if name in ("ResourceExhausted", "TooManyRequests"):
        return True
    status = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    return status == 429


def _backoff_seconds(attempt_no: int) -> int:
    """60 → 120 → 240 seconds for retries 1, 2, 3."""
    return 60 * (2 ** max(0, attempt_no - 1))


def _mark_ai_failed(document_id: int, reason: str) -> None:
    """Last-resort fallback so the document never blocks the workflow."""
    try:
        Document.objects.filter(pk=document_id).update(
            ai_confidence_score=None,
            ai_review_notes=(
                "AI pre-review failed — please proceed with manual review"
            ),
        )
        logger.error(
            "AI pipeline gave up on document %s: %s", document_id, reason
        )
    except Exception:  # noqa: BLE001 — fallback path must never raise
        logger.exception("Could not mark document %s as AI-failed", document_id)


# ──────────────────────────────────────────────────────────────────────────────
# Stage 0 — pre-submission validation (replaces validate_upload_stub)
# ──────────────────────────────────────────────────────────────────────────────


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def validate_upload(self, attempt_id: int):
    """
    Run OCR + LLM validation on a staged UploadAttempt.

    Publishes SSE progress events at each stage. Updates the attempt with
    ocr_text, ocr_confidence, validation_status, and validation_warnings.
    Outcome is HARD_REJECT / SOFT_WARNING / PASSED depending on:
      * OCR confidence vs the document type's min_ocr_confidence floor
      * the LLM verdict from validate_fields
      * whether OCR returned any text at all
    """
    try:
        attempt = UploadAttempt.objects.select_related("warehouse").get(pk=attempt_id)
    except UploadAttempt.DoesNotExist:
        logger.error("validate_upload: UploadAttempt %s not found", attempt_id)
        return

    type_def = get_document_type(attempt.document_type_id)
    services = get_service_registry()

    try:
        # ── Stage 1: OCR ──────────────────────────────────────────────────
        publish_progress(
            attempt_id,
            stage="ocr",
            status="processing",
            message="Reading document...",
        )
        ocr = services.ocr.extract_text(attempt.staged_file.path)
        publish_progress(
            attempt_id,
            stage="ocr",
            status="done",
            message="OCR complete",
            character_count=len(ocr.text or ""),
            confidence=round(ocr.confidence, 3),
        )
        logger.info(
            "validate_upload: attempt=%s ocr_chars=%s confidence=%.2f",
            attempt_id,
            len(ocr.text or ""),
            ocr.confidence,
        )

        # ── Stage 2: Field validation ─────────────────────────────────────
        publish_progress(
            attempt_id,
            stage="validation",
            status="processing",
            message="Checking required fields...",
        )

        required_fields: List[str] = list(type_def.required_fields) if type_def else []
        validation_rules = dict(type_def.validation_rules) if type_def else {}
        min_confidence = float(validation_rules.get("min_ocr_confidence", 0.0))

        warnings: List[str] = []
        verdict = "PASS"
        if not (ocr.text or "").strip():
            verdict = "HARD_REJECT"
            warnings = ["No readable text could be extracted from the file"]
        elif ocr.confidence < min_confidence:
            verdict = "HARD_REJECT"
            warnings = [
                f"OCR confidence {ocr.confidence:.2f} is below the required floor "
                f"{min_confidence:.2f} for {attempt.document_type_id}"
            ]
        else:
            llm_result = services.llm.validate_fields(
                text=ocr.text,
                required_fields=required_fields,
                validation_rules=validation_rules,
            )
            verdict = llm_result.verdict
            warnings = list(llm_result.warnings)

        # Map the LLM verdict to the persisted UploadAttemptStatus.
        if verdict == "HARD_REJECT":
            outcome_status = UploadAttemptStatus.HARD_REJECT
        elif verdict == "SOFT_WARNING" or warnings:
            outcome_status = UploadAttemptStatus.SOFT_WARNING
            verdict = "SOFT_WARNING"
        else:
            outcome_status = UploadAttemptStatus.PASSED
            verdict = "PASSED"

        attempt.ocr_text = ocr.text or ""
        attempt.ocr_confidence = ocr.confidence
        attempt.validation_status = outcome_status
        attempt.validation_warnings = warnings
        attempt.save(
            update_fields=[
                "ocr_text",
                "ocr_confidence",
                "validation_status",
                "validation_warnings",
                "updated_date",
            ]
        )

        publish_progress(
            attempt_id,
            stage="validation",
            status="done",
            message=f"Validation complete: {verdict}",
            warning_count=len(warnings),
        )
        publish_complete(attempt_id, outcome=verdict, warnings=warnings)

        logger.info(
            "validate_upload: attempt=%s verdict=%s warnings=%d",
            attempt_id,
            verdict,
            len(warnings),
        )

    except Exception as exc:
        logger.exception("validate_upload: error for attempt %s", attempt_id)
        if _is_quota_error(exc) and self.request.retries < self.max_retries:
            countdown = _backoff_seconds(self.request.retries + 1)
            raise self.retry(exc=exc, countdown=countdown)

        # Final failure — mark hard-reject so the user is unblocked instead
        # of being stuck on a spinning stream.
        try:
            attempt.validation_status = UploadAttemptStatus.HARD_REJECT
            attempt.validation_warnings = [
                "Validation could not complete — please try again"
            ]
            attempt.save(
                update_fields=[
                    "validation_status",
                    "validation_warnings",
                    "updated_date",
                ]
            )
        except Exception:  # noqa: BLE001
            pass
        publish_complete(
            attempt_id,
            outcome="HARD_REJECT",
            warnings=["Validation could not complete — please try again"],
        )


# Backwards-compatible alias used by Phase 3 callers; remove once the
# upload view has been switched over.
validate_upload_stub = validate_upload


# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 — AI pre-review chain
# ──────────────────────────────────────────────────────────────────────────────


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def run_ocr(self, document_id: int) -> int:
    """
    Step 1: ensure the document has extracted text.

    If Stage 0 already attached OCR text to the originating UploadAttempt,
    promote it onto the document and skip the second OCR call. Otherwise
    run OCR fresh against the document's permanent file.
    """
    try:
        document = Document.objects.get(pk=document_id)

        if document.extracted_text:
            return document_id

        # Re-use Stage-0 OCR text from the originating attempt when available.
        attempt = UploadAttempt.objects.filter(
            promoted_document=document
        ).order_by("-primary_key").first()
        if attempt and attempt.ocr_text:
            document.extracted_text = attempt.ocr_text
            if attempt.ocr_confidence is not None:
                document.ai_confidence_score = attempt.ocr_confidence
            document.save(
                update_fields=[
                    "extracted_text",
                    "ai_confidence_score",
                    "updated_date",
                ]
            )
            return document_id

        services = get_service_registry()
        result = services.ocr.extract_text(document.file.path)
        document.extracted_text = result.text
        document.ai_confidence_score = result.confidence
        document.save(
            update_fields=[
                "extracted_text",
                "ai_confidence_score",
                "updated_date",
            ]
        )
        logger.info(
            "OCR done: doc=%s chars=%d confidence=%.2f",
            document_id,
            len(result.text or ""),
            result.confidence,
        )
        return document_id

    except Exception as exc:
        logger.exception("OCR failed for document %s", document_id)
        if self.request.retries < self.max_retries:
            countdown = _backoff_seconds(self.request.retries + 1) if _is_quota_error(exc) else 60
            raise self.retry(exc=exc, countdown=countdown)
        _mark_ai_failed(document_id, f"run_ocr: {exc}")
        return document_id


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def classify_document(self, document_id: int) -> int:
    """Step 2: classify the document using the LLM."""
    try:
        document = Document.objects.get(pk=document_id)
        services = get_service_registry()

        all_types = get_all_document_types()
        result = services.llm.classify(
            text=document.extracted_text,
            candidate_types=[
                {"id": t.id, "label": t.label, "hints": t.classification_hints}
                for t in all_types
            ],
        )
        document.ai_classification = result.type_id
        document.ai_confidence_score = result.confidence
        document.save(
            update_fields=[
                "ai_classification",
                "ai_confidence_score",
                "updated_date",
            ]
        )
        logger.info(
            "Classification: doc=%s type=%s confidence=%.2f",
            document_id,
            result.type_id,
            result.confidence,
        )
        return document_id

    except Exception as exc:
        logger.exception("Classification failed for document %s", document_id)
        if self.request.retries < self.max_retries:
            countdown = _backoff_seconds(self.request.retries + 1) if _is_quota_error(exc) else 60
            raise self.retry(exc=exc, countdown=countdown)
        _mark_ai_failed(document_id, f"classify_document: {exc}")
        return document_id


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def extract_structured_fields(self, document_id: int) -> int:
    """Step 3: extract the typed required + optional fields."""
    try:
        document = Document.objects.get(pk=document_id)
        services = get_service_registry()

        type_def = get_document_type(
            document.ai_classification or document.document_type_id
        )
        if not type_def:
            logger.warning(
                "No type definition for doc=%s classification=%s — skipping extraction",
                document_id,
                document.ai_classification,
            )
            return document_id

        result = services.llm.extract_fields(
            text=document.extracted_text,
            required_fields=type_def.required_fields,
            optional_fields=type_def.optional_fields,
        )
        document.ai_extracted_fields = result.fields
        document.save(update_fields=["ai_extracted_fields", "updated_date"])
        logger.info(
            "Extraction: doc=%s field_count=%d", document_id, len(result.fields)
        )
        return document_id

    except Exception as exc:
        logger.exception("Field extraction failed for document %s", document_id)
        if self.request.retries < self.max_retries:
            countdown = _backoff_seconds(self.request.retries + 1) if _is_quota_error(exc) else 60
            raise self.retry(exc=exc, countdown=countdown)
        _mark_ai_failed(document_id, f"extract_structured_fields: {exc}")
        return document_id


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_review(self, document_id: int) -> int:
    """Step 4: produce summary, reviewer notes, and keywords."""
    try:
        document = Document.objects.get(pk=document_id)
        services = get_service_registry()

        type_def = get_document_type(
            document.ai_classification or document.document_type_id
        )
        is_form_fill = not bool(document.file)
        required_fields = list(type_def.required_fields) if type_def else []
        import datetime as _dt
        result = services.llm.generate_review(
            text=document.extracted_text,
            extracted_fields=document.ai_extracted_fields or {},
            document_type_label=type_def.label if type_def else "Unknown",
            required_fields=required_fields,
            is_form_fill=is_form_fill,
            today=_dt.date.today().isoformat(),
        )
        document.ai_review_notes = result.review
        document.ai_summary = result.summary
        document.ai_keywords = list(result.keywords)
        document.save(
            update_fields=[
                "ai_review_notes",
                "ai_summary",
                "ai_keywords",
                "updated_date",
            ]
        )
        logger.info(
            "Review: doc=%s summary_chars=%d keywords=%d",
            document_id,
            len(result.summary or ""),
            len(result.keywords or []),
        )
        return document_id

    except Exception as exc:
        logger.exception("Review generation failed for document %s", document_id)
        if self.request.retries < self.max_retries:
            countdown = _backoff_seconds(self.request.retries + 1) if _is_quota_error(exc) else 60
            raise self.retry(exc=exc, countdown=countdown)
        _mark_ai_failed(document_id, f"generate_review: {exc}")
        return document_id


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_embedding(self, document_id: int) -> int:
    """Step 5: write the 768-dim embedding."""
    try:
        document = Document.objects.get(pk=document_id)
        services = get_service_registry()
        embedding_input = (
            f"{document.ai_summary or ''}\n\n{(document.extracted_text or '')[:4000]}"
        )
        vector = services.embedding.embed(embedding_input)
        document.embedding = vector
        document.save(update_fields=["embedding", "updated_date"])
        logger.info("Embedding stored: doc=%s dims=%d", document_id, len(vector))
        return document_id

    except Exception as exc:
        logger.exception("Embedding failed for document %s", document_id)
        if self.request.retries < self.max_retries:
            countdown = _backoff_seconds(self.request.retries + 1) if _is_quota_error(exc) else 60
            raise self.retry(exc=exc, countdown=countdown)
        _mark_ai_failed(document_id, f"generate_embedding: {exc}")
        return document_id


@shared_task
def signal_ai_review_complete(document_id: int) -> int:
    """Final step — fire the signal the notification dispatcher listens on."""
    try:
        document = Document.objects.get(pk=document_id)
    except Document.DoesNotExist:
        logger.warning(
            "signal_ai_review_complete: document %s vanished", document_id
        )
        return document_id
    document_ai_review_complete.send(sender=Document, document=document)
    logger.info("AI review complete: doc=%s signal fired", document_id)
    return document_id


# ──────────────────────────────────────────────────────────────────────────────
# Chain entry points
# ──────────────────────────────────────────────────────────────────────────────


def trigger_ai_pre_review(document_id: int) -> None:
    """Fire-and-forget: enqueue the full Stage-1 chain for a document."""
    chain(
        run_ocr.s(document_id),
        classify_document.s(),
        extract_structured_fields.s(),
        generate_review.s(),
        generate_embedding.s(),
        signal_ai_review_complete.s(),
    ).apply_async()


def trigger_form_fill_ai_review(document_id: int) -> None:
    """
    Fire-and-forget: enqueue AI summary + embedding for a form-fill document.

    Form-fill documents already have ``ai_extracted_fields`` set and no file,
    so we skip OCR and classification and start directly from generate_review.
    The review prompt handles None extracted_text gracefully — it renders the
    summary from the structured fields JSON alone.
    """
    chain(
        generate_review.s(document_id),
        generate_embedding.s(),
        signal_ai_review_complete.s(),
    ).apply_async()


def trigger_reclassification(document_id: int, new_type_id: str) -> None:
    """
    Re-run extraction → review → embedding after staff corrects the
    classification. The classification itself is updated synchronously so
    the UI sees the change immediately; everything downstream is async.
    """
    Document.objects.filter(pk=document_id).update(
        ai_classification=new_type_id,
    )
    chain(
        extract_structured_fields.s(document_id),
        generate_review.s(),
        generate_embedding.s(),
        signal_ai_review_complete.s(),
    ).apply_async()
