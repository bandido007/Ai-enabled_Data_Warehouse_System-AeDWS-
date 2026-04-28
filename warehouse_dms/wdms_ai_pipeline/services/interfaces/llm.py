"""
LLM service interface.

Each method maps one-to-one to a prompt template under wdms_ai_pipeline/prompts/
and returns a typed dataclass so consumers never have to parse free-form text.
The verdict for validation uses the same string constants the foundation
document defines for UploadAttempt outcomes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List


# Validation verdicts — kept as plain strings so the values match the
# UploadAttemptStatus choices exactly without an import cycle.
class ValidationVerdict:
    HARD_REJECT = "HARD_REJECT"
    SOFT_WARNING = "SOFT_WARNING"
    PASS = "PASS"


@dataclass
class ClassificationResult:
    type_id: str
    confidence: float


@dataclass
class ExtractionResult:
    fields: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ValidationResult:
    verdict: str  # one of ValidationVerdict.*
    warnings: List[str] = field(default_factory=list)


@dataclass
class ReviewResult:
    summary: str
    review: str
    keywords: List[str] = field(default_factory=list)


@dataclass
class RankingExplanationResult:
    explanation: str


class LLMServiceInterface(ABC):
    @abstractmethod
    def classify(
        self,
        text: str,
        candidate_types: List[Dict[str, Any]],
    ) -> ClassificationResult:
        """Pick the best document type id from ``candidate_types``."""

    @abstractmethod
    def extract_fields(
        self,
        text: str,
        required_fields: List[str],
        optional_fields: List[str],
    ) -> ExtractionResult:
        """Extract a dict of ``field_name -> value`` from ``text``."""

    @abstractmethod
    def validate_fields(
        self,
        text: str,
        required_fields: List[str],
        validation_rules: Dict[str, Any],
    ) -> ValidationResult:
        """Stage-0 validation: produce verdict + warnings."""

    @abstractmethod
    def generate_review(
        self,
        text: str,
        extracted_fields: Dict[str, Any],
        document_type_label: str,
    ) -> ReviewResult:
        """Produce summary + reviewer-facing notes + keywords."""

    @abstractmethod
    def generate_ranking_explanation(
        self,
        warehouse_name: str,
        score_components: Dict[str, Any],
    ) -> RankingExplanationResult:
        """Human-readable explanation of a rule-based score."""
