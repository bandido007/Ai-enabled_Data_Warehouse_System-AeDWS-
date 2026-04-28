"""Classification prompt — pick a document type id."""

from __future__ import annotations

import json
from typing import Any, Dict, List

from pydantic import BaseModel, Field


class ClassificationSchema(BaseModel):
    type_id: str = Field(..., description="The chosen document type id, exactly as listed in candidates.")
    confidence: float = Field(..., ge=0.0, le=1.0)


SCHEMA = ClassificationSchema


PROMPT = """You are a document classifier for a Tanzanian warehouse document
management system. The text below was OCR'd from a single document and may be
written in Swahili, English, or a mixture of both languages on the same page.
Classify based on the semantic purpose of the document — what it is and what
it is for — not based on the language it is written in.

You are given a list of candidate document types, each with a short list of
hints that describe what such a document typically contains. Choose the one
candidate whose purpose matches the document best, and return ONLY a JSON
object that conforms to the response schema you have been given.

Rules:
  1. The "type_id" you return MUST be one of the ids in the candidate list,
     character-for-character. Do not invent new ids.
  2. Confidence is a float in [0.0, 1.0]. Be honest: if the text is short or
     ambiguous, return a lower confidence rather than a fabricated one.
  3. Do not output any explanation text — only the structured JSON.

CANDIDATE DOCUMENT TYPES:
{candidates_json}

DOCUMENT TEXT (may be in Swahili, English, or mixed):
\"\"\"
{text}
\"\"\"
"""


def render(text: str, candidate_types: List[Dict[str, Any]]) -> str:
    """Fill the prompt with the user-supplied text and candidates."""
    return PROMPT.format(
        text=(text or "")[:8000],
        candidates_json=json.dumps(candidate_types, ensure_ascii=False, indent=2),
    )
