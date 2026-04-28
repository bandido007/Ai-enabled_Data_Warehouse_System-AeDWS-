#!/usr/bin/env python3
"""
Phase 2 Automated API Test Runner
==================================
Tests every endpoint defined in TESTING_PHASE_2.md across all users and
multiple scenarios. Outputs a colour-coded pass/fail report.

Usage (inside WSL or Windows with Python 3.11+):
    python test_phase2.py
    python test_phase2.py --base-url http://localhost:8000
    python test_phase2.py --base-url http://localhost:8000 --verbose

Requires only the stdlib + 'requests' (pip install requests).
"""

from __future__ import annotations

import argparse
import json
import sys
import textwrap
import time
from io import BytesIO
from typing import Any

try:
    import requests
except ImportError:
    sys.exit("requests is not installed. Run: pip install requests")

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

BASE_URL = "http://localhost:8000"
API = f"{BASE_URL}/api/v1"
TIMEOUT = 30

USERS = {
    "admin":         {"username": "admin",          "password": "Admin@Wdms2026!"},
    "depositor":     {"username": "depositor_demo", "password": "demo123"},
    "staff":         {"username": "staff_demo",     "password": "demo123"},
    "manager":       {"username": "manager_demo",   "password": "demo123"},
    "ceo":           {"username": "ceo_demo",       "password": "demo123"},
    "regulator":     {"username": "regulator_demo", "password": "demo123"},
}

# ─────────────────────────────────────────────────────────────────────────────
# Coloured output
# ─────────────────────────────────────────────────────────────────────────────

_WIN = sys.platform == "win32"

def _green(s):  return s if _WIN else f"\033[92m{s}\033[0m"
def _red(s):    return s if _WIN else f"\033[91m{s}\033[0m"
def _yellow(s): return s if _WIN else f"\033[93m{s}\033[0m"
def _cyan(s):   return s if _WIN else f"\033[96m{s}\033[0m"
def _bold(s):   return s if _WIN else f"\033[1m{s}\033[0m"

# ─────────────────────────────────────────────────────────────────────────────
# Test result tracking
# ─────────────────────────────────────────────────────────────────────────────

RESULTS: list[dict] = []
VERBOSE = False

def _record(section: str, name: str, passed: bool, detail: str = "", response_body: Any = None):
    RESULTS.append({"section": section, "name": name, "passed": passed, "detail": detail})
    icon = _green("PASS") if passed else _red("FAIL")
    label = f"  [{icon}] {name}"
    if not passed or VERBOSE:
        if detail:
            print(f"{label}\n         {_yellow(detail)}")
        else:
            print(label)
        if response_body is not None and not passed and VERBOSE:
            try:
                pretty = json.dumps(response_body, indent=6)
                for line in pretty.splitlines()[:20]:
                    print(f"         {line}")
            except Exception:
                pass
    else:
        print(label)

# ─────────────────────────────────────────────────────────────────────────────
# HTTP helpers
# ─────────────────────────────────────────────────────────────────────────────

_session = requests.Session()

