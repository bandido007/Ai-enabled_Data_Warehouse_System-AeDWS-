"""End-to-end: Staff uploads warehouse_receipt -> Manager approves -> Depositor sees it"""
import requests, io, sys, time

BASE = "http://localhost:8001/api/v1"
CREDS = {
    "admin":     ("admin",          "Admin@Wdms2026!"),
    "staff":     ("staff_demo",     "demo1234"),
    "manager":   ("manager_demo",   "demo1234"),
    "depositor": ("depositor_demo", "demo1234"),
}

def login(role):
    u, p = CREDS[role]
    return requests.post(f"{BASE}/auth/login", json={"username":u,"password":p}, timeout=10).json().get("access")

def hdrs(tok): return {"Authorization": f"Bearer {tok}"}

def get_data(resp):
    d = resp.json()
    return d.get("data") if isinstance(d, dict) and "data" in d else d

def doc_ids_for(tok):
    items = get_data(requests.get(f"{BASE}/documents/", headers=hdrs(tok), timeout=10))
    return [x.get("id") for x in (items if isinstance(items, list) else [])]

def wait_for_stream(tok, stream_url, timeout=60):
    """Consume SSE stream until 'complete' or 'error' event."""
    url = f"http://localhost:8001{stream_url}" if stream_url.startswith("/") else stream_url
    print(f"   streaming {url} ...")
    deadline = time.time() + timeout
    with requests.get(url, headers=hdrs(tok), stream=True, timeout=timeout) as resp:
        for line in resp.iter_lines():
            if time.time() > deadline:
                print("   ⚠ stream timeout"); return False
            if not line:
                continue
            text = line.decode("utf-8") if isinstance(line, bytes) else line
            if "complete" in text:
                print(f"   stream done: {text[:80]}")
                return True
            if "error" in text.lower():
                print(f"   stream error: {text[:80]}")
                return True  # still try to confirm
    return True

# 0. Login
print("0. Login")
staff_tok = login("staff"); manager_tok = login("manager"); dep_tok = login("depositor"); admin_tok = login("admin")
assert all([staff_tok, manager_tok, dep_tok, admin_tok]), "Login failed"
print("   OK")

# 1. Warehouse
print("1. Warehouse")
items = get_data(requests.get(f"{BASE}/tenants/warehouses", headers=hdrs(admin_tok), timeout=10))
wh_id = items[0]["id"] if isinstance(items, list) and items else 1
print(f"   wh_id={wh_id}")

# 2. Staff uploads
print("2. Staff uploads warehouse_receipt")
pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref 200\n%%EOF"
r = requests.post(f"{BASE}/documents/upload/", headers=hdrs(staff_tok),
    files={"file":("receipt.pdf", io.BytesIO(pdf), "application/pdf")},
    data={"document_type_id":"warehouse_receipt","warehouse_id":str(wh_id),"title":"Test Receipt"},
    timeout=30)
ud = get_data(r)
print(f"   {r.status_code} data={ud}")
aid = (ud or {}).get("attemptId") or (ud or {}).get("attempt_id") or (ud or {}).get("id")
stream_url = (ud or {}).get("streamUrl") or (ud or {}).get("stream_url", "")
assert aid, f"Upload failed: {r.json()}"
print(f"   attemptId={aid}")

# 3. Wait for AI stream
print("3. Waiting for AI validation stream")
wait_for_stream(staff_tok, stream_url)

# 4. Confirm
print("4. Confirm upload")
r4 = requests.post(f"{BASE}/documents/upload/{aid}/confirm/", headers=hdrs(staff_tok),
    data={"soft_warning_override":"true"}, timeout=20)
cd = get_data(r4)
print(f"   {r4.status_code} data={cd}")
doc_id = (cd or {}).get("documentId") or (cd or {}).get("document_id") or (cd or {}).get("id")
assert doc_id, f"Confirm failed: {r4.json()}"
print(f"   doc_id={doc_id} status={(cd or {}).get('status')}")

# 5. Depositor before approval
print("5. Depositor docs BEFORE approval")
before = doc_ids_for(dep_tok)
print(f"   ids={before}  doc visible (expect False): {doc_id in before}")

# 6. Manager approves
print("6. Manager approves")
r6 = requests.post(f"{BASE}/documents/{doc_id}/transition/", headers=hdrs(manager_tok),
    json={"action":"approve","reason":""}, timeout=15)
td = get_data(r6)
print(f"   {r6.status_code} status={(td or {}).get('status','?')}")

# 7. Depositor after approval
print("7. Depositor docs AFTER approval")
after = doc_ids_for(dep_tok)
print(f"   ids={after}  doc visible (expect True): {doc_id in after}")

print()
if doc_id in after:
    print("==> PASS: depositor can see the approved warehouse receipt")
else:
    print("==> FAIL: depositor cannot see approved receipt")
    rd = requests.get(f"{BASE}/documents/{doc_id}/", headers=hdrs(manager_tok), timeout=10)
    info = get_data(rd) or {}
    print(f"    doc: status={info.get('status')}, wh={info.get('warehouse')}, type={info.get('documentTypeId')}")
