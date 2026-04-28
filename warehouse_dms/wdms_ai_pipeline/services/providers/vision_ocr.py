"""
Google Cloud Vision OCR provider.

Authenticates via the service account JSON pointed at by
``GOOGLE_APPLICATION_CREDENTIALS``. Quotas / rate limits surface as
``google.api_core.exceptions.ResourceExhausted`` and propagate to the caller
unchanged so the Celery task wrapper can decide whether to retry.
"""

from __future__ import annotations

import os
from typing import List

from wdms_ai_pipeline.services.interfaces.ocr import (
    OCRResult,
    OCRServiceInterface,
)


_PDF_EXTS = (".pdf",)
_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".gif", ".webp")


class VisionOCRService(OCRServiceInterface):
    def __init__(self):
        # Imported lazily so that the rest of the app can boot when the
        # google-cloud-vision SDK is not installed (e.g. CI with mocks only).
        from google.cloud import vision  # type: ignore

        self._vision = vision
        self._client = vision.ImageAnnotatorClient()

    def extract_text(self, file_path: str) -> OCRResult:
        ext = os.path.splitext(file_path)[1].lower()
        if ext in _PDF_EXTS:
            return self._extract_pdf(file_path)
        if ext in _IMAGE_EXTS:
            return self._extract_image(file_path)
        # Treat anything else as an image and let Vision tell us if it can't.
        return self._extract_image(file_path)

    def _extract_image(self, file_path: str) -> OCRResult:
        with open(file_path, "rb") as f:
            content = f.read()
        image = self._vision.Image(content=content)
        response = self._client.document_text_detection(image=image)
        if response.error.message:
            raise RuntimeError(f"Vision OCR error: {response.error.message}")
        text = response.full_text_annotation.text or ""
        confidence = self._page_confidence(response.full_text_annotation)
        return OCRResult(
            text=text,
            confidence=confidence,
            per_page_confidence=[confidence],
        )

    def _extract_pdf(self, file_path: str) -> OCRResult:
        with open(file_path, "rb") as f:
            content = f.read()
        request = {
            "input_config": {
                "content": content,
                "mime_type": "application/pdf",
            },
            "features": [{"type_": self._vision.Feature.Type.DOCUMENT_TEXT_DETECTION}],
        }
        response = self._client.batch_annotate_files(requests=[request])
        if not response.responses:
            return OCRResult(text="", confidence=0.0, per_page_confidence=[])
        file_response = response.responses[0]
        texts: List[str] = []
        per_page: List[float] = []
        for page_resp in file_response.responses:
            if page_resp.error.message:
                # Skip the page rather than failing the whole document.
                continue
            texts.append(page_resp.full_text_annotation.text or "")
            per_page.append(self._page_confidence(page_resp.full_text_annotation))
        text = "\n".join(t for t in texts if t)
        confidence = (sum(per_page) / len(per_page)) if per_page else 0.0
        return OCRResult(text=text, confidence=confidence, per_page_confidence=per_page)

    @staticmethod
    def _page_confidence(annotation) -> float:
        # full_text_annotation.pages[i].confidence is the per-page confidence.
        # Average across pages (each page's confidence is already an average
        # over its blocks). Vision returns 0.0 when no text was found.
        pages = getattr(annotation, "pages", None) or []
        confidences = [getattr(p, "confidence", 0.0) for p in pages]
        if not confidences:
            return 0.0
        return sum(confidences) / len(confidences)
