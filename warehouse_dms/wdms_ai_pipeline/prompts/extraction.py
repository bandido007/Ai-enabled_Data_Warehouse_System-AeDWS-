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


PROMPT = """You are a structured-extraction model for a Tanzanian Warehouse
Document Management System (WDMS) regulated by the Tanzania Warehouse Licensing
Board (TWLB). The OCR text below may mix Swahili and English on the same page.
Extract the listed fields from the text and return them as a JSON object that
conforms to the response schema you have been given.

--- Tanzanian Warehouse Form Field Mapping Reference ---
Use these Swahili ↔ English equivalents to locate fields in bilingual forms:

  Form 4 (Depositor Registration / Fomu ya Mweka Mali):
    business_name              ← "Full Business Name of Depositor" / "Jina Kamili la Kibiashara la Mweka Mali"
    physical_address           ← "Physical Address" / "Anuani"
    telephone_number           ← "Telephone Number" / "Namba ya Simu"
    authorized_signatory_name  ← "Full name of Authorized Signatories" / "Jina kamili la afisa Mwenye Mamlaka ya Kuweka Sahihi"
    crop_type                  ← "Type of Crop(s)" / "Aina ya Zao"
    storage_quantity_kg        ← "Storage Quantity Estimates" / "Kiasi Cha Mazao (Kwa Kilo)"
    bank_name                  ← "Name of Banker" / "Jina la Benki"
    bank_branch                ← "Branch" / "Tawi"
    bank_account_number        ← "Bank Account" / "Namba ya Akaunti"
    depositor_signature        ← "Depositors Authorized Signature" / "Saini ya Mweka Mali"
    date                       ← "TAREHE/DATE" or date near signature

  Form 3 (Quality Certificate):
    depositor_name             ← "FULL NAME DEPOSITOR"
    warehouse_operator_name    ← "FULL NAME OF WAREHOUSE OPERATOR / COLLATERAL MANAGER"
    crop_name                  ← "Name of Crop" (Quality Assessment section)
    season                     ← "SEASON"
    number_of_bags             ← "Number of Bags"
    weight_kg                  ← "Weight in PDN (Kgs)"
    moisture_content_percent   ← "Noted Moisture Content (%)"
    pdn_number                 ← "PDN"
    truck_number               ← "Truck Number"
    district                   ← "District"
    region                     ← "Region"
    infestation_percent        ← "Extent of Infestation (%)"
    admixtures_percent         ← "(%) Admixtures or Foreign Matters"
    storage_period_months      ← "Storage Period (Month)"
    date                       ← "DATE"

  Form 6 (Warehouse Receipt Delivery Report):
    warehouse_operator_name    ← "FULL NAME OF WAREHOUSE OPERATOR"
    warehouse_operation_number ← "WAREHOUSE OPERATION NUMBER"
    depositor_or_buyer_name    ← "Name of Depositor / Buyer"
    receipt_number             ← "RECEIPT NO."
    commodity                  ← "COMMODITY"
    quantity                   ← "QUANTITY"
    unit                       ← "UNIT"
    wrin_number                ← "WRIN" (Warehouse Receipt Issue Note number)
    preparer_name              ← "Prepared by: Name"
    preparer_signature         ← "Prepared by: Signature"
    date                       ← "Date" near preparer/verifier signature

  Form 13 (Commodity Parameter Acknowledgement):
    warehouse_operator_name    ← "FULL NAME OF WAREHOUSE OPERATOR / COLLATERAL MANAGER"
    buyer_name                 ← "FULL NAME OF BUYER"
    authorized_staff_full_name ← "Full Name of the Authorized Staff of the Buyer"
    company_name               ← "Of (Full Name of Company)"
    commodity_description      ← described in the acknowledgement narrative
    weight_kg                  ← "Kilograms" column
    grade_received             ← "Grade received"
    sales_catalogue_number     ← "Sales Catalogue Number"
    tax_invoice_number         ← "Tax Invoice number"
    release_warrant_number     ← "Release Warrant"
    date                       ← "DATE"

  Form 1 (Warehouse Operator License Application):
    full_business_name         ← "FULL BUSINESS NAME OF THE APPLICANT"
    nature_of_application      ← "NATURE OF APPLICATIONS" (NEW / RENEWAL / AMENDMENT)
    season                     ← "SEASON"
    crop_type                  ← "TYPE OF CROP(S) A LICENSE IS APPLIED FOR"
    authorized_signature       ← "FULL NAME… STAMP AND AUTHORISED SIGNATURE" in section 5
    po_box                     ← "P.O.BOX"
    street                     ← "STREET"
    town                       ← "TOWN"
    phone                      ← "Phone"
    email                      ← "E-mail"
    storage_capacity_mt        ← "Storage Capacity of the Warehouse (MT)" (section 4.6)
    date                       ← "DATE" header at top of form

  Notice No 6 (Notice of Withholding):
    authorized_officer_name    ← "I… the authorized officer of…" (officer name)
    warehouse_operator_name    ← organization name after "authorized officer of"
    quantity_amount            ← "total of … Kgs"
    commodity_unit             ← "(Unit)" field
    total_value_tshs           ← "total value of Tshs"
    warehouse_receipt_number   ← "Warehouse Receipt Number"
    owner_name                 ← "NAME OF OWNERSHIP"
    owner_po_box               ← "P.O.BOX"
    owner_district_town        ← "DISTRICT/TOWN/CITY"
    settlement_period_days     ← "period of … days"
    date                       ← "this … day of … 20…"

  Form 2 (Warehouse Operations Compliance):
    warehouse_operator_name    ← "FULL BUSINESS NAME OF THE WAREHOUSE THE WAREHOUSE OPERATOR…"
    nature_of_application      ← "NATURE OF APPLICATION" (New Application / Renewal)
    date                       ← "DATE:" at top
    season                     ← "SEASON:"

  Form 9 (Warehouse Inspector's License Application):
    inspector_full_name        ← "FULL NAME OF APPLICANT"
    nature_of_application      ← "NATURE OF APPLICATIONS" (NEW APPLICATION / RENEWAL / AMENDMENT)
    season                     ← "SEASON:"
    status_of_applicant        ← "STATUS OF APPLICANT" (Company / Partnership)
    po_box                     ← "P.O.BOX"
    phone                      ← "Phone"
    email                      ← "E– mail"
    date                       ← "DATE:" at top

  Form 7 (Commodity Mis-Delivery Claim):
    claimant_full_name         ← "FULL NAME OF APPLICANT (CLAIMANT)"
    authorized_staff_full_name ← "Full Name of the Authorized Staff of the Claimant Involved"
    claimant_company_name      ← "Full Name of Claimant Company"
    respondent_full_name       ← "FULL NAME OF RESPONDENT (PAYER)"
    commodity_name             ← "(Name the commodity)"
    warehouse_receipt_number   ← "Warehouse Receipt (s)" / "Lot number / Warehouse Receipt Number"
    lot_number                 ← "Lot number / Warehouse Receipt Number"
    contravened_section        ← "This Action contravenes Section … of the Warehouse Receipt Act"
    date                       ← "DATE:" at top

  Notice No 2 (Notice of Conditioning / Selling / Disposal of Deteriorating Goods):
    warehouse_operator_name    ← "FULL BUSINESS NAME OF THE COLLATERAL MANAGER/ WAREHOUSE OPERATOR"
    depositor_full_name        ← "FULL BUSINESS NAME OF THE DEPOSITOR"
    warehouse_registration_number ← "warehouse with registration number"
    commodity_quantity         ← "number … of your goods" (pieces/bags count)
    commodity_weight           ← from "weight of … of … issued/not issued"
    warehouse_receipt_number   ← receipt number issued for the goods
    date                       ← "DATE:" at top

--- Date Extraction Rules ---
  - Tanzanian documents commonly use Swahili month names: Januari, Februari,
    Machi, Aprili, Mei, Juni, Julai, Agosti, Septemba, Oktoba, Novemba,
    Desemba. If you see a date written in this form (e.g. "15 Aprili 2026"),
    convert it to ISO 8601 (YYYY-MM-DD). If already in ISO 8601, return unchanged.
    If you cannot parse day, month, or year, return the original string verbatim.

--- General Rules ---
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
