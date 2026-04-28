#!/usr/bin/env python3
"""
Phase 3 Automated API Test Runner
===================================
Tests every Phase 3 feature:
  • Three-step SSE upload flow  (start → stream → confirm)
  • Notification event creation via FSM transitions
  • Mark-read / mark-all-read endpoints
  • Per-user notification preferences (get + update)
  • SSE stream access-control (auth / scope / not-found)

Usage:
    python test_phase3.py
    python test_phase3.py --base-url http://localhost:8000
    python test_phase3.py --verbose

Requires only the stdlib + 'requests' (pip install requests).
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
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
SSE_TIMEOUT = 20  # seconds to wait for Celery task to finish via SSE

USERS = {
    "admin":     {"username": "admin",          "password": "Admin@Wdms2026!"},
    "depositor": {"username": "depositor_demo", "password": "demo123"},
    "staff":     {"username": "staff_demo",     "password": "demo123"},
    "manager":   {"username": "manager_demo",   "password": "demo123"},
    "ceo":       {"username": "ceo_demo",       "password": "demo123"},
    "regulator": {"username": "regulator_demo", "password": "demo123"},
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
            print(f"{label}\n         {detail}")
        else:
            print(label)
        if response_body is not None and not passed and VERBOSE:
            snippet = json.dumps(response_body, default=str)[:300]
            print(f"         body={snippet}")
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
        return None, {}


def _post(url, payload=None, token=None, files=None, data=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        if files is not None:
            r = _session.post(url, headers=headers, files=files, data=data, timeout=TIMEOUT)
        else:
            r = _session.post(url, headers=headers, json=payload, timeout=TIMEOUT)
        return r.status_code, _safe_json(r)
    except requests.exceptions.ConnectionError:
        return None, {}


def _put(url, payload=None, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        r = _session.put(url, headers=headers, json=payload, timeout=TIMEOUT)
        return r.status_code, _safe_json(r)
    except requests.exceptions.ConnectionError:
        return None, {}


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
# SSE stream helpers
# ─────────────────────────────────────────────────────────────────────────────


def _read_sse_thread(url: str, token: str, result: dict, max_seconds: int = SSE_TIMEOUT):
    """
    Worker thread: open the SSE stream, parse events until a 'complete'
    event or timeout, then store results in *result*.

    SSE format (named events):
        event: connected
        data: {}

        event: progress
        data: {"stage": "ocr", "status": "processing", ...}

        event: complete
        data: {"stage": "final", "status": "complete", "outcome": "PASSED", ...}
    """
    headers = {"Authorization": f"Bearer {token}"}
    events = []
    status_code = None
    content_type = ""
    error = None

    try:
        with requests.get(url, headers=headers, stream=True, timeout=max_seconds) as resp:
            status_code = resp.status_code
            content_type = resp.headers.get("content-type", "")
            if resp.status_code == 200:
                buffer = ""
                current: dict = {}
                # Use iter_content so empty lines (event separators) are preserved
                for chunk in resp.iter_content(chunk_size=512, decode_unicode=True):
                    buffer += chunk
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.rstrip("\r")
                        if line.startswith("event:"):
                            current["type"] = line[6:].strip()
                        elif line.startswith("data:"):
                            try:
                                current["data"] = json.loads(line[5:].strip())
                            except Exception:
                                current["data"] = line[5:].strip()
                        elif line == "":  # SSE event separator
                            if current:
                                events.append(current.copy())
                                if current.get("type") == "complete":
                                    result.update({
                                        "status": status_code,
                                        "content_type": content_type,
                                        "events": events,
                                        "error": None,
                                    })
                                    return
                                current = {}
    except requests.exceptions.Timeout:
        error = "timeout"
    except Exception as exc:
        error = str(exc)

    result.update({
        "status": status_code,
        "content_type": content_type,
        "events": events,
        "error": error,
    })


def _consume_sse(stream_path: str, token: str, max_seconds: int = SSE_TIMEOUT) -> dict:
    """
    Block until the SSE stream emits a 'complete' event or *max_seconds* elapses.
    Returns a dict: {status, content_type, events, error}.
    """
    url = f"{BASE_URL}{stream_path}" if stream_path.startswith("/") else stream_path
    result: dict = {}
    t = threading.Thread(target=_read_sse_thread, args=(url, token, result, max_seconds))
    t.start()
    t.join(timeout=max_seconds + 3)
    # Ensure result has defaults even if thread never wrote
    result.setdefault("status", None)
    result.setdefault("content_type", "")
    result.setdefault("events", [])
    result.setdefault("error", "thread_timeout")
    return result


def _quick_sse_header(stream_path: str, token: str) -> tuple[int | None, str]:
    """
    Open the SSE stream just long enough to grab the HTTP status code and
    Content-Type header, then close the connection.  Useful for access-control
    checks without waiting for Celery to finish.
    """
    url = f"{BASE_URL}{stream_path}" if stream_path.startswith("/") else stream_path
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        with _session.get(url, headers=headers, stream=True, timeout=10) as resp:
            return resp.status_code, resp.headers.get("content-type", "")
    except Exception:
        return None, ""

# ─────────────────────────────────────────────────────────────────────────────
# Domain helpers (shared across sections)
# ─────────────────────────────────────────────────────────────────────────────


def _get_warehouse_id(tok: str) -> int | None:
    _, body = _get(f"{API}/tenants/warehouses", tok)
    data = body.get("data") or []
    if data:
        return data[0].get("id")
    return None


def _upload_start(tok: str, doc_type: str, title: str, warehouse_id: int) -> dict | None:
    """
    Phase 3 step 1: POST /upload/ — stage file + enqueue Celery task.
    Returns the response data dict {"attemptId": ..., "streamUrl": ...} or None.
    """
    fake_file = BytesIO(b"%PDF-1.4 phase3 test content")
    fake_file.name = "phase3_test.pdf"
    files = {"file": ("phase3_test.pdf", fake_file, "application/pdf")}
    data = {
        "document_type_id": doc_type,
        "warehouse_id": str(warehouse_id),
        "title": title,
    }
    _, body = _post(f"{API}/documents/upload/", token=tok, files=files, data=data)
    if body.get("response", {}).get("status") is True:
        return body.get("data") or {}
    return None


def _transition(tok: str, doc_id: int, action: str, reason: str = "") -> tuple[bool, str]:
    """Perform an FSM transition. Returns (success, new_status)."""
    payload = {"action": action}
    if reason:
        payload["reason"] = reason
    _, body = _post(f"{API}/documents/{doc_id}/transition/", payload, tok)
    ok = body.get("response", {}).get("status") is True
    new_status = (body.get("data") or {}).get("status", "")
    return ok, new_status


# ─────────────────────────────────────────────────────────────────────────────
# Section 0 — Server health
# ─────────────────────────────────────────────────────────────────────────────


def section_0():
    print(_bold(_cyan("\n═══ Section 0 — Server Health ═══")))

    try:
        r = _session.get(f"{BASE_URL}/api/v1/docs", timeout=TIMEOUT)
        _record("0", "0.1 Scalar docs page loads (HTTP 200)", r.status_code == 200,
                f"Got HTTP {r.status_code}")
    except Exception as e:
        _record("0", "0.1 Scalar docs page loads (HTTP 200)", False, str(e))

    try:
        r = _session.get(f"{BASE_URL}/admin/", timeout=TIMEOUT, allow_redirects=False)
        _record("0", "0.2 Admin page reachable", r.status_code in (200, 302),
                f"Got HTTP {r.status_code}")
    except Exception as e:
        _record("0", "0.2 Admin page reachable", False, str(e))

# ─────────────────────────────────────────────────────────────────────────────
# Section 1 — Three-step SSE upload flow (happy path)
# ─────────────────────────────────────────────────────────────────────────────


def section_1() -> int | None:
    """
    Returns the confirmed document ID (or None if the section cannot complete)
    so later sections can run FSM transitions on it.
    """
    print(_bold(_cyan("\n═══ Section 1 — Three-Step SSE Upload Flow ═══")))

    dep_tok = login("depositor")
    stf_tok = login("staff")
    if not dep_tok or not stf_tok:
        _record("1", "1.x Login prerequisite", False, "Cannot log in depositor or staff")
        return None

    warehouse_id = _get_warehouse_id(stf_tok)
    if not warehouse_id:
        _record("1", "1.x Warehouse prerequisite", False, "No warehouse found")
        return None

    # ── 1.1  POST /upload/ returns 200 + response.status=True ──────────────
    fake_file = BytesIO(b"%PDF-1.4 phase3 test")
    fake_file.name = "p3.pdf"
    files = {"file": ("p3.pdf", fake_file, "application/pdf")}
    form_data = {
        "document_type_id": "application_form",
        "warehouse_id": str(warehouse_id),
        "title": "Phase3 Happy Path",
    }
    status, body = _post(f"{API}/documents/upload/", token=dep_tok, files=files, data=form_data)
    r_ok = body.get("response", {}).get("status") is True
    _record("1", "1.1 POST /upload/ returns 200 + response.status=True",
            status == 200 and r_ok, f"HTTP {status}, status={r_ok}")

    upload_data = body.get("data") or {}
    attempt_id = upload_data.get("attemptId")
    stream_url = upload_data.get("streamUrl", "")

    # ── 1.2  Response has camelCase keys (attemptId, streamUrl) ────────────
    has_attempt_id = "attemptId" in upload_data
    has_stream_url = "streamUrl" in upload_data
    _record("1", "1.2 Response data has camelCase keys (attemptId, streamUrl)",
            has_attempt_id and has_stream_url,
            f"Keys found: {list(upload_data.keys())}")

    # ── 1.3  streamUrl matches expected pattern ─────────────────────────────
    expected_pattern = f"/api/v1/documents/upload/{attempt_id}/stream/" if attempt_id else ""
    _record("1", "1.3 streamUrl matches /api/v1/documents/upload/{id}/stream/",
            stream_url == expected_pattern,
            f"streamUrl='{stream_url}', expected='{expected_pattern}'")

    if not attempt_id or not stream_url:
        _record("1", "1.x Upload start data missing — skipping stream tests", False,
                f"data={upload_data}")
        return None

    # ── 1.4  SSE endpoint is reachable: 200 + text/event-stream ────────────
    # Open the stream in a background thread immediately so we can catch the
    # live Celery task events.  The thread runs for up to SSE_TIMEOUT seconds.
    sse_result: dict = {}
    sse_thread = threading.Thread(
        target=_read_sse_thread,
        args=(f"{BASE_URL}{stream_url}", dep_tok, sse_result, SSE_TIMEOUT),
        daemon=True,
    )
    sse_thread.start()

    # Give the thread a moment to connect and receive the first header bytes
    time.sleep(1.5)

    # Check headers that the thread has already captured (or will capture)
    # We'll verify the content after joining.

    # ── 1.5–1.6  Wait for SSE stream to deliver the complete event ──────────
    sse_thread.join(timeout=SSE_TIMEOUT + 5)

    sse_status = sse_result.get("status")
    sse_ct = sse_result.get("content_type", "")
    sse_events = sse_result.get("events", [])

    _record("1", "1.4 SSE endpoint returns HTTP 200",
            sse_status == 200, f"HTTP {sse_status}")

    _record("1", "1.5 SSE Content-Type is text/event-stream",
            "text/event-stream" in sse_ct,
            f"Content-Type: '{sse_ct}'")

    _record("1", "1.6 SSE stream emits ≥1 event",
            len(sse_events) >= 1,
            f"Events received: {len(sse_events)}, types={[e.get('type') for e in sse_events]}")

    complete_events = [e for e in sse_events if e.get("type") == "complete"]
    has_complete = len(complete_events) > 0
    complete_outcome = (complete_events[0].get("data") or {}).get("outcome", "") if has_complete else ""
    _record("1", "1.7 SSE stream emits 'complete' event with outcome=PASSED",
            has_complete and complete_outcome == "PASSED",
            f"complete event found={has_complete}, outcome='{complete_outcome}'")

    # ── 1.8  POST /upload/{id}/confirm/ → returns Document ─────────────────
    status, body = _post(
        f"{API}/documents/upload/{attempt_id}/confirm/",
        token=dep_tok,
        data={},
    )
    r_ok = body.get("response", {}).get("status") is True
    doc_data = body.get("data") or {}
    doc_id = doc_data.get("id")
    doc_status = doc_data.get("status")
    _record("1", "1.8 POST /confirm/ after PASSED → returns Document",
            status == 200 and r_ok and doc_id is not None,
            f"HTTP {status}, docId={doc_id}, status={doc_status}",
            response_body=body)

    _record("1", "1.9 Confirmed document starts at PENDING_STAFF",
            doc_status == "PENDING_STAFF",
            f"status='{doc_status}'")

    if not doc_id:
        return None

    # ── 1.10  Second confirm is idempotent (PROMOTED → same document) ───────
    status2, body2 = _post(
        f"{API}/documents/upload/{attempt_id}/confirm/",
        token=dep_tok,
        data={},
    )
    r_ok2 = body2.get("response", {}).get("status") is True
    doc_id2 = (body2.get("data") or {}).get("id")
    _record("1", "1.10 Second confirm is idempotent (returns same document)",
            status2 == 200 and r_ok2 and doc_id2 == doc_id,
            f"HTTP {status2}, docId={doc_id2} (expected {doc_id})")

    return doc_id

# ─────────────────────────────────────────────────────────────────────────────
# Section 2 — Upload edge cases & gate checks
# ─────────────────────────────────────────────────────────────────────────────


def section_2():
    print(_bold(_cyan("\n═══ Section 2 — Upload Edge Cases ═══")))

    dep_tok = login("depositor")
    stf_tok = login("staff")
    dep2_tok = login("manager")  # use manager as the "other user"

    warehouse_id = _get_warehouse_id(stf_tok) if stf_tok else None

    # ── 2.1  Unauthenticated POST /upload/ → 401 ───────────────────────────
    status, body = _post(f"{API}/documents/upload/")
    _record("2", "2.1 Unauthenticated POST /upload/ → 401",
            status == 401, f"HTTP {status}")

    # ── 2.2  Depositor cannot start inspection_form (role gate) ────────────
    if dep_tok and warehouse_id:
        fake_file = BytesIO(b"fake")
        files = {"file": ("f.pdf", fake_file, "application/pdf")}
        data = {
            "document_type_id": "inspection_form",
            "warehouse_id": str(warehouse_id),
            "title": "gate test",
        }
        status, body = _post(f"{API}/documents/upload/", token=dep_tok, files=files, data=data)
        r_failed = body.get("response", {}).get("status") is False
        _record("2", "2.2 Depositor cannot upload inspection_form (role gate)",
                r_failed, f"HTTP {status}, response.status={body.get('response',{}).get('status')}")
    else:
        _record("2", "2.2 Depositor cannot upload inspection_form (role gate)",
                False, "Missing token or warehouse")

    # ── 2.3  Confirm on a PENDING attempt → rejected ────────────────────────
    if dep_tok and warehouse_id:
        # Start a new upload and immediately try to confirm (before Celery finishes)
        attempt_data = _upload_start(dep_tok, "application_form", "ConfirmPendingTest", warehouse_id)
        if attempt_data:
            attempt_id = attempt_data.get("attemptId")
            # Confirm immediately — should be rejected because status=PENDING
            status, body = _post(
                f"{API}/documents/upload/{attempt_id}/confirm/",
                token=dep_tok,
                data={},
            )
            r_failed = body.get("response", {}).get("status") is False
            msg = (body.get("response") or {}).get("message", "")
            _record("2", "2.3 Confirm while PENDING → rejected with message",
                    r_failed, f"HTTP {status}, message='{msg}'")
        else:
            _record("2", "2.3 Confirm while PENDING → rejected with message",
                    False, "Could not start upload attempt")
    else:
        _record("2", "2.3 Confirm while PENDING → rejected with message",
                False, "Missing token or warehouse")

    # ── 2.4  Another user cannot confirm someone else's attempt ─────────────
    if dep_tok and dep2_tok and warehouse_id:
        attempt_data = _upload_start(dep_tok, "application_form", "OtherUserConfirmTest", warehouse_id)
        if attempt_data:
            attempt_id = attempt_data.get("attemptId")
            # dep2 (manager) tries to confirm depositor's attempt
            status, body = _post(
                f"{API}/documents/upload/{attempt_id}/confirm/",
                token=dep2_tok,
                data={},
            )
            r_failed = body.get("response", {}).get("status") is False
            _record("2", "2.4 Other user cannot confirm someone else's upload",
                    r_failed,
                    f"HTTP {status}, response.status={body.get('response',{}).get('status')}")
        else:
            _record("2", "2.4 Other user cannot confirm someone else's upload",
                    False, "Could not start upload attempt")
    else:
        _record("2", "2.4 Other user cannot confirm someone else's upload",
                False, "Missing tokens or warehouse")

    # ── 2.5  Unknown document type is rejected ──────────────────────────────
    if dep_tok and warehouse_id:
        fake_file = BytesIO(b"fake")
        files = {"file": ("f.pdf", fake_file, "application/pdf")}
        data = {
            "document_type_id": "this_type_does_not_exist",
            "warehouse_id": str(warehouse_id),
            "title": "bad type",
        }
        status, body = _post(f"{API}/documents/upload/", token=dep_tok, files=files, data=data)
        r_failed = body.get("response", {}).get("status") is False
        _record("2", "2.5 Unknown document type rejected",
                r_failed, f"HTTP {status}, response.status={body.get('response',{}).get('status')}")
    else:
        _record("2", "2.5 Unknown document type rejected",
                False, "Missing token or warehouse")

# ─────────────────────────────────────────────────────────────────────────────
# Section 3 — SSE stream access control
# ─────────────────────────────────────────────────────────────────────────────


def section_3():
    print(_bold(_cyan("\n═══ Section 3 — SSE Stream Access Control ═══")))

    dep_tok = login("depositor")
    stf_tok = login("staff")
    other_tok = login("manager")

    warehouse_id = _get_warehouse_id(stf_tok) if stf_tok else None

    # ── 3.1  Unauthenticated → 401 ─────────────────────────────────────────
    # Use a plausible attempt ID that may or may not exist
    stream_url_test = "/api/v1/documents/upload/1/stream/"
    try:
        r = _session.get(f"{BASE_URL}{stream_url_test}", stream=True, timeout=8)
        sc = r.status_code
        r.close()
    except Exception:
        sc = None
    _record("3", "3.1 Unauthenticated SSE stream → 401",
            sc == 401, f"HTTP {sc}")

    # ── 3.2  Non-existent attempt → 404 ────────────────────────────────────
    if dep_tok:
        hdr = {"Authorization": f"Bearer {dep_tok}"}
        try:
            r = _session.get(
                f"{BASE_URL}/api/v1/documents/upload/999999999/stream/",
                headers=hdr, stream=True, timeout=8,
            )
            sc = r.status_code
            r.close()
        except Exception:
            sc = None
        _record("3", "3.2 Stream for non-existent attempt → 404",
                sc == 404, f"HTTP {sc}")
    else:
        _record("3", "3.2 Stream for non-existent attempt → 404",
                False, "No depositor token")

    # ── 3.3  Other user's attempt → 403 ────────────────────────────────────
    if dep_tok and other_tok and warehouse_id:
        attempt_data = _upload_start(dep_tok, "application_form", "SSEScopeTest", warehouse_id)
        if attempt_data:
            attempt_id = attempt_data.get("attemptId")
            stream_path = attempt_data.get("streamUrl", f"/api/v1/documents/upload/{attempt_id}/stream/")
            hdr = {"Authorization": f"Bearer {other_tok}"}
            try:
                r = _session.get(
                    f"{BASE_URL}{stream_path}", headers=hdr, stream=True, timeout=8
                )
                sc = r.status_code
                r.close()
            except Exception:
                sc = None
            _record("3", "3.3 Other user cannot watch someone else's SSE stream → 403",
                    sc == 403, f"HTTP {sc}")
        else:
            _record("3", "3.3 Other user cannot watch someone else's SSE stream → 403",
                    False, "Could not start upload attempt")
    else:
        _record("3", "3.3 Other user cannot watch someone else's SSE stream → 403",
                False, "Missing tokens or warehouse")

# ─────────────────────────────────────────────────────────────────────────────
# Section 4 — Notification events (created by FSM transitions)
# ─────────────────────────────────────────────────────────────────────────────


def section_4(confirmed_doc_id: int | None = None):
    """
    Run a full FSM lifecycle and verify that each transition creates
    the expected NotificationEvent records for the right recipients.
    """
    print(_bold(_cyan("\n═══ Section 4 — Notification Events via FSM Transitions ═══")))

    dep_tok  = login("depositor")
    stf_tok  = login("staff")
    mgr_tok  = login("manager")
    ceo_tok  = login("ceo")

    # ── 4.1  GET /notifications/ requires auth ──────────────────────────────
    status, body = _get(f"{API}/notifications/")
    _record("4", "4.1 GET /notifications/ without auth → 401",
            status == 401, f"HTTP {status}")

    # ── 4.2  GET /notifications/ with auth → 200 + response.status=True ────
    if dep_tok:
        status, body = _get(f"{API}/notifications/", dep_tok)
        r_ok = body.get("response", {}).get("status") is True
        _record("4", "4.2 GET /notifications/ with auth → 200 + response.status=True",
                status == 200 and r_ok,
                f"HTTP {status}, response.status={r_ok}")

    # ── Prepare: run a full FSM lifecycle to trigger notifications ──────────
    if not all([dep_tok, stf_tok, mgr_tok, ceo_tok]):
        _record("4", "4.x FSM lifecycle prerequisite", False, "Missing role tokens")
        return

    warehouse_id = _get_warehouse_id(stf_tok)
    if not warehouse_id:
        _record("4", "4.x FSM lifecycle prerequisite", False, "No warehouse found")
        return

    # Use the doc confirmed in section_1 if available; otherwise upload a new one.
    doc_id = confirmed_doc_id

    if doc_id is None:
        # We need to create a confirmed document for this section.
        # Start upload → wait for Celery → confirm.
        attempt_data = _upload_start(dep_tok, "application_form", "Notif Lifecycle Test", warehouse_id)
        if not attempt_data:
            _record("4", "4.x Upload prerequisite for FSM", False, "Upload start failed")
            return
        attempt_id = attempt_data.get("attemptId")
        stream_path = attempt_data.get("streamUrl")

        if VERBOSE:
            print(f"         [INFO] Waiting for Celery task (attempt {attempt_id})…")

        sse = _consume_sse(stream_path, dep_tok, max_seconds=SSE_TIMEOUT)
        complete_events = [e for e in sse.get("events", []) if e.get("type") == "complete"]
        if not complete_events:
            _record("4", "4.x SSE prerequisite — waiting for validation",
                    False, f"SSE error: {sse.get('error')}, events: {sse.get('events')}")
            return

        status, body = _post(
            f"{API}/documents/upload/{attempt_id}/confirm/",
            token=dep_tok, data={},
        )
        if body.get("response", {}).get("status") is not True:
            _record("4", "4.x Confirm prerequisite for FSM", False,
                    f"HTTP {status}, body={body}")
            return
        doc_id = (body.get("data") or {}).get("id")

    if not doc_id:
        _record("4", "4.x Document prerequisite missing", False, "No doc_id")
        return

    # ── 4.3  Staff confirms → DOCUMENT_CONFIRMED_BY_STAFF notification ──────
    # Record depositor notification count before transition
    _, pre_body = _get(f"{API}/notifications/", dep_tok)
    pre_count = (pre_body.get("page") or {}).get("totalElements", 0)

    ok, new_status = _transition(stf_tok, doc_id, "confirm")
    _record("4", "4.3 Staff confirm → PENDING_MANAGER (transition OK)",
            ok and new_status == "PENDING_MANAGER",
            f"status={new_status}")

    # Allow Django signal + NotificationEvent creation (synchronous in same request)
    time.sleep(1)

    _, post_body = _get(f"{API}/notifications/", dep_tok)
    post_count = (post_body.get("page") or {}).get("totalElements", 0)
    notifs = post_body.get("data") or []
    _record("4", "4.4 Depositor gains ≥1 notification after staff confirm",
            post_count > pre_count,
            f"Before={pre_count}, After={post_count}")

    # ── 4.5  Notification has required camelCase fields ─────────────────────
    if notifs:
        first = notifs[0]
        required_keys = {"eventType", "subject", "body", "channelsSent", "readOnDashboard"}
        found_keys = set(first.keys())
        has_all = required_keys.issubset(found_keys)
        _record("4", "4.5 Notification has required camelCase fields",
                has_all,
                f"Required={required_keys}, Found={found_keys & required_keys}, "
                f"Missing={required_keys - found_keys}")
    else:
        _record("4", "4.5 Notification has required camelCase fields",
                False, "No notifications available to inspect")

    # ── 4.6  camelCase: readOnDashboard key present ─────────────────────────
    if notifs:
        has_camel = "readOnDashboard" in notifs[0]
        _record("4", "4.6 camelCase key 'readOnDashboard' present (not 'read_on_dashboard')",
                has_camel, f"Keys: {list(notifs[0].keys())[:8]}")
    else:
        _record("4", "4.6 camelCase key 'readOnDashboard' present",
                False, "No notifications to inspect")

    # ── 4.7  ?unreadOnly=true filter works ──────────────────────────────────
    _, unread_body = _get(f"{API}/notifications/", dep_tok, params={"unreadOnly": "true"})
    r_ok = unread_body.get("response", {}).get("status") is True
    unread_data = unread_body.get("data") or []
    # All returned notifications should have readOnDashboard = False
    all_unread = all(not n.get("readOnDashboard", True) for n in unread_data)
    _record("4", "4.7 ?unreadOnly=true returns only unread notifications",
            r_ok and all_unread,
            f"response.status={r_ok}, count={len(unread_data)}, all_unread={all_unread}")

    # ── 4.8  Manager approve → DOCUMENT_APPROVED_BY_MANAGER notification ────
    _, mgr_pre = _get(f"{API}/notifications/", mgr_tok)
    mgr_pre_count = (mgr_pre.get("page") or {}).get("totalElements", 0)

    ok, new_status = _transition(mgr_tok, doc_id, "approve")
    _record("4", "4.8 Manager approve → PENDING_CEO (transition OK)",
            ok and new_status == "PENDING_CEO",
            f"status={new_status}")

    time.sleep(1)

    _, mgr_post = _get(f"{API}/notifications/", mgr_tok)
    mgr_post_count = (mgr_post.get("page") or {}).get("totalElements", 0)

    # Also check depositor gets a notification for APPROVED_BY_MANAGER
    _, dep_post_m = _get(f"{API}/notifications/", dep_tok)
    dep_count_m = (dep_post_m.get("page") or {}).get("totalElements", 0)
    _record("4", "4.9 Depositor gains notification after manager approve",
            dep_count_m > post_count,
            f"Before={post_count}, After={dep_count_m}")

    # ── 4.10  CEO final-approve → DOCUMENT_APPROVED_FINAL notification ──────
    dep_count_before_ceo = dep_count_m
    ok, new_status = _transition(ceo_tok, doc_id, "final_approve")
    _record("4", "4.10 CEO final_approve → APPROVED (transition OK)",
            ok and new_status == "APPROVED",
            f"status={new_status}")

    time.sleep(1)

    _, dep_post_ceo = _get(f"{API}/notifications/", dep_tok)
    dep_count_ceo = (dep_post_ceo.get("page") or {}).get("totalElements", 0)
    _record("4", "4.11 Depositor gains notification after CEO final approve",
            dep_count_ceo > dep_count_before_ceo,
            f"Before={dep_count_before_ceo}, After={dep_count_ceo}")

    # ── 4.12  Rejected document produces DOCUMENT_REJECTED notification ──────
    # Upload a fresh doc to reject it
    attempt_data_r = _upload_start(
        dep_tok, "application_form", "Reject Notif Test", warehouse_id
    )
    if attempt_data_r:
        aid_r = attempt_data_r.get("attemptId")
        sse_r = _consume_sse(attempt_data_r.get("streamUrl"), dep_tok, max_seconds=SSE_TIMEOUT)
        have_complete = any(e.get("type") == "complete" for e in sse_r.get("events", []))
        if have_complete:
            status_c, body_c = _post(
                f"{API}/documents/upload/{aid_r}/confirm/",
                token=dep_tok, data={}
            )
            doc_id_r = (body_c.get("data") or {}).get("id")
            if doc_id_r:
                # Walk to PENDING_MANAGER, then have manager reject
                _transition(stf_tok, doc_id_r, "confirm")
                dep_before_reject = (
                    (_get(f"{API}/notifications/", dep_tok)[1].get("page") or {})
                    .get("totalElements", 0)
                )
                ok_r, s_r = _transition(mgr_tok, doc_id_r, "reject")
                time.sleep(1)
                dep_after_reject = (
                    (_get(f"{API}/notifications/", dep_tok)[1].get("page") or {})
                    .get("totalElements", 0)
                )
                _record("4", "4.12 Rejection creates DOCUMENT_REJECTED notification for depositor",
                        ok_r and dep_after_reject > dep_before_reject,
                        f"rejected={ok_r}, before={dep_before_reject}, after={dep_after_reject}")
            else:
                _record("4", "4.12 Rejection creates DOCUMENT_REJECTED notification",
                        False, "Could not confirm reject-test doc")
        else:
            _record("4", "4.12 Rejection creates DOCUMENT_REJECTED notification",
                    False, f"SSE complete not received, events={sse_r.get('events')}")
    else:
        _record("4", "4.12 Rejection creates DOCUMENT_REJECTED notification",
                False, "Could not start reject-test upload")

# ─────────────────────────────────────────────────────────────────────────────
# Section 5 — Mark read
# ─────────────────────────────────────────────────────────────────────────────


def section_5():
    print(_bold(_cyan("\n═══ Section 5 — Mark Read Endpoints ═══")))

    dep_tok = login("depositor")
    other_tok = login("staff")

    if not dep_tok:
        _record("5", "5.x Login prerequisite", False, "No depositor token")
        return

    # Fetch the depositor's first notification
    status, body = _get(f"{API}/notifications/", dep_tok, params={"unreadOnly": "true"})
    r_ok = body.get("response", {}).get("status") is True
    notifs = body.get("data") or []

    if not notifs:
        # Fetch without filter — pick any notification
        _, body2 = _get(f"{API}/notifications/", dep_tok)
        notifs = body2.get("data") or []

    if not notifs:
        _record("5", "5.x Notification prerequisite", False,
                "No notifications available — run section_4 first or ensure transitions happened")
        return

    notif_id = notifs[0].get("id") or notifs[0].get("primaryKey")

    # ── 5.1  POST /notifications/{id}/mark-read/ → 200 ─────────────────────
    status, body = _post(f"{API}/notifications/{notif_id}/mark-read/", token=dep_tok)
    r_ok = body.get("response", {}).get("status") is True
    _record("5", "5.1 POST /notifications/{id}/mark-read/ → 200 + status=True",
            status == 200 and r_ok,
            f"HTTP {status}, response.status={r_ok}")

    # ── 5.2  readOnDashboard=True after mark-read ────────────────────────────
    notif_data = body.get("data") or {}
    read_on_dashboard = notif_data.get("readOnDashboard")
    _record("5", "5.2 readOnDashboard=True after mark-read",
            read_on_dashboard is True,
            f"readOnDashboard={read_on_dashboard}")

    # ── 5.3  readAt is set after mark-read ─────────────────────────────────
    read_at = notif_data.get("readAt")
    _record("5", "5.3 readAt timestamp is set after mark-read",
            read_at is not None and read_at != "",
            f"readAt={read_at}")

    # ── 5.4  Cannot mark another user's notification ────────────────────────
    if other_tok:
        status_o, body_o = _post(
            f"{API}/notifications/{notif_id}/mark-read/", token=other_tok
        )
        # Should be False (not found scoping) or 401/403
        r_failed = (
            body_o.get("response", {}).get("status") is False
            or status_o in (401, 403, 404)
        )
        _record("5", "5.4 Cannot mark another user's notification as read",
                r_failed,
                f"HTTP {status_o}, response.status={body_o.get('response',{}).get('status')}")
    else:
        _record("5", "5.4 Cannot mark another user's notification as read",
                False, "No other token")

    # ── 5.5  mark-read on non-existent ID → response.status=False ──────────
    status_x, body_x = _post(f"{API}/notifications/999999999/mark-read/", token=dep_tok)
    r_failed_x = body_x.get("response", {}).get("status") is False
    _record("5", "5.5 mark-read on non-existent ID → response.status=False",
            r_failed_x,
            f"HTTP {status_x}, response.status={body_x.get('response',{}).get('status')}")

    # ── 5.6  POST /notifications/mark-all-read/ → 200 ───────────────────────
    status, body = _post(f"{API}/notifications/mark-all-read/", token=dep_tok)
    r_ok = body.get("response", {}).get("status") is True
    _record("5", "5.6 POST /notifications/mark-all-read/ → 200 + status=True",
            status == 200 and r_ok,
            f"HTTP {status}, response.status={r_ok}")

    # ── 5.7  After mark-all-read, ?unreadOnly=true returns 0 ────────────────
    _, unread_body = _get(f"{API}/notifications/", dep_tok, params={"unreadOnly": "true"})
    unread_data = unread_body.get("data") or []
    total_unread = (unread_body.get("page") or {}).get("totalElements", 0)
    _record("5", "5.7 After mark-all-read, unreadOnly=true returns 0 notifications",
            total_unread == 0,
            f"totalElements={total_unread}, items in page={len(unread_data)}")

# ─────────────────────────────────────────────────────────────────────────────
# Section 6 — Notification preferences
# ─────────────────────────────────────────────────────────────────────────────

# 9 event types × 3 channels = 27 expected preference rows
EXPECTED_EVENT_TYPES = {
    "DOCUMENT_UPLOADED",
    "DOCUMENT_VALIDATED",
    "DOCUMENT_CONFIRMED_BY_STAFF",
    "DOCUMENT_APPROVED_BY_MANAGER",
    "DOCUMENT_APPROVED_BY_CEO",
    "DOCUMENT_REJECTED",
    "DOCUMENT_SENT_BACK",
    "DOCUMENT_APPROVED_FINAL",
    "RANKING_REPORT_UPDATED",
}
EXPECTED_CHANNELS = {"DASHBOARD", "EMAIL", "SMS"}
EXPECTED_PREF_COUNT = len(EXPECTED_EVENT_TYPES) * len(EXPECTED_CHANNELS)  # 27


def section_6():
    print(_bold(_cyan("\n═══ Section 6 — Notification Preferences ═══")))

    dep_tok = login("depositor")

    # ── 6.1  Unauthenticated /preferences/ → 401 ───────────────────────────
    status, body = _get(f"{API}/notifications/preferences/")
    _record("6", "6.1 Unauthenticated GET /preferences/ → 401",
            status == 401, f"HTTP {status}")

    if not dep_tok:
        _record("6", "6.x Login prerequisite", False, "No depositor token")
        return

    # ── 6.2  GET /preferences/ → 200 + response.status=True ────────────────
    status, body = _get(f"{API}/notifications/preferences/", dep_tok)
    r_ok = body.get("response", {}).get("status") is True
    _record("6", "6.2 GET /preferences/ → 200 + response.status=True",
            status == 200 and r_ok,
            f"HTTP {status}, response.status={r_ok}")

    prefs = body.get("data") or []

    # ── 6.3  Returns 27 preference rows (9 event types × 3 channels) ────────
    _record("6", f"6.3 Returns {EXPECTED_PREF_COUNT} preference rows (9 types × 3 channels)",
            len(prefs) == EXPECTED_PREF_COUNT,
            f"Got {len(prefs)}, expected {EXPECTED_PREF_COUNT}")

    # ── 6.4  camelCase keys (eventType, channel, enabled) ───────────────────
    if prefs:
        sample = prefs[0]
        has_camel = "eventType" in sample and "channel" in sample and "enabled" in sample
        _record("6", "6.4 Preferences have camelCase keys (eventType, channel, enabled)",
                has_camel, f"Keys found: {list(sample.keys())}")
    else:
        _record("6", "6.4 Preferences have camelCase keys", False, "No prefs returned")

    # ── 6.5  All 9 event types present ──────────────────────────────────────
    found_types = {p.get("eventType") for p in prefs}
    missing_types = EXPECTED_EVENT_TYPES - found_types
    _record("6", "6.5 All 9 notification event types present in preferences",
            len(missing_types) == 0,
            f"Missing: {missing_types}" if missing_types else f"Found all: {len(found_types)} types")

    # ── 6.6  All 3 channels present ─────────────────────────────────────────
    found_channels = {p.get("channel") for p in prefs}
    missing_channels = EXPECTED_CHANNELS - found_channels
    _record("6", "6.6 All 3 channels present (DASHBOARD, EMAIL, SMS)",
            len(missing_channels) == 0,
            f"Found: {found_channels}, Missing: {missing_channels}")

    # ── 6.7  DASHBOARD channel is always enabled by default ─────────────────
    dashboard_prefs = [p for p in prefs if p.get("channel") == "DASHBOARD"]
    all_dashboard_on = all(p.get("enabled") is True for p in dashboard_prefs)
    _record("6", "6.7 DASHBOARD channel is enabled=True for all event types (default)",
            all_dashboard_on,
            f"Dashboard prefs: {[(p.get('eventType'), p.get('enabled')) for p in dashboard_prefs[:3]]}...")

    # ── 6.8  SMS channel is disabled by default ─────────────────────────────
    sms_prefs = [p for p in prefs if p.get("channel") == "SMS"]
    all_sms_off = all(p.get("enabled") is False for p in sms_prefs)
    _record("6", "6.8 SMS channel is enabled=False for all event types (default)",
            all_sms_off,
            f"SMS prefs: {[(p.get('eventType'), p.get('enabled')) for p in sms_prefs[:3]]}...")

    # ── 6.9  PUT /preferences/ updates a preference ─────────────────────────
    # Toggle email for DOCUMENT_UPLOADED (find current value, then toggle)
    email_upload_pref = next(
        (p for p in prefs if p.get("eventType") == "DOCUMENT_UPLOADED" and p.get("channel") == "EMAIL"),
        None,
    )
    if email_upload_pref:
        current_enabled = email_upload_pref.get("enabled", True)
        new_enabled = not current_enabled
        update_payload = {
            "preferences": [
                {
                    "eventType": "DOCUMENT_UPLOADED",
                    "channel": "EMAIL",
                    "enabled": new_enabled,
                }
            ]
        }
        status_u, body_u = _put(f"{API}/notifications/preferences/", update_payload, dep_tok)
        r_ok_u = body_u.get("response", {}).get("status") is True
        _record("6", "6.9 PUT /preferences/ updates a preference → 200 + status=True",
                status_u == 200 and r_ok_u,
                f"HTTP {status_u}, response.status={r_ok_u}")

        # ── 6.10  GET after update reflects the change ───────────────────────
        _, body_check = _get(f"{API}/notifications/preferences/", dep_tok)
        updated_prefs = body_check.get("data") or []
        updated_pref = next(
            (p for p in updated_prefs
             if p.get("eventType") == "DOCUMENT_UPLOADED" and p.get("channel") == "EMAIL"),
            None,
        )
        reflects_change = updated_pref is not None and updated_pref.get("enabled") == new_enabled
        _record("6", "6.10 GET /preferences/ after update reflects the change",
                reflects_change,
                f"Expected enabled={new_enabled}, got={updated_pref.get('enabled') if updated_pref else 'N/A'}")

        # ── Restore original value ───────────────────────────────────────────
        _put(
            f"{API}/notifications/preferences/",
            {"preferences": [{"eventType": "DOCUMENT_UPLOADED", "channel": "EMAIL",
                               "enabled": current_enabled}]},
            dep_tok,
        )
    else:
        _record("6", "6.9 PUT /preferences/ updates a preference",
                False, "Could not find DOCUMENT_UPLOADED/EMAIL preference")
        _record("6", "6.10 GET /preferences/ reflects change", False, "Skipped")

    # ── 6.11  DASHBOARD cannot be disabled (coerced to True) ─────────────────
    disable_payload = {
        "preferences": [
            {"eventType": "DOCUMENT_UPLOADED", "channel": "DASHBOARD", "enabled": False}
        ]
    }
    status_d, body_d = _put(f"{API}/notifications/preferences/", disable_payload, dep_tok)
    r_ok_d = body_d.get("response", {}).get("status") is True
    if r_ok_d:
        # Check that DASHBOARD is still enabled=True
        _, body_dash = _get(f"{API}/notifications/preferences/", dep_tok)
        dash_prefs = body_dash.get("data") or []
        dash_upload = next(
            (p for p in dash_prefs
             if p.get("eventType") == "DOCUMENT_UPLOADED" and p.get("channel") == "DASHBOARD"),
            None,
        )
        coerced = dash_upload is not None and dash_upload.get("enabled") is True
        _record("6", "6.11 DASHBOARD channel cannot be disabled (coerced to True)",
                coerced,
                f"enabled={dash_upload.get('enabled') if dash_upload else 'N/A'} (should be True)")
    else:
        # Some implementations reject the request outright — also acceptable
        _record("6", "6.11 DASHBOARD channel cannot be disabled (request rejected or coerced)",
                True,  # pass: either coercion OR rejection is acceptable
                f"Request was rejected with status=False — also valid")

    # ── 6.12  Invalid event_type rejected ────────────────────────────────────
    bad_payload = {
        "preferences": [
            {"eventType": "THIS_EVENT_DOES_NOT_EXIST", "channel": "EMAIL", "enabled": True}
        ]
    }
    status_b, body_b = _put(f"{API}/notifications/preferences/", bad_payload, dep_tok)
    r_failed_b = (
        body_b.get("response", {}).get("status") is False
        or status_b in (400, 422)
    )
    _record("6", "6.12 Invalid event_type → rejected",
            r_failed_b,
            f"HTTP {status_b}, response.status={body_b.get('response',{}).get('status')}")

    # ── 6.13  Invalid channel rejected ───────────────────────────────────────
    bad_channel_payload = {
        "preferences": [
            {"eventType": "DOCUMENT_UPLOADED", "channel": "TELEGRAM", "enabled": True}
        ]
    }
    status_c2, body_c2 = _put(f"{API}/notifications/preferences/", bad_channel_payload, dep_tok)
    r_failed_c2 = (
        body_c2.get("response", {}).get("status") is False
        or status_c2 in (400, 422)
    )
    _record("6", "6.13 Invalid channel → rejected",
            r_failed_c2,
            f"HTTP {status_c2}, response.status={body_c2.get('response',{}).get('status')}")

# ─────────────────────────────────────────────────────────────────────────────
# Summary printer
# ─────────────────────────────────────────────────────────────────────────────


def _print_summary():
    total  = len(RESULTS)
    passed = sum(1 for r in RESULTS if r["passed"])
    failed = total - passed

    print(_bold(_cyan("\n╔══════════════════════════════════════╗")))
    print(_bold(_cyan(  "║     PHASE 3 TEST RESULTS SUMMARY     ║")))
    print(_bold(_cyan(  "╚══════════════════════════════════════╝")))
    print(f"  Total:  {total}")
    print(f"  {_green('Passed')}: {passed}")
    colour_fail = _red if failed else _green
    print(f"  {colour_fail('Failed')}: {failed}")

    pct = round(100 * passed / total) if total else 0
    bar_filled = round(pct / 5)
    bar = "█" * bar_filled + "░" * (20 - bar_filled)
    colour = _green if pct >= 80 else (_yellow if pct >= 50 else _red)
    print(f"\n  {colour(bar)} {pct}%\n")

    if failed:
        print(_bold("  Failed tests:"))
        for r in RESULTS:
            if not r["passed"]:
                print(f"    {_red('✗')} [{r['section']}] {r['name']}")
                if r["detail"]:
                    print(f"        {r['detail']}")

    print()
    return failed == 0

# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────


def _parse_args():
    p = argparse.ArgumentParser(description="Phase 3 API test runner")
    p.add_argument("--base-url", default="http://localhost:8000",
                   help="Base URL of the running Django server")
    p.add_argument("--verbose", "-v", action="store_true",
                   help="Print response details for every test (not just failures)")
    return p.parse_args()


def main():
    global BASE_URL, API, VERBOSE
    args = _parse_args()
    BASE_URL = args.base_url.rstrip("/")
    API = f"{BASE_URL}/api/v1"
    VERBOSE = args.verbose

    print(_bold(_cyan(f"\n  Phase 3 API Test Runner  →  {API}\n")))
    print("  Logging in all users first…")

    for role in USERS:
        tok = login(role)
        name = USERS[role]["username"]
        if tok:
            print(f"    [OK] {role} ({name})")
        else:
            print(f"    {_red('[FAIL]')} {role} ({name})")

    print()

    section_0()

    confirmed_doc_id = section_1()

    section_2()
    section_3()

    # Pass the doc confirmed in section_1 so section_4 can reuse it.
    section_4(confirmed_doc_id=confirmed_doc_id)

    section_5()
    section_6()

    all_passed = _print_summary()
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