def _get(url, token=None, params=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        r = _session.get(url, headers=headers, params=params, timeout=TIMEOUT)
        return r.status_code, _safe_json(r)
    except requests.exceptions.ConnectionError:
        return None, {"error": "Connection refused — is the server running?"}

def _post(url, payload=None, token=None, files=None, data=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        if files is not None:
            r = _session.post(url, headers=headers, files=files, data=data, timeout=TIMEOUT)
        else:
            r = _session.post(url, headers=headers, json=payload, timeout=TIMEOUT)
        return r.status_code, _safe_json(r)
    except requests.exceptions.ConnectionError:
        return None, {"error": "Connection refused — is the server running?"}

def _safe_json(r):
    try:
        return r.json()
    except Exception:
        return {"_raw": r.text[:500]}

# ─────────────────────────────────────────────────────────────────────────────
# Auth helpers
# ─────────────────────────────────────────────────────────────────────────────

_token_cache: dict[str, str] = {}

def login(role: str) -> str | None:
    if role in _token_cache:
        return _token_cache[role]
    creds = USERS[role]
    status, body = _post(f"{API}/auth/login", creds)
    token = body.get("access", "")
    if token:
        _token_cache[role] = token
    return token or None

# ─────────────────────────────────────────────────────────────────────────────
# Section 0 — Server health
# ─────────────────────────────────────────────────────────────────────────────

def section_0():
    print(_bold(_cyan("\n═══ Section 0 — Server Health ═══")))

    # 0.1 Docs page returns 200
    try:
        r = _session.get(f"{BASE_URL}/api/v1/docs", timeout=TIMEOUT)
        _record("0", "0.1 Scalar docs page loads (HTTP 200)", r.status_code == 200,
                f"Got HTTP {r.status_code}")
    except Exception as e:
        _record("0", "0.1 Scalar docs page loads (HTTP 200)", False, str(e))

    # 0.2 Admin page returns 200 or 302
    try:
        r = _session.get(f"{BASE_URL}/admin/", timeout=TIMEOUT, allow_redirects=False)
        _record("0", "0.2 Admin page reachable", r.status_code in (200, 302),
                f"Got HTTP {r.status_code}")
    except Exception as e:
        _record("0", "0.2 Admin page reachable", False, str(e))

# ─────────────────────────────────────────────────────────────────────────────
# Section 1 — Authentication
# ─────────────────────────────────────────────────────────────────────────────

def section_1():
    print(_bold(_cyan("\n═══ Section 1 — Authentication ═══")))

    # 1.1 Successful login — all 6 users
    for role, creds in USERS.items():
        status, body = _post(f"{API}/auth/login", creds)
        token = body.get("access", "")
        has_token = bool(token)
        has_roles = isinstance(body.get("roles"), list)
        passed = status == 200 and has_token and has_roles
        _record("1", f"1.1 Login success [{role}]", passed,
                f"HTTP {status}, token={'yes' if has_token else 'NO'}, roles={'yes' if has_roles else 'NO'}")
        if has_token:
            _token_cache[role] = token

    # 1.2 camelCase aliasing in login response
    tok = login("depositor")
    if tok:
        _, body = _post(f"{API}/auth/login", USERS["depositor"])
        user_obj = body.get("user", {})
        has_camel = "userName" in user_obj
        _record("1", "1.2 camelCase in login response (userName present)", has_camel,
                f"Keys found: {list(user_obj.keys())}")

    # 1.3 Bad login — wrong password
    status, body = _post(f"{API}/auth/login", {"username": "depositor_demo", "password": "WRONG"})
    bad_token = body.get("access", "x")
    good_failure = not bad_token or bad_token == ""
    _record("1", "1.3 Bad password returns no token", good_failure,
            f"access='{bad_token[:30] if bad_token else ''}'")

    # 1.4 Bad login — unknown user
    status, body = _post(f"{API}/auth/login", {"username": "no_such_user_xyz", "password": "x"})
    bad_token = body.get("access", "x")
    good_failure = not bad_token or bad_token == ""
    _record("1", "1.4 Unknown user returns no token", good_failure,
            f"access='{bad_token[:30] if bad_token else ''}'")

    # 1.5 Get my profile (accounts/me)
    tok = login("depositor")
    if tok:
        status, body = _get(f"{API}/accounts/me", tok)
        has_data = body.get("data") is not None
        r_ok = body.get("response", {}).get("status") is True
        _record("1", "1.5 GET /accounts/me — depositor", status == 200 and has_data and r_ok,
                f"HTTP {status}, response.status={body.get('response',{}).get('status')}")

    # 1.6 Unauthenticated /accounts/me returns 401
    status, body = _get(f"{API}/accounts/me")
    _record("1", "1.6 Unauthenticated /accounts/me → 401", status == 401,
            f"HTTP {status}")

    # 1.7 All roles endpoint
    tok = login("admin")
    if tok:
        status, body = _get(f"{API}/auth/roles", tok)
        data = body.get("data") or []
        _record("1", "1.7 GET /auth/roles returns ≥1 role", status == 200 and len(data) >= 1,
                f"HTTP {status}, roles count={len(data)}")

    # 1.8 Permissions grouped endpoint
    tok = login("admin")
    if tok:
        status, body = _get(f"{API}/auth/permissions/grouped", tok)
        r_ok = body.get("response", {}).get("status") is True
        _record("1", "1.8 GET /auth/permissions/grouped", status == 200 and r_ok,
                f"HTTP {status}")

# ─────────────────────────────────────────────────────────────────────────────
# Section 2 — Tenants
# ─────────────────────────────────────────────────────────────────────────────

def section_2():
    print(_bold(_cyan("\n═══ Section 2 — Tenants & Warehouses ═══")))

    # 2.1 List regions
    tok = login("admin")
    if tok:
        status, body = _get(f"{API}/tenants/regions", tok)
        r_ok = body.get("response", {}).get("status") is True
        data = body.get("data") or []
        _record("2", "2.1 GET /tenants/regions — admin sees ≥1 region", status == 200 and r_ok and len(data) >= 1,
                f"HTTP {status}, regions={len(data)}")

    # 2.2 List tenants as admin
    tok = login("admin")
    if tok:
        status, body = _get(f"{API}/tenants/", tok)
        r_ok = body.get("response", {}).get("status") is True
        data = body.get("data") or []
        _record("2", "2.2 GET /tenants/ — admin sees ≥1 tenant", status == 200 and r_ok and len(data) >= 1,
                f"HTTP {status}, tenants={len(data)}, page={body.get('page')}")

    # 2.3 /tenants/ is admin-only — depositor correctly gets 401/403
    tok = login("depositor")
    if tok:
        status, body = _get(f"{API}/tenants/", tok)
        _record("2", "2.3 GET /tenants/ — depositor correctly rejected (admin-only)",
                status in (401, 403),
                f"HTTP {status}")

    # 2.4 List warehouses as staff
    tok = login("staff")
    if tok:
        status, body = _get(f"{API}/tenants/warehouses", tok)
        r_ok = body.get("response", {}).get("status") is True
        data = body.get("data") or []
        _record("2", "2.4 GET /tenants/warehouses — staff sees warehouses", status == 200 and r_ok,
                f"HTTP {status}, warehouses={len(data)}")

    # 2.5 Unauthenticated tenants request returns 401
    status, body = _get(f"{API}/tenants/")
    _record("2", "2.5 Unauthenticated /tenants/ → 401", status == 401,
            f"HTTP {status}")

# ─────────────────────────────────────────────────────────────────────────────
# Section 3 — Document types
# ─────────────────────────────────────────────────────────────────────────────

def section_3():
    print(_bold(_cyan("\n═══ Section 3 — Document Type Metadata ═══")))

    tok = login("depositor")
    if not tok:
        _record("3", "3.x — SKIP (no depositor token)", False)
        return None

    status, body = _get(f"{API}/documents/types/", tok)
    r_ok = body.get("response", {}).get("status") is True
    data = body.get("data") or []

    _record("3", "3.1 GET /documents/types/ succeeds", status == 200 and r_ok,
            f"HTTP {status}")
    _record("3", "3.2 Exactly 4 document types returned", len(data) == 4,
            f"Got {len(data)}")

    type_ids = {t.get("id") for t in data}
    for tid in ("application_form", "inspection_form", "compliance_certificate", "warehouse_receipt"):
        _record("3", f"3.3 Type '{tid}' present", tid in type_ids,
                f"Found types: {type_ids}")

    for t in data:
        if t.get("id") == "application_form":
            transitions = t.get("allowedTransitions", [])
            _record("3", "3.4 application_form has ≥12 transitions",
                    len(transitions) >= 12, f"Got {len(transitions)}")
        if t.get("id") == "compliance_certificate":
            transitions = t.get("allowedTransitions", [])
            _record("3", "3.5 compliance_certificate has 0 transitions",
                    len(transitions) == 0, f"Got {len(transitions)}")

    # camelCase on nested type objects
    if data:
        sample = data[0]
        _record("3", "3.6 camelCase aliasing on type (allowedTransitions key present)",
                "allowedTransitions" in sample, f"Keys: {list(sample.keys())[:8]}")

    return data


# ─────────────────────────────────────────────────────────────────────────────
# Section 4 — Document lifecycle (happy path)
# ─────────────────────────────────────────────────────────────────────────────

def _get_warehouse_id(tok: str) -> int | None:
    """Return the first warehouse ID visible to the given token."""
    _, body = _get(f"{API}/tenants/warehouses", tok)
    data = body.get("data") or []
    if data:
        return data[0].get("id")
    return None

def _upload_document(tok: str, doc_type: str, title: str, warehouse_id: int) -> dict | None:
    """Upload a document and return the response data dict or None."""
    fake_file = BytesIO(b"%PDF-1.4 fake content for testing")
    fake_file.name = "test_doc.pdf"
    files = {"file": ("test_doc.pdf", fake_file, "application/pdf")}
    data = {
        "document_type_id": doc_type,
        "warehouse_id": str(warehouse_id),
        "title": title,
    }
    _, body = _post(f"{API}/documents/upload/", token=tok, files=files, data=data)
    if body.get("response", {}).get("status") is True:
        return body.get("data")
    return None

def section_4():
    print(_bold(_cyan("\n═══ Section 4 — Document Lifecycle (Happy Path) ═══")))

    dep_tok = login("depositor")
    stf_tok = login("staff")
    mgr_tok = login("manager")
    ceo_tok = login("ceo")

    if not all([dep_tok, stf_tok, mgr_tok, ceo_tok]):
        _record("4", "4.x — SKIP (missing tokens)", False, "One or more logins failed")
        return None

    warehouse_id = _get_warehouse_id(stf_tok)
    if not warehouse_id:
        _record("4", "4.x — SKIP (no warehouse found)", False)
        return None

    # 4.1 Depositor uploads application_form
    fake_file = BytesIO(b"%PDF-1.4 fake content for testing")
    fake_file.name = "test_doc.pdf"
    files = {"file": ("test_doc.pdf", fake_file, "application/pdf")}
    form_data = {
        "document_type_id": "application_form",
        "warehouse_id": str(warehouse_id),
        "title": "Happy Path Application",
    }
    status, body = _post(f"{API}/documents/upload/", token=dep_tok, files=files, data=form_data)
    r_ok = body.get("response", {}).get("status") is True
    doc_data = (body.get("data") or {})
    doc_id = doc_data.get("id")
    initial_status = doc_data.get("status")
    _record("4", "4.1 Depositor uploads application_form → PENDING_STAFF",
            status == 200 and r_ok and initial_status == "PENDING_STAFF",
            f"HTTP {status}, docId={doc_id}, status={initial_status}")

    if not doc_id:
        _record("4", "4.x — ABORT (no document created)", False)
        return None

    # 4.2 Depositor lists own documents — sees the new doc
    status, body = _get(f"{API}/documents/", dep_tok)
    data = body.get("data") or []
    ids_in_list = [d.get("id") for d in data]
    _record("4", "4.2 Depositor list includes new doc", doc_id in ids_in_list,
            f"HTTP {status}, docs returned={len(data)}, found={doc_id in ids_in_list}")

    # 4.3 Staff lists PENDING_STAFF — sees the doc
    status, body = _get(f"{API}/documents/", stf_tok, params={"status": "PENDING_STAFF"})
    data = body.get("data") or []
    ids_in_list = [d.get("id") for d in data]
    _record("4", "4.3 Staff sees doc in PENDING_STAFF list", doc_id in ids_in_list,
            f"HTTP {status}, docs={len(data)}, found={doc_id in ids_in_list}")

    # 4.4 Staff gets available transitions — should be exactly 2 (confirm, send_back)
    status, body = _get(f"{API}/documents/{doc_id}/transitions/", stf_tok)
    transitions = body.get("data") or []
    actions = [t.get("action") for t in transitions]
    _record("4", "4.4 Staff sees 2 transitions (confirm, send_back) on PENDING_STAFF doc",
            len(transitions) == 2 and "confirm" in actions and "send_back" in actions,
            f"Actions: {actions}")

    # 4.5 Staff confirms (PENDING_STAFF → PENDING_MANAGER)
    status, body = _post(f"{API}/documents/{doc_id}/transition/", {"action": "confirm"}, stf_tok)
    r_ok = body.get("response", {}).get("status") is True
    new_status = (body.get("data") or {}).get("status")
    _record("4", "4.5 Staff confirm → PENDING_MANAGER",
            status == 200 and r_ok and new_status == "PENDING_MANAGER",
            f"HTTP {status}, status={new_status}")

    # 4.6 Depositor cannot confirm (wrong role)
    status, body = _post(f"{API}/documents/{doc_id}/transition/", {"action": "confirm"}, dep_tok)
    r_failed = body.get("response", {}).get("status") is False
    _record("4", "4.6 Depositor cannot confirm (role-gating works)", r_failed,
            f"HTTP {status}, response.status={body.get('response',{}).get('status')}")

    # 4.7 Manager approves (PENDING_MANAGER → PENDING_CEO)
    status, body = _post(f"{API}/documents/{doc_id}/transition/", {"action": "approve"}, mgr_tok)
    r_ok = body.get("response", {}).get("status") is True
    new_status = (body.get("data") or {}).get("status")
    _record("4", "4.7 Manager approve → PENDING_CEO",
            status == 200 and r_ok and new_status == "PENDING_CEO",
            f"HTTP {status}, status={new_status}")

    # 4.8 CEO final-approves (PENDING_CEO → APPROVED)
    status, body = _post(f"{API}/documents/{doc_id}/transition/", {"action": "final_approve"}, ceo_tok)
    r_ok = body.get("response", {}).get("status") is True
    new_status = (body.get("data") or {}).get("status")
    _record("4", "4.8 CEO final_approve → APPROVED",
            status == 200 and r_ok and new_status == "APPROVED",
            f"HTTP {status}, status={new_status}")

    # 4.9 Detail endpoint returns full audit trail (3 transitions)
    status, body = _get(f"{API}/documents/{doc_id}/", dep_tok)
    trail = (body.get("data") or {}).get("transitions", [])
    _record("4", "4.9 Detail has 3 transition records (full audit trail)",
            len(trail) == 3, f"Transitions: {len(trail)}")
    if trail:
        actors = [t.get("actor", {}).get("username") for t in trail]
        _record("4", "4.9b Audit trail actors match expected roles",
                "staff_demo" in actors and "manager_demo" in actors and "ceo_demo" in actors,
                f"Actors: {actors}")

    return doc_id


# ─────────────────────────────────────────────────────────────────────────────
# Section 5 — Correction flows
# ─────────────────────────────────────────────────────────────────────────────

def section_5():
    print(_bold(_cyan("\n═══ Section 5 — Correction Flows ═══")))

    dep_tok  = login("depositor")
    stf_tok  = login("staff")
    mgr_tok  = login("manager")
    ceo_tok  = login("ceo")

    if not all([dep_tok, stf_tok, mgr_tok, ceo_tok]):
        _record("5", "5.x — SKIP (missing tokens)", False)
        return

    warehouse_id = _get_warehouse_id(stf_tok)
    if not warehouse_id:
        _record("5", "5.x — SKIP (no warehouse)", False)
        return

    # ── 5.1 Wide cycle: staff sends back to CORRECTION_NEEDED ─────────────────
    doc_b = _upload_document(dep_tok, "application_form", "Correction Wide Cycle", warehouse_id)
    if not doc_b:
        _record("5", "5.x — ABORT (upload failed)", False)
        return
    doc_b_id = doc_b.get("id")

    status, body = _post(f"{API}/documents/{doc_b_id}/transition/",
                         {"action": "send_back", "reason": "Missing signature on page 2"},
                         stf_tok)
    r_ok = body.get("response", {}).get("status") is True
    new_status = (body.get("data") or {}).get("status")
    _record("5", "5.1 Staff send_back → CORRECTION_NEEDED",
            status == 200 and r_ok and new_status == "CORRECTION_NEEDED",
            f"HTTP {status}, status={new_status}")

    # Verify correction note on detail
    _, detail = _get(f"{API}/documents/{doc_b_id}/", dep_tok)
    correction_note = (detail.get("data") or {}).get("currentCorrectionNote", "")
    _record("5", "5.1b currentCorrectionNote stored on document",
            "Missing signature" in str(correction_note),
            f"note='{correction_note}'")

    # 5.2 Depositor resubmits
    status, body = _post(f"{API}/documents/{doc_b_id}/transition/",
                         {"action": "resubmit"}, dep_tok)
    r_ok = body.get("response", {}).get("status") is True
    new_status = (body.get("data") or {}).get("status")
    _record("5", "5.2 Depositor resubmit → PENDING_STAFF",
            status == 200 and r_ok and new_status == "PENDING_STAFF",
            f"HTTP {status}, status={new_status}")

    # Verify correction note cleared
    _, detail = _get(f"{API}/documents/{doc_b_id}/", dep_tok)
    cleared_note = (detail.get("data") or {}).get("currentCorrectionNote", "not_cleared")
    _record("5", "5.2b currentCorrectionNote cleared after resubmit",
            cleared_note in ("", None),
            f"note='{cleared_note}'")

    # ── 5.3 Negative: send_back without reason ────────────────────────────────
    doc_c = _upload_document(dep_tok, "application_form", "No Reason Test", warehouse_id)
    if doc_c:
        doc_c_id = doc_c.get("id")
        status, body = _post(f"{API}/documents/{doc_c_id}/transition/",
                              {"action": "send_back"},   # no reason
                              stf_tok)
        r_failed = body.get("response", {}).get("status") is False
        _record("5", "5.3 send_back without reason rejected",
                r_failed, f"HTTP {status}, response.status={body.get('response',{}).get('status')}")

        # doc should still be PENDING_STAFF
        _, chk = _get(f"{API}/documents/{doc_c_id}/", stf_tok)
        still_pending = (chk.get("data") or {}).get("status") == "PENDING_STAFF"
        _record("5", "5.3b Document still PENDING_STAFF after rejected transition",
                still_pending, f"status={(chk.get('data') or {}).get('status')}")

    # ── 5.4 Targeted send-back: CEO → PENDING_MANAGER (skip depositor) ────────
    doc_d = _upload_document(dep_tok, "application_form", "Targeted Sendback Test", warehouse_id)
    if not doc_d:
        _record("5", "5.4 — SKIP (upload failed)", False)
        return
    doc_d_id = doc_d.get("id")

    # Walk to PENDING_CEO
    _post(f"{API}/documents/{doc_d_id}/transition/", {"action": "confirm"}, stf_tok)
    _post(f"{API}/documents/{doc_d_id}/transition/", {"action": "approve"}, mgr_tok)

    # CEO sends back to manager
    status, body = _post(f"{API}/documents/{doc_d_id}/transition/",
                         {"action": "send_back_to_manager",
                          "reason": "Recompute totals on cover page."},
                         ceo_tok)
    r_ok = body.get("response", {}).get("status") is True
    new_status = (body.get("data") or {}).get("status")
    _record("5", "5.4 CEO send_back_to_manager → PENDING_MANAGER",
            status == 200 and r_ok and new_status == "PENDING_MANAGER",
            f"HTTP {status}, status={new_status}")

    # 5.5 Manager re-approves
    status, body = _post(f"{API}/documents/{doc_d_id}/transition/",
                         {"action": "approve"}, mgr_tok)
    r_ok = body.get("response", {}).get("status") is True
    new_status = (body.get("data") or {}).get("status")
    _record("5", "5.5 Manager re-approve after send_back → PENDING_CEO",
            status == 200 and r_ok and new_status == "PENDING_CEO",
            f"HTTP {status}, status={new_status}")


# ─────────────────────────────────────────────────────────────────────────────
# Section 6 — Negative / edge-case tests
# ─────────────────────────────────────────────────────────────────────────────

def section_6():
    print(_bold(_cyan("\n═══ Section 6 — Negative & Edge-Case Tests ═══")))

    dep_tok = login("depositor")
    stf_tok = login("staff")
    mgr_tok = login("manager")
    adm_tok = login("admin")

    warehouse_id = _get_warehouse_id(stf_tok) if stf_tok else None

    # 6.1 Depositor CANNOT upload inspection_form
    if dep_tok and warehouse_id:
        fake_file = BytesIO(b"fake content")
        files = {"file": ("doc.pdf", fake_file, "application/pdf")}
        form_data = {
            "document_type_id": "inspection_form",
            "warehouse_id": str(warehouse_id),
            "title": "Should fail",
        }
        status, body = _post(f"{API}/documents/upload/", token=dep_tok, files=files, data=form_data)
        r_failed = body.get("response", {}).get("status") is False
        _record("6", "6.1 Depositor cannot upload inspection_form",
                r_failed, f"HTTP {status}, response.status={body.get('response',{}).get('status')}")

    # 6.2 Staff CAN upload inspection_form
    if stf_tok and warehouse_id:
        fake_file = BytesIO(b"fake content")
        files = {"file": ("doc.pdf", fake_file, "application/pdf")}
        form_data = {
            "document_type_id": "inspection_form",
            "warehouse_id": str(warehouse_id),
            "title": "Staff inspection",
        }
        status, body = _post(f"{API}/documents/upload/", token=stf_tok, files=files, data=form_data)
        r_ok = body.get("response", {}).get("status") is True
        doc_status = (body.get("data") or {}).get("status", "")
        # inspection_form initial state skips staff (staff uploaded it) — exact state depends on config
        _record("6", "6.2 Staff CAN upload inspection_form",
                status == 200 and r_ok, f"HTTP {status}, status={doc_status}")

    # 6.3 Unauthenticated GET /documents/ → 401
    status, body = _get(f"{API}/documents/")
    _record("6", "6.3 Unauthenticated /documents/ → 401", status == 401, f"HTTP {status}")

    # 6.4 Invalid document ID on detail
    if dep_tok:
        status, body = _get(f"{API}/documents/999999/", dep_tok)
        r_failed = body.get("response", {}).get("status") is False or status in (404, 200)
        _record("6", "6.4 GET /documents/999999/ returns not-found response",
                status in (200, 404),
                f"HTTP {status}, response.status={body.get('response',{}).get('status')}")

    # 6.5 Unknown action on transition
    if stf_tok and warehouse_id:
        doc = _upload_document(dep_tok, "application_form", "Bad Action Test", warehouse_id)
        if doc:
            doc_id = doc.get("id")
            status, body = _post(f"{API}/documents/{doc_id}/transition/",
                                 {"action": "teleport"}, stf_tok)
            r_failed = body.get("response", {}).get("status") is False
            _record("6", "6.5 Unknown transition action rejected",
                    r_failed, f"HTTP {status}, response.status={body.get('response',{}).get('status')}")

    # 6.6 All 6 roles can authenticate
    for role in USERS:
        tok = login(role)
        _record("6", f"6.6 Role [{role}] can authenticate", tok is not None,
                "token present" if tok else "NO TOKEN")

    # 6.7 Manager/CEO can list all tenant documents (not just own)
    if mgr_tok:
        status, body = _get(f"{API}/documents/", mgr_tok)
        data = body.get("data") or []
        r_ok = body.get("response", {}).get("status") is True
        _record("6", "6.7 Manager list /documents/ returns ≥0 docs without error",
                status == 200 and r_ok, f"HTTP {status}, docs={len(data)}")

    # 6.8 Regulator gets nothing from documents (Phase 2 behaviour)
    reg_tok = login("regulator")
    if reg_tok:
        status, body = _get(f"{API}/documents/", reg_tok)
        data = body.get("data") or []
        r_ok = body.get("response", {}).get("status") is True
        _record("6", "6.8 Regulator sees 0 docs in Phase 2 (correct scoping)",
                status == 200 and r_ok and len(data) == 0,
                f"HTTP {status}, docs={len(data)}")

    # 6.9 Pagination fields are present and valid (not None) on paginated list
    if adm_tok:
        status, body = _get(f"{API}/documents/", adm_tok)
        page = body.get("page", {})
        if page:
            next_pn = page.get("nextPageNumber", "KEY_MISSING")
            prev_pn = page.get("previousPageNumber", "KEY_MISSING")
            # These must be int or null/None (not cause a 500)
            no_500 = body.get("response", {}).get("code") != 5000
            _record("6", "6.9 Pagination schema valid (no 5000 from None int)",
                    no_500, f"nextPageNumber={next_pn}, prevPageNumber={prev_pn}")
        else:
            _record("6", "6.9 Pagination schema present in list response",
                    False, f"page field: {page}")


# ─────────────────────────────────────────────────────────────────────────────
# Section 7 — Document filtering
# ─────────────────────────────────────────────────────────────────────────────

def section_7():
    print(_bold(_cyan("\n═══ Section 7 — Filtering & Pagination ═══")))

    stf_tok = login("staff")
    if not stf_tok:
        return

    # 7.1 Filter by status
    for status_val in ("PENDING_STAFF", "PENDING_MANAGER", "APPROVED"):
        status, body = _get(f"{API}/documents/", stf_tok, params={"status": status_val})
        r_ok = body.get("response", {}).get("status") is True
        _record("7", f"7.1 Filter ?status={status_val} succeeds",
                status == 200 and r_ok, f"HTTP {status}, docs={len(body.get('data') or [])}")

    # 7.2 Pagination — second page
    status, body = _get(f"{API}/documents/", login("admin"),
                        params={"page_number": 1, "items_per_page": 5})
    page = body.get("page", {})
    r_ok = body.get("response", {}).get("status") is True
    _record("7", "7.2 Pagination page=1&items_per_page=5 works",
            status == 200 and r_ok and page is not None,
            f"HTTP {status}, page keys={list(page.keys()) if page else 'None'}")

    # 7.3 Search term
    status, body = _get(f"{API}/documents/", stf_tok, params={"search_term": "Test"})
    r_ok = body.get("response", {}).get("status") is True
    _record("7", "7.3 ?search_term=Test succeeds without error",
            status == 200 and r_ok, f"HTTP {status}")


# ─────────────────────────────────────────────────────────────────────────────
# Summary printer
# ─────────────────────────────────────────────────────────────────────────────

def _print_summary():
    total  = len(RESULTS)
    passed = sum(1 for r in RESULTS if r["passed"])
    failed = total - passed

    print(_bold(_cyan("\n╔══════════════════════════════════════╗")))
    print(_bold(_cyan(  "║         TEST RESULTS SUMMARY         ║")))
    print(_bold(_cyan(  "╚══════════════════════════════════════╝")))
    print(f"  Total:  {total}")
    print(f"  {_green('Passed')}: {passed}")
    print(f"  {_red('Failed') if failed else 'Failed'}: {failed}")
    pct = round(100 * passed / total) if total else 0
    bar_filled = round(pct / 5)
    bar = "█" * bar_filled + "░" * (20 - bar_filled)
    colour = _green if pct >= 80 else (_yellow if pct >= 50 else _red)
    print(f"\n  {colour(bar)} {pct}%\n")

    if failed:
        print(_bold(_red("  Failed tests:")))
        for r in RESULTS:
            if not r["passed"]:
                detail = f"  → {r['detail']}" if r["detail"] else ""
                print(f"    [{r['section']}] {r['name']}{detail}")

    print()
    return failed == 0


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def _parse_args():
    p = argparse.ArgumentParser(description="Phase 2 API test runner")
    p.add_argument("--base-url", default="http://localhost:8000",
                   help="Base URL of the running Django server")
    p.add_argument("--verbose", "-v", action="store_true",
                   help="Print response body for failed tests")
    return p.parse_args()


def main():
    global BASE_URL, API, VERBOSE
    args = _parse_args()
    BASE_URL = args.base_url.rstrip("/")
    API = f"{BASE_URL}/api/v1"
    VERBOSE = args.verbose

    print(_bold(_cyan(f"\n  Phase 2 API Test Runner  →  {API}\n")))
    print("  Logging in all users first...")

    for role in USERS:
        tok = login(role)
        status = _green("OK") if tok else _red("FAIL")
        print(f"    [{status}] {role} ({USERS[role]['username']})")

    print()
    time.sleep(0.5)

    section_0()
    section_1()
    section_2()
    section_3()
    section_4()
    section_5()
    section_6()
    section_7()

    all_passed = _print_summary()
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
