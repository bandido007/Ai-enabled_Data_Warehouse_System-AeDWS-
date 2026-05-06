"""Reviewer-facing review prompt — summary, notes, keywords.

Two modes:
  - FORM FILL: depositor submitted fields directly through the system UI.
    There is no scanned file. The AI must review field *values* for validity,
    not mention missing text.
  - UPLOADED SCAN: a PDF/image was scanned via OCR.  The AI must cross-check
    every required field between the OCR text and the extracted values and
    flag any that appear empty or suspicious.
"""

from __future__ import annotations

import datetime
import json
from typing import Any, Dict, List

from pydantic import BaseModel, Field


class ReviewSchema(BaseModel):
    summary: str = Field(..., description="One-paragraph summary, in the source document language.")
    review: str = Field(..., description="Bulleted reviewer-facing notes.")
    keywords: list[str] = Field(default_factory=list, description="3–8 short keywords for retrieval.")


SCHEMA = ReviewSchema


# ── Form-fill prompt (no OCR text — fields come from the UI form) ──────────
_FORM_FILL_PROMPT = """You are an assistant for staff who review warehouse documents in Tanzania.
The depositor has filled this document directly through the system (no paper scan).
Return ONLY a JSON object conforming to the response schema.

IMPORTANT — TODAY'S DATE: {today}
This is the actual current date. Use it when evaluating date fields.
A date equal to or before {today} is a valid past/present date.

DATE FIELD RULES — read carefully:
- Fields that represent a SUBMISSION or SIGNING date (e.g. request_date, submission_date,
  signed_date, declaration_date): flag as ⚠ SUSPICIOUS if strictly AFTER {today}.
- Fields that represent a REQUESTED FUTURE PERIOD (e.g. date_from, date_to, leave_start_date,
  leave_end_date, return_date, period_from, period_to): these are EXPECTED to be after today
  because the employee is applying for future leave or permission. Do NOT flag them as
  suspicious merely because they are after {today}. Only flag if the value is clearly
  malformed (wrong format, nonsensical like year 1900 or 9999) or if date_to is before
  date_from.

Language rule for the summary:
  - Write in English (this is what staff use).

Rules for the summary:
  - One paragraph identifying: depositor name, commodity, quantity, bank details, submission date.
  - Do NOT mention anything about "empty document text" — there is no OCR text for form submissions.

Rules for the review notes (English only, bulleted):
  - Go through EVERY field in the REQUIRED FIELDS list below.
  - For each field mark it as:
      ✓ OK  — value is present and looks plausible
      ✗ MISSING — field is absent or blank
      ⚠ SUSPICIOUS — value is present but looks like a placeholder, test data, or
        an obviously wrong type (e.g. a generic word like "sent" or "yes" used as a
        signature instead of a real name; a bank account number that is all zeros
        or a trivially short sequence).
  - Note: "depositor_signature" and "warehouse_operator_signature" in this system
    represent the person's typed full name as their digital confirmation — a proper
    Tanzanian personal name is acceptable.  Flag only if the value is clearly not a
    name (e.g. "sent", "ok", "done", a single letter, or a number).
  - If a required field is missing entirely, flag it as MISSING.
  - After the field-by-field check, add any cross-field observations
    (e.g. quantity looks unrealistically large, date_to is before date_from, or a
    submission/signing date is after {today}).
  - End with a single line: "Suggested action: <confirm|send back|reject>".

Rules for keywords:
  - Three to eight short, lower-case terms for full-text retrieval.

DOCUMENT TYPE: {document_type_label}

REQUIRED FIELDS: {required_fields_list}

SUBMITTED FIELD VALUES:
{extracted_fields_json}
"""

# ── Uploaded / scanned document prompt ─────────────────────────────────────
_SCAN_PROMPT = """You are an assistant for staff who review warehouse documents in Tanzania.
This document was uploaded as a file and processed through OCR.
Return ONLY a JSON object conforming to the response schema.

IMPORTANT — TODAY'S DATE: {today}
This is the actual current date.
DATE FIELD RULES — read carefully:
- Submission/signing dates (e.g. request_date, signed_date, submission_date): flag as
  ⚠ SUSPICIOUS if strictly AFTER {today}.
- Requested future-period dates (e.g. date_from, date_to, leave_start_date, leave_end_date,
  return_date): EXPECTED to be after today for leave/permission forms. Do NOT flag as
  suspicious just because they are after {today}. Only flag if malformed or if date_to
  is before date_from.

Language rule for the summary:
  - Swahili-only document → Swahili summary.
  - English-only document → English summary.
  - Mixed → English.

Rules for the summary:
  - One paragraph: document type, key parties, key values, date.

Rules for the review notes (English only, bulleted):
  - Go through EVERY field in the REQUIRED FIELDS list.
  - For each required field mark it as:
      ✓ OK  — a value was extracted and it appears in the OCR text
      ✗ MISSING — no value was extracted (field absent from EXTRACTED FIELDS)
      ⚠ SUSPICIOUS — extracted value looks wrong or OCR quality is poor for this field
  - Flag overall OCR quality if the text looks garbled or cut off.
  - Flag any field whose extracted value does NOT match what is readable in the
    OCR text (possible extraction error).
  - Flag any obviously blank or unused sections.
  - End with: "Suggested action: <confirm|send back|reject>".

Rules for keywords:
  - Three to eight short, lower-case terms for retrieval.

DOCUMENT TYPE: {document_type_label}

REQUIRED FIELDS: {required_fields_list}

EXTRACTED FIELD VALUES:
{extracted_fields_json}

OCR TEXT (first 8000 chars):
\"\"\"
{text}
\"\"\"
"""


def render(
    text: str,
    extracted_fields: Dict[str, Any],
    document_type_label: str,
    required_fields: List[str] | None = None,
    is_form_fill: bool = False,
    today: str | None = None,
) -> str:
    template = _FORM_FILL_PROMPT if is_form_fill else _SCAN_PROMPT
    return template.format(
        text=(text or "")[:8000],
        extracted_fields_json=json.dumps(
            extracted_fields or {}, ensure_ascii=False, indent=2
        ),
        document_type_label=document_type_label or "Unknown",
        required_fields_list=json.dumps(required_fields or [], ensure_ascii=False),
        today=today or datetime.date.today().isoformat(),
    )
