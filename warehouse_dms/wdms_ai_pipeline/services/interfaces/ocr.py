"""
OCR service interface.

Implementations extract raw text plus a confidence score from a document
file on disk. Per-page confidences are returned where the underlying engine
exposes them (Google Vision does, generic engines may not).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List


@dataclass
class OCRResult:
    text: str
    confidence: float
    per_page_confidence: List[float] = field(default_factory=list)


class OCRServiceInterface(ABC):
    @abstractmethod
    def extract_text(self, file_path: str) -> OCRResult:
        """Extract text and confidence from the file at ``file_path``."""
