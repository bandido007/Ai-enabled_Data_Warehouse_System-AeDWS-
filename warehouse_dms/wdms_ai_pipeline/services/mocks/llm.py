"""Offline LLM mock — heuristic-only, no network."""

from __future__ import annotations

import re
from typing import Any, Dict, List

from wdms_ai_pipeline.services.interfaces.llm import (
    ClassificationResult,
    ExtractionResult,
    LLMServiceInterface,
    RankingExplanationResult,
    ReviewResult,
    ValidationResult,
    ValidationVerdict,
)


_SWAHILI_MONTHS = {
    "januari": "01", "februari": "02", "machi": "03", "aprili": "04",
    "mei": "05", "juni": "06", "julai": "07", "agosti": "08",
    "septemba": "09", "oktoba": "10", "novemba": "11", "desemba": "12",
}

_SWAHILI_DETECT = re.compile(
    r"\b(ghala|mkaguzi|tarehe|mkoa|matokeo|saini|muhuri|hesabu)\b",
    re.IGNORECASE,
)


def _looks_swahili(text: str) -> bool:
    return bool(_SWAHILI_DETECT.search(text or ""))


def _maybe_iso_date(value: str) -> str:
    """Convert "15 Aprili 2026" → "2026-04-15" if recognisable."""
    if not value:
        return value
    m = re.search(r"(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})", value)
    if not m:
        return value
    day, month_word, year = m.group(1), m.group(2).lower(), m.group(3)
    month = _SWAHILI_MONTHS.get(month_word)
    if not month:
        return value
    return f"{year}-{month}-{int(day):02d}"


class MockLLMService(LLMServiceInterface):
    def classify(
        self,
        text: str,
        candidate_types: List[Dict[str, Any]],
    ) -> ClassificationResult:
        text_lower = (text or "").lower()
        best_id = candidate_types[0]["id"] if candidate_types else "unknown"
        best_score = 0
        for t in candidate_types:
            score = 0
            for hint in t.get("hints", []):
                if hint and hint.lower() in text_lower:
                    score += 2
            if t.get("label", "").lower() in text_lower:
                score += 1
            if score > best_score:
                best_score = score
                best_id = t["id"]
        confidence = 0.92 if best_score else 0.55
        return ClassificationResult(type_id=best_id, confidence=confidence)

    def extract_fields(
        self,
        text: str,
        required_fields: List[str],
        optional_fields: List[str],
    ) -> ExtractionResult:
        fields: Dict[str, Any] = {}
        all_fields = list(required_fields) + list(optional_fields)
        for field_name in all_fields:
            label_pat = field_name.replace("_", "[ _]")
            m = re.search(
                rf"{label_pat}\s*(?:/[^:]*)?:\s*([^\n]+)",
                text or "",
                re.IGNORECASE,
            )
            value = m.group(1).strip() if m else ""
            if "date" in field_name.lower():
                value = _maybe_iso_date(value)
            if value:
                fields[field_name] = value
        return ExtractionResult(fields=fields)

    def validate_fields(
        self,
        text: str,
        required_fields: List[str],
        validation_rules: Dict[str, Any],
    ) -> ValidationResult:
        warnings: List[str] = []
        text_lower = (text or "").lower()
        for field_name in required_fields:
            token = field_name.replace("_", " ").lower()
            if token not in text_lower:
                warnings.append(f"Required field '{field_name}' not found in document")
        if validation_rules.get("require_signature") and "signature" not in text_lower and "saini" not in text_lower:
            warnings.append("Document is missing a signature")
        if validation_rules.get("require_stamp") and "stamp" not in text_lower and "muhuri" not in text_lower:
            warnings.append("Document is missing an official stamp")
        if not (text or "").strip():
            return ValidationResult(verdict=ValidationVerdict.HARD_REJECT, warnings=["No readable text"])
        verdict = ValidationVerdict.PASS if not warnings else ValidationVerdict.SOFT_WARNING
        return ValidationResult(verdict=verdict, warnings=warnings)

    def generate_review(
        self,
        text: str,
        extracted_fields: Dict[str, Any],
        document_type_label: str,
    ) -> ReviewResult:
        is_sw = _looks_swahili(text)
        if is_sw:
            summary = (
                f"Hii ni {document_type_label}. Sehemu kuu zimejazwa na taarifa "
                f"zinaonekana kuwa kamili kwa tathmini ya mfanyakazi."
            )
        else:
            summary = (
                f"This is a {document_type_label}. Core fields are populated and the "
                f"document appears complete enough for staff review."
            )
        review_lines = [
            f"Document type: {document_type_label}",
            f"Fields extracted: {len(extracted_fields)}",
        ]
        for k, v in list(extracted_fields.items())[:6]:
            review_lines.append(f"  - {k}: {v}")
        review_lines.append("Suggested action: confirm and forward.")
        keywords = [
            w
            for w in re.findall(r"[A-Za-z]{4,}", (text or ""))[:8]
        ] or [document_type_label.lower()]
        return ReviewResult(
            summary=summary,
            review="\n".join(review_lines),
            keywords=list(dict.fromkeys(keywords))[:8],
        )

    def generate_ranking_explanation(
        self,
        warehouse_name: str,
        score_components: Dict[str, Any],
    ) -> RankingExplanationResult:
        parts = [f"{warehouse_name} ranking summary:"]
        for k, v in score_components.items():
            parts.append(f"  - {k}: {v}")
        parts.append("Overall the warehouse meets baseline expectations.")
        return RankingExplanationResult(explanation="\n".join(parts))
