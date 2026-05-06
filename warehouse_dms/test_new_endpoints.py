#!/usr/bin/env python3
"""
Smoke test for the two new endpoints added in the mini-phase:
  1. POST /api/v1/documents/transitions/bulk/
  2. GET  /api/v1/regulatory/warehouses/{id}/statistics/
"""
import sys
import json
import requests

BASE = "http://localhost:8001/api/v1"
SEP  = "─" * 60

USERS = {
    "admin":     {"username": "admin",          "password": "Admin@Wdms2026!"},
    "regulator": {"username": "regulator_demo", "password": "demo123"},
    "depositor": {"username": "depositor_demo", "password": "demo123"},
}

def login(role):
    r = requests.post(f"{BASE}/auth/login", json=USERS[role], timeout=10)
    token = r.json().get("access", "")
    assert token, f"Login failed for {role}: {r.text[:200]}"
    return token

def hdr(token):
    return {"Authorization": f"Bearer {token}"}

def pp(label, status, body):
    ok = "✓" if (200 <= status < 300) else "✗"
    print(f"\n{ok} [{status}] {label}")
    try:
        parsed = body if isinstance(body, dict) else json.loads(body)
        print(json.dumps(parsed, indent=2)[:1200])
    except Exception:
        print(body[:400])

# ── 1. Login ──────────────────────────────────────────────────────────────────
print(SEP)
print("STEP 1 — Login")
print(SEP)
admin_tok     = login("admin");     print("  admin        ✓")
reg_tok       = login("regulator"); print("  regulator    ✓")
dep_tok       = login("depositor"); print("  depositor    ✓")

# ── 2. Get warehouse IDs ──────────────────────────────────────────────────────
print(f"\n{SEP}")
print("STEP 2 — Discover warehouses")
print(SEP)
r = requests.get(f"{BASE}/tenants/warehouses", headers=hdr(admin_tok), timeout=10)
warehouses = r.json().get("data", [])
if not warehouses:
    print("  ⚠ No warehouses found – regulatory stats test will use id=1")
    wh_id = 1
else:
    wh_id = warehouses[0]["id"]
    for w in warehouses:
        print(f"  id={w['id']}  name={w.get('name','?')}")

# ── 3. GET /regulatory/warehouses/{id}/statistics/ ───────────────────────────
print(f"\n{SEP}")
print("TEST A — GET /regulatory/warehouses/{id}/statistics/")
print(SEP)

# 3a. Admin can access
r = requests.get(f"{BASE}/regulatory/warehouses/{wh_id}/statistics/",
                 headers=hdr(admin_tok), timeout=10)
pp(f"Admin → warehouse {wh_id}", r.status_code, r.json())

# 3b. Regulator can access
r = requests.get(f"{BASE}/regulatory/warehouses/{wh_id}/statistics/",
                 headers=hdr(reg_tok), timeout=10)
pp(f"Regulator → warehouse {wh_id}", r.status_code, r.json())

# 3c. Depositor should be DENIED
r = requests.get(f"{BASE}/regulatory/warehouses/{wh_id}/statistics/",
                 headers=hdr(dep_tok), timeout=10)
expected_fail = r.status_code in (401, 403) or r.json().get("response", {}).get("status") is False
label = f"Depositor → warehouse {wh_id}  (expect DENIED: {expected_fail})"
pp(label, r.status_code, r.json())

# 3d. Non-existent warehouse
r = requests.get(f"{BASE}/regulatory/warehouses/999999/statistics/",
                 headers=hdr(admin_tok), timeout=10)
pp("Admin → warehouse 999999 (expect not-found)", r.status_code, r.json())

# 3e. Unauthenticated
r = requests.get(f"{BASE}/regulatory/warehouses/{wh_id}/statistics/", timeout=10)
pp("No token (expect 401)", r.status_code, r.text)

# ── 4. POST /documents/transitions/bulk/ ─────────────────────────────────────
print(f"\n{SEP}")
print("TEST B — POST /documents/transitions/bulk/")
print(SEP)

# 4a. Discover some document IDs
r = requests.get(f"{BASE}/documents/", headers=hdr(admin_tok), timeout=10)
docs = r.json().get("data", [])
doc_ids = [d["id"] for d in docs[:3]] if docs else []
print(f"  Using document ids: {doc_ids if doc_ids else '(none found, will test empty + invalid)'}")

# 4b. Valid bulk request
if doc_ids:
    r = requests.post(f"{BASE}/documents/transitions/bulk/",
                      json={"documentIds": doc_ids},
                      headers=hdr(admin_tok), timeout=10)
    pp(f"Admin bulk transitions {doc_ids}", r.status_code, r.json())

# 4c. Empty list → should succeed (0 results) or business-fail gracefully
r = requests.post(f"{BASE}/documents/transitions/bulk/",
                  json={"documentIds": []},
                  headers=hdr(admin_tok), timeout=10)
pp("Empty documentIds []", r.status_code, r.json())

# 4d. Over limit (101 IDs)
r = requests.post(f"{BASE}/documents/transitions/bulk/",
                  json={"documentIds": list(range(1, 102))},
                  headers=hdr(admin_tok), timeout=10)
pp("101 IDs (expect limit error)", r.status_code, r.json())

# 4e. Unauthenticated
r = requests.post(f"{BASE}/documents/transitions/bulk/",
                  json={"documentIds": [1]}, timeout=10)
pp("No token (expect 401)", r.status_code, r.text)

# 4f. Depositor (should only see their own documents but not be denied the endpoint)
r = requests.post(f"{BASE}/documents/transitions/bulk/",
                  json={"documentIds": doc_ids if doc_ids else [1]},
                  headers=hdr(dep_tok), timeout=10)
pp(f"Depositor bulk transitions {doc_ids if doc_ids else [1]}", r.status_code, r.json())

print(f"\n{SEP}")
print("ALL TESTS COMPLETE")
print(SEP)
