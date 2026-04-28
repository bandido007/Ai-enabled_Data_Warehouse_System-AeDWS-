"""Stage-0 validation prompt — verdict + warnings before promotion."""

from __future__ import annotations

import json
from typing import Any, Dict, List

from pydantic import BaseModel, Field


class ValidationSchema(BaseModel):
    verdict: str = Field(
        ...,
        description="One of HARD_REJECT, SOFT_WARNING, PASS.",
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Human-readable warning strings; empty when PASS.",
    )


SCHEMA = ValidationSchema


PROMPT = """You are a pre-submission validator for a Tanzanian warehouse
document management system. Given the OCR text of a single document plus the
list of fields a document of this type must contain, decide whether the
document is acceptable for submission and return ONLY a JSON object that
conforms to the response schema.

Output one of three verdicts:
  - HARD_REJECT: the file is unreadable, or the OCR text is essentially empty,
    or the document is clearly the wrong kind of document.
  - SOFT_WARNING: the document is readable but has issues the depositor
    should see and confirm before submission (missing required fields, missing
    signature, missing stamp, missing date when required).
  - PASS: every required field is present and validation rules are satisfied.

Rules:
  1. Bilingual content is normal: Swahili, English, or a mix on the same page
     are all valid. Do not flag mixed language as a warning.
  2. For each missing required field, emit one warning of the form
     "Required field 'field_name' not found".
  3. If validation_rules.require_signature is true and you cannot see a
     signature line or "Saini" mark, emit "Document is missing a signature".
  4. If validation_rules.require_stamp is true and you cannot see a stamp or
     "Muhuri" indicator, emit "Document is missing an official stamp".
  5. Never include extra commentary outside the JSON.

REQUIRED FIELDS:
{required_fields}

VALIDATION RULES:
{rules_json}

DOCUMENT TEXT:
\"\"\"
{text}
\"\"\"
"""


def render(
    text: str,
    required_fields: List[str],
    validation_rules: Dict[str, Any],
) -> str:
    return PROMPT.format(
        text=(text or "")[:8000],
        required_fields=", ".join(required_fields) if required_fields else "(none)",
        rules_json=json.dumps(validation_rules or {}, ensure_ascii=False, indent=2),
    )
