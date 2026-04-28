"""Offline OCR mock — returns deterministic, realistic-shaped output."""

from __future__ import annotations

import os

from wdms_ai_pipeline.services.interfaces.ocr import (
    OCRResult,
    OCRServiceInterface,
)


# A small bilingual sample so downstream prompts have something
# meaningful to classify, extract from, and review.
_MOCK_TEXT = (
    "WAREHOUSE INSPECTION FORM / FOMU YA UKAGUZI WA GHALA\n"
    "Inspector / Mkaguzi: John Mwangi\n"
    "Warehouse / Ghala: Dar es Salaam Central Warehouse\n"
    "Region / Mkoa: Dar es Salaam\n"
    "Inspection Date / Tarehe ya Ukaguzi: 15 Aprili 2026\n"
    "Findings / Matokeo: Storage conditions are within compliance. "
    "Hali ya uhifadhi inakidhi viwango. Stock records reconcile with the "
    "physical count. Hakuna upungufu wowote ulioonekana.\n"
    "Recommendations / Mapendekezo: Continue monthly cycle counts. "
    "Endelea na hesabu za kila mwezi.\n"
    "Signature / Saini: ________________  Stamp / Muhuri: [stamped]\n"
)


class MockOCRService(OCRServiceInterface):
    def extract_text(self, file_path: str) -> OCRResult:
        # Vary confidence slightly with file size so tests can exercise the
        # min_ocr_confidence floor without hitting a real API.
        try:
            size = os.path.getsize(file_path)
        except OSError:
            size = 0
        # Deterministic 0.85 — comfortably above the 0.75–0.85 floors.
        confidence = 0.85 if size else 0.50
        return OCRResult(
            text=_MOCK_TEXT,
            confidence=confidence,
            per_page_confidence=[confidence],
        )
