"""Reviewer-facing review prompt — summary, notes, keywords."""

from __future__ import annotations

import json
from typing import Any, Dict

from pydantic import BaseModel, Field


class ReviewSchema(BaseModel):
    summary: str = Field(..., description="One-paragraph summary, in the source document language.")
    review: str = Field(..., description="Bulleted reviewer-facing notes.")
    keywords: list[str] = Field(default_factory=list, description="3–8 short keywords for retrieval.")


SCHEMA = ReviewSchema


PROMPT = """You are an assistant for the staff who reviews documents in a
Tanzanian warehouse system. You will produce a short summary, a bulleted set
of reviewer-facing notes, and a small list of search keywords. Return ONLY a
JSON object conforming to the response schema you have been given.

Language rule for the summary:
  - If the document is written in Swahili only, the summary MUST also be in
    Swahili.
  - If the document is written in English only, the summary MUST be in
    English.
  - If the document mixes Swahili and English on the same page, the summary
    MUST be in English so non-Swahili reviewers can read it.

Rules for the review notes:
  - Use short bulleted lines, English only (this is what staff use to triage).
  - Mention any anomalies, missing information, or things the reviewer should
    double-check on the original file.
  - End with a single line: "Suggested action: <confirm|send back|reject>".

Rules for keywords:
  - Three to eight short, lower-case, dash-or-underscore-free terms suitable
    for full-text retrieval. Mix English and Swahili if both appear in the
    text.

DOCUMENT TYPE: {document_type_label}

EXTRACTED FIELDS:
{extracted_fields_json}

DOCUMENT TEXT:
\"\"\"
{text}
\"\"\"
"""


def render(
    text: str,
    extracted_fields: Dict[str, Any],
    document_type_label: str,
) -> str:
    return PROMPT.format(
        text=(text or "")[:8000],
        extracted_fields_json=json.dumps(
            extracted_fields or {}, ensure_ascii=False, indent=2
        ),
        document_type_label=document_type_label or "Unknown",
    )
