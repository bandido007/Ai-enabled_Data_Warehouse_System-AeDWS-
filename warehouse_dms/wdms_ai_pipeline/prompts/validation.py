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


PROMPT = """You are a pre-submission validator for a Tanzanian Warehouse
Document Management System (WDMS) regulated by the Tanzania Warehouse Licensing
Board (TWLB) under the Warehouse Receipt Act No. 10 of 2005 and the Warehouse
Receipt Regulations 2016.

Given the OCR text of a single document plus the list of fields a document of
this type must contain, decide whether the document is acceptable for
submission and return ONLY a JSON object that conforms to the response schema.

Output one of three verdicts:
  - HARD_REJECT: the file is unreadable, or the OCR text is essentially empty,
    or the document is clearly the wrong kind of document entirely.
  - SOFT_WARNING: the document is readable but has issues the depositor should
    see and confirm before submission (missing required fields, missing
    signature, missing stamp, missing date when required).
  - PASS: every required field is present and validation rules are satisfied.

--- Tanzanian Warehouse Document Context ---
The system handles official regulatory forms issued by TWLB. Common document
types and their key identifiers are:

  FORM NO 4  —  Depositor Registration & Declaration Form (Fomu ya Mweka Mali)
    Key fields: business name (Jina la Kibiashara), physical address (Anuani),
    telephone (Namba ya Simu), authorized signatory (Jina kamili la afisa),
    crop type (Aina ya Zao), storage quantity in kg (Kiasi Cha Mazao),
    bank name, branch, account number, depositor signature (Saini ya Mweka Mali)

  FORM NO 3  —  Quality Certificate Form
    Key fields: depositor name, warehouse operator name, crop name, season,
    number of bags, weight in kg, moisture content (%), PDN number, truck number,
    district, region, infestation %, admixtures %, storage period months

  FORM NO 6  —  Warehouse Receipt Delivery Report (under Regulations 30(d))
    Key fields: warehouse operator name, warehouse operation number, depositor/
    buyer name, receipt number, commodity, quantity, unit, WRIN number,
    preparer name & signature, verifier name & signature, date

  FORM NO 13  —  Commodity Quality Parameters Acknowledgement Form
    Key fields: warehouse operator name, buyer name, authorized staff name,
    company name, commodity description, weight in kg, grade received, date;
    references sales catalogue / tax invoice / release warrant number

  NOTICE NO 6  —  Notice of Withholding (Lien Notice)
    Key fields: authorized officer name, warehouse operator name, quantity,
    commodity, total value (Tshs), warehouse receipt number, owner name, address,
    lien charges list, settlement period in days, date

  FORM NO 1  —  Warehouse Operator License Application
    Key fields: full_business_name ("FULL BUSINESS NAME OF THE APPLICANT"),
    nature_of_application (NEW / RENEWAL / AMENDMENT), season, crop_type
    ("TYPE OF CROP(S) A LICENSE IS APPLIED FOR"), authorized_signature +
    stamp on section 5 ("APPLICATION DECLARATION"). NOTE: this form has no
    warehouse_code — the warehouse does not exist yet at application time.
    The signature line reads "FULL NAME … STAMP AND AUTHORISED SIGNATURE".

  FORM NO 2  —  Warehouse Operations Compliance
    Key fields: warehouse_operator_name, nature_of_application (NEW/RENEWAL),
    compliance scoring table (weighing equipment, loading platforms, drainage,
    building, fire safety, security, pest control). Scores and available points
    per category are critical content. Made under Regulation 15(2).

  FORM NO 9  —  Warehouse Inspector's License Application
    Key fields: inspector_full_name ("FULL NAME OF APPLICANT"),
    nature_of_application (NEW / RENEWAL / AMENDMENT), season,
    status_of_applicant (Company / Partnership), attached credentials checklist.
    Made under Regulation 15(1)(c). Similar structure to Form No 1.

  FORM NO 7  —  Commodity Mis-Delivery Claim
    Key fields: claimant_full_name, authorized_staff_full_name,
    claimant_company_name ("Full Name of Claimant Company"),
    respondent_full_name, commodity_name, warehouse_receipt_number,
    lot_number, original_quantity, delivered_quantity (over-release amount), date.
    Under Section 43(2)(c) of Warehouse Receipt Act and Regulation 55(1).
    NOTE: the form has both a claimant and a respondent (payer) section.

  NOTICE NO 2  —  Notice of Conditioning / Selling / Disposal of Deteriorating Goods
    Key fields: warehouse_operator_name (or collateral_manager_name),
    depositor_full_name, warehouse_registration_number,
    commodity_quantity, commodity_weight, warehouse_receipt_number, date.
    Under Regulation 69(1). Purpose: notify depositor goods are deteriorating
    and may injure other property or endanger persons.

--- Validation Rules ---
  1. Bilingual content is normal: Swahili, English, or a mix on the same page
     are all valid. Do not flag mixed language as a warning.
  2. Form numbers (e.g. "FORM NO 4", "FOMU/ FORM NO 4") are identifying headers
     — their presence strongly confirms document type.
  3. For each missing required field, emit one warning of the form
     "Required field 'field_name' not found".
  4. If validation_rules.require_signature is true and you cannot see a
     signature line, "Signature", or "Saini" mark, emit
     "Document is missing a signature".
  5. If validation_rules.require_stamp is true and you cannot see a stamp or
     "Muhuri" indicator, emit "Document is missing an official stamp".
  6. If the document appears to be a different TWLB form number than expected,
     emit a SOFT_WARNING: "Document form number does not match expected type".
  7. Empty or near-empty OCR text (fewer than 30 meaningful words) is a
     HARD_REJECT: "Document text is unreadable or file is corrupt".
  8. Never include extra commentary outside the JSON.

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
