"""Field-extraction prompt — pull required + optional fields out of OCR text."""

from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel, Field


class ExtractionSchema(BaseModel):
    fields: Dict[str, str] = Field(
        default_factory=dict,
        description="Map of field_name to extracted string value. Empty string if absent.",
    )


SCHEMA = ExtractionSchema


PROMPT = """You are a structured-extraction model for a Tanzanian warehouse
document management system. The OCR text below may mix Swahili and English on
the same page. Extract the listed fields from the text and return them as a
JSON object that conforms to the response schema you have been given.

Rules for date fields:
  - Tanzanian documents commonly use Swahili month names: Januari, Februari,
    Machi, Aprili, Mei, Juni, Julai, Agosti, Septemba, Oktoba, Novemba,
    Desemba. If you see a date written in this form (e.g. "15 Aprili 2026"),
    convert it to ISO 8601 (YYYY-MM-DD) before returning. If the date is
    already in ISO 8601, return it unchanged. If you cannot parse the day,
    month, or year, return the original string verbatim.

Rules for every field:
  1. Return the exact key for every requested field. If the value is missing
     from the document, return an empty string for that field — never guess
     and never omit the key.
  2. Do not paraphrase or translate values. Return them in the source
     language; only date formats are converted.
  3. Do not output anything other than the structured JSON.

REQUIRED FIELDS (must be present in the output JSON, even if empty):
{required_fields}

OPTIONAL FIELDS (include if you find them, otherwise leave them out):
{optional_fields}

DOCUMENT TEXT (may be Swahili, English, or mixed):
\"\"\"
{text}
\"\"\"
"""


def render(
    text: str,
    required_fields: List[str],
    optional_fields: List[str],
) -> str:
    return PROMPT.format(
        text=(text or "")[:8000],
        required_fields=", ".join(required_fields) if required_fields else "(none)",
        optional_fields=", ".join(optional_fields) if optional_fields else "(none)",
    )
