"""
Vertex AI Gemini provider.

Wraps the structured-output feature: every call passes
``response_mime_type='application/json'`` and a Pydantic ``response_schema``
so the model's output is already valid JSON conforming to the expected
shape. We never parse free-form text.

Temperatures follow the foundation: 0.1 for classification / extraction /
validation (deterministic), 0.4 for review and ranking explanations
(natural-language variation OK).
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Type

from pydantic import BaseModel, ValidationError

from wdms_ai_pipeline.prompts import (
    classification as classification_prompt,
    extraction as extraction_prompt,
    ranking_explanation as ranking_prompt,
    review as review_prompt,
    validation as validation_prompt,
)
from wdms_ai_pipeline.services.interfaces.llm import (
    ClassificationResult,
    ExtractionResult,
    LLMServiceInterface,
    RankingExplanationResult,
    ReviewResult,
    ValidationResult,
    ValidationVerdict,
)

logger = logging.getLogger("wdms_logger")


_VALID_VERDICTS = {
    ValidationVerdict.HARD_REJECT,
    ValidationVerdict.SOFT_WARNING,
    ValidationVerdict.PASS,
}


class GeminiLLMService(LLMServiceInterface):
    def __init__(self):
        # Imported lazily so the app boots without google-cloud-aiplatform
        # in environments that only use the mock services.
        import vertexai  # type: ignore
        from vertexai.generative_models import GenerativeModel  # type: ignore

        project = os.environ.get("GOOGLE_CLOUD_PROJECT")
        location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
        if not project:
            raise RuntimeError("GOOGLE_CLOUD_PROJECT is not set")
        vertexai.init(project=project, location=location)
        self._GenerativeModel = GenerativeModel
        self._model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

    # ──────────────────────────────────────────────────────────────────────
    # Public interface
    # ──────────────────────────────────────────────────────────────────────

    def classify(
        self,
        text: str,
        candidate_types: List[Dict[str, Any]],
    ) -> ClassificationResult:
        prompt = classification_prompt.render(text, candidate_types)
        parsed = self._call_structured(
            prompt,
            classification_prompt.SCHEMA,
            temperature=0.1,
        )
        valid_ids = {t["id"] for t in candidate_types}
        type_id = parsed.type_id if parsed.type_id in valid_ids else (
            candidate_types[0]["id"] if candidate_types else "unknown"
        )
        return ClassificationResult(
            type_id=type_id,
            confidence=float(parsed.confidence),
        )

    def extract_fields(
        self,
        text: str,
        required_fields: List[str],
        optional_fields: List[str],
    ) -> ExtractionResult:
        prompt = extraction_prompt.render(text, required_fields, optional_fields)
        parsed = self._call_structured(
            prompt,
            extraction_prompt.SCHEMA,
            temperature=0.1,
        )
        # Drop empty values so the document's ai_extracted_fields stays clean
        fields = {k: v for k, v in (parsed.fields or {}).items() if v}
        return ExtractionResult(fields=fields)

    def validate_fields(
        self,
        text: str,
        required_fields: List[str],
        validation_rules: Dict[str, Any],
    ) -> ValidationResult:
        prompt = validation_prompt.render(text, required_fields, validation_rules)
        parsed = self._call_structured(
            prompt,
            validation_prompt.SCHEMA,
            temperature=0.1,
        )
        verdict = parsed.verdict if parsed.verdict in _VALID_VERDICTS else ValidationVerdict.SOFT_WARNING
        return ValidationResult(
            verdict=verdict,
            warnings=list(parsed.warnings or []),
        )

    def generate_review(
        self,
        text: str,
        extracted_fields: Dict[str, Any],
        document_type_label: str,
    ) -> ReviewResult:
        prompt = review_prompt.render(text, extracted_fields, document_type_label)
        parsed = self._call_structured(
            prompt,
            review_prompt.SCHEMA,
            temperature=0.4,
        )
        return ReviewResult(
            summary=parsed.summary or "",
            review=parsed.review or "",
            keywords=list(parsed.keywords or []),
        )

    def generate_ranking_explanation(
        self,
        warehouse_name: str,
        score_components: Dict[str, Any],
    ) -> RankingExplanationResult:
        prompt = ranking_prompt.render(warehouse_name, score_components)
        parsed = self._call_structured(
            prompt,
            ranking_prompt.SCHEMA,
            temperature=0.4,
        )
        return RankingExplanationResult(explanation=parsed.explanation or "")

    # ──────────────────────────────────────────────────────────────────────
    # Internals
    # ──────────────────────────────────────────────────────────────────────

    def _call_structured(
        self,
        prompt: str,
        schema_cls: Type[BaseModel],
        temperature: float,
    ) -> BaseModel:
        """Invoke Vertex with structured output and return a parsed Pydantic model."""
        from vertexai.generative_models import GenerationConfig  # type: ignore

        model = self._GenerativeModel(self._model_name)
        # Vertex accepts Pydantic schemas directly via response_schema.
        config = GenerationConfig(
            temperature=temperature,
            response_mime_type="application/json",
            response_schema=schema_cls.model_json_schema(),
        )
        response = model.generate_content(prompt, generation_config=config)
        raw = (response.text or "").strip()
        # Vertex sometimes wraps JSON in code fences when reasoning is enabled.
        if raw.startswith("```"):
            raw = raw.strip("`").lstrip("json").strip()
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"Vertex returned non-JSON despite response_schema: {exc}"
            ) from exc
        try:
            return schema_cls.model_validate(payload)
        except ValidationError as exc:
            raise RuntimeError(f"Vertex output failed schema validation: {exc}") from exc
