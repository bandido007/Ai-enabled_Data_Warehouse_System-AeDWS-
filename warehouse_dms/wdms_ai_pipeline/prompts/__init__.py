"""
Prompt templates for the Vertex AI Gemini pipeline.

Each module exposes:
  - PROMPT      : the natural-language instruction (a constant string)
  - SCHEMA      : a Pydantic model that Vertex enforces via response_schema
  - render(...) : a small helper that fills the user-input portion

Keeping prompts in dedicated files lets reviewers edit wording without
touching task code, and the Pydantic schema means we never parse free-form
JSON ourselves — Vertex returns text already conforming to the model.
"""

from wdms_ai_pipeline.prompts import (
    classification,
    extraction,
    ranking_explanation,
    review,
    validation,
)

__all__ = [
    "classification",
    "extraction",
    "validation",
    "review",
    "ranking_explanation",
]
