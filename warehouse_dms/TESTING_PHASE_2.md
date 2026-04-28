# Phase 2 — Manual Test Plan (Scalar UI)

This document is the manual test checklist for the document workflow built in
Phase 2. It assumes the stack is already up via `docker compose up -d --build`,
all migrations have run, and `seed_permissions` + `seed_demo_documents` have
been executed. Every test below uses the **Scalar API reference** at
[http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs) — no curl
required.

If anything in section 0 fails, stop and fix that before moving on. Sections 1
through 6 build on each other; running them in order is the fastest path. Each
test states what to send, what success looks like, and what failure means
diagnostically.

---

## Demo accounts (created by `seed_demo_documents`)

| Username          | Role       | Tenant          | Warehouse       |
|-------------------|------------|-----------------|-----------------|
| `admin`           | ADMIN      | —               | —               |
| `depositor_demo`  | DEPOSITOR  | Demo Tenant     | Demo Warehouse  |
| `staff_demo`      | STAFF      | Demo Tenant     | Demo Warehouse  |
| `manager_demo`    | MANAGER    | Demo Tenant     | (tenant-wide)   |
| `ceo_demo`        | CEO        | Demo Tenant     | (tenant-wide)   |
| `regulator_demo`  | REGULATOR  | Demo Tenant     | —               |

Passwords: `admin` is `Admin@Wdms2026!` (per `settings.DEFAULT_SUPER_PASS`),
the five `_demo` accounts are all `demo123`.

---

## Section 0 — Setup & sanity

### 0.1 Django admin loads with full styling

1. Visit [http://localhost:8000/admin/](http://localhost:8000/admin/).
2. Log in with `admin / Admin@Wdms2026!`.
3. The page should render with proper CSS — sidebar, the Django blue header,
   styled tables.

| What to verify | What you see |
|---|---|
| The admin lists every Phase 1 + Phase 2 model | "Documents", "Upload attempts", "Workflow transitions" appear under WDMS\_DOCUMENTS |
| The Documents table has 20 rows | Click "Documents" → list view shows the 20 demo records |
| Each model has admin styling | Headers, row striping, save buttons in brand blue |

If the page is unstyled, Whitenoise hasn't picked up the static files. Rebuild:
`docker compose up -d --build web`. Behind the scenes the new Dockerfile runs
`collectstatic` so `/static/admin/css/...` resolves.

### 0.2 Scalar API reference loads

1. Visit [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs).
2. Confirm Scalar opens without "Document 'api-1' could not be loaded".
3. Confirm the left-hand navigation shows the four router groups: **auth,
   accounts, tenants, documents**, with the documents group expanding to
   six endpoints:
   - `POST /upload/`
   - `POST /{document_id}/transition/`
   - `GET  /`
   - `GET  /types/`
   - `GET  /{document_id}/`
   - `GET  /{document_id}/transitions/`

If you see only Phase 1 routes, the documents router never registered. Check
[warehouse_dms/wdms_api_v1.py](warehouse_dms/wdms_api_v1.py) for the
`add_router("/documents/", documents_router)` line.

---

## Section 1 — Authentication

### 1.1 Successful login (depositor)

1. Open `auth → POST /auth/login` in Scalar.
2. Click **Test Request** (or whatever the Scalar version calls "Try It").
3. In the request body, paste:
   ```json
   { "username": "depositor_demo", "password": "demo123" }
   ```
4. Click **Send**.

**Expected response (HTTP 200):**

```json
{
  "detail": "",
  "access":  "<long opaque base64 string>",
  "refresh": "<long opaque base64 string>",
  "expires": 86400,
  "user": {
    "id": "<int as string>",
    "userName": "depositor_demo",
    "email": "depositor_demo@example.tz",
    "firstName": "Depositor",
    "lastName": "Demo"
  },
  "roles": [
    { "roleName": "DEPOSITOR", "permissions": ["upload_document", "...etc"] }
  ]
}
```

**What this proves:** the AES token-encryption layer works (the access token is
not a plain JWT — it's a JWT wrapped in `AESCipher`), the user-roles join
loads, and camelCase aliasing is on (you got `userName`, not `user_name`).

**Copy the `access` value.** You will paste it into Scalar's Authorize dialog
in the next step.

### 1.2 Authorize Scalar with the depositor token

1. At the top of the Scalar page, click the **Authorize** button (lock icon
   near the API title).
2. Paste **just the token string** (no `Bearer ` prefix — Scalar prepends it).
3. Click **Save** / **Authenticate**.

Every subsequent request from Scalar now includes
`Authorization: Bearer <token>`. When you switch user (e.g., to staff), come
back here and replace the token. Scalar holds one token at a time per session.

### 1.3 Bad login — wrong password

1. Re-run `POST /auth/login` with:
   ```json
   { "username": "depositor_demo", "password": "wrongpassword" }
   ```

**Expected:**
- HTTP **200** (this system signals failure in the body, not the status)
- `access`, `refresh` empty strings
- `detail` is a non-empty message such as `"Invalid credentials"`

**What this proves:** failure is communicated via the envelope, not via HTTP
status, which matches the secured\_SRS pattern. Front-end clients should read
`detail` and the absence of `access`.

### 1.4 Get my profile

1. Make sure Scalar is authorized with the **depositor's** token.
2. Open `accounts → GET /accounts/me` and **Send**.

**Expected:**
```json
{
  "response": { "id": 1, "status": true, "code": 2000, "message": "..." },
  "data": {
    "userName": "depositor_demo",
    "accountType": "DEPOSITOR",
    "tenant": { "name": "Demo Tenant", "...": "..." },
    "warehouse": { "name": "Demo Warehouse", "...": "..." },
    "...": "..."
  }
}
```

**What it proves:** `PermissionAuth` is correctly setting `request.user`, and
the encrypted token round-trips through decrypt → JWT verify → DB lookup.

If you get `null`, `401`, or `Authentication failed`, the token never decrypted
— either the AES layer is misconfigured or the Authorize header didn't apply.

---

## Section 2 — Tenants & warehouses (sanity check on Phase 1 scope)

### 2.1 List all tenants as admin

1. Re-authorize Scalar with the **admin** token (login as `admin /
   Admin@Wdms2026!` first).
2. Open `tenants → GET /tenants/` (whatever the list route is — check the
   sidebar) and **Send**.

**Expected:** `response.status: true`, `data` includes "Demo Tenant".

### 2.2 List warehouses as staff

1. Authorize as `staff_demo`.
2. Open `tenants → GET /tenants/warehouses/` (or whichever path Phase 1
   exposes) and **Send**.

**Expected:** only **one** warehouse — Demo Warehouse. If a staff user from
Demo Tenant somehow sees a warehouse from another tenant, tenant scoping is
broken.

If Phase 1 doesn't expose this distinction, that's fine — skip and move on.
The hard tenant-scoping tests are in Section 4.

---

## Section 3 — Document type metadata

Authorize as **any** demo user (depositor is fine — every authenticated user
can read the type list because the upload form needs it).

### 3.1 List document types

1. Open `documents → GET /documents/types/` and **Send**.

**Expected (`HTTP 200`, success envelope):**
```json
{
  "response": { "status": true, "code": 2000, "message": "..." },
  "data": [
    {
      "id": "application_form",
      "label": "Application Form",
      "category": "FORM",
      "initialState": "PENDING_STAFF",
      "allowedUploaderRoles": ["DEPOSITOR"],
      "allowedTransitions": [
        { "fromState": "PENDING_STAFF", "toState": "PENDING_MANAGER", "requiredRole": "STAFF", "action": "confirm", "reasonRequired": false },
        { "fromState": "PENDING_MANAGER", "toState": "PENDING_STAFF", "requiredRole": "MANAGER", "action": "send_back_to_staff", "reasonRequired": true },
        "...all 12 transitions..."
      ],
      "requiredFields": ["applicantName", "warehouseCode", "date", "signature"],
      "fileFormats": ["pdf", "jpg", "jpeg", "png"],
      "validationRules": { "minOcrConfidence": 0.75, "...": "..." },
      "classificationHints": ["..."]
    },
    { "id": "inspection_form", "...": "..." },
    { "id": "compliance_certificate", "...": "..." },
    { "id": "warehouse_receipt", "...": "..." }
  ]
}
```

**What to verify:**
- `data` has exactly **4** entries.
- `application_form.allowedTransitions` contains 12 entries — including the three richer correction actions: `send_back_to_staff` (twice — from MANAGER and from CEO) and `send_back_to_manager` (from CEO).
- `inspection_form.allowedTransitions` contains 6 entries, including `send_back_to_manager` (from CEO).
- `compliance_certificate.allowedTransitions` is `[]` (born APPROVED).
- `warehouse_receipt.allowedTransitions` contains 3 entries.

**What it proves:** the type config loader successfully parsed
`document_types.json`, the dataclass round-trips through Pydantic, and
camelCase aliasing applies to nested objects.

---

## Section 4 — Document lifecycle (the happy path)

This is the core Phase 2 success criteria run end-to-end.

### 4.1 Upload an application_form as the depositor

1. Authorize as `depositor_demo`.
2. Open `documents → POST /documents/upload/`.
3. The endpoint takes `multipart/form-data`. In Scalar's body editor:
   - **file** — pick any local file (a small PDF or even a `.txt` works in
     Phase 2 because format validation is Phase 4).
   - **documentTypeId** — `application_form`
   - **warehouseId** — the integer ID of Demo Warehouse. Get it from
     `GET /tenants/warehouses/` or just try `1`. If you get "Warehouse not
     found", increment until it works, or look at the Django admin Warehouse
     list.
   - **title** — `My Test Application`
4. **Send**.

**Expected:**
```json
{
  "response": { "status": true, "code": 2000, "message": "Document created" },
  "data": {
    "id": <some int, remember it as DOC_ID_A>,
    "uniqueId": "<uuid>",
    "status": "PENDING_STAFF",
    "documentTypeId": "application_form",
    "title": "My Test Application",
    "warehouseId": 1,
    "warehouseName": "Demo Warehouse",
    "uploaderId": <int>,
    "uploaderUsername": "depositor_demo",
    "fileUrl": "/media/documents/2026/04/...",
    "extractedText": "",
    "aiClassification": "",
    "aiExtractedFields": {},
    "aiConfidenceScore": null,
    "transitions": []
  }
}
```

**Note `data.id` — call it `DOC_ID_A`. Every later step in this section uses it.**

### 4.2 List documents as the depositor

1. Open `documents → GET /documents/` and **Send**.

**Expected:** `data` contains your new document (`DOC_ID_A`) plus a small
number of `application_form` documents from the demo seed where
`uploader=depositor_demo`. **Not** the 20 total — the depositor only sees
their own.

If you see inspection forms or warehouse receipts, scoping is wrong (those
are uploaded by `staff_demo`).

### 4.3 List documents as staff — should see the new upload

1. Login as `staff_demo`, copy access token, re-authorize Scalar.
2. Open `documents → GET /documents/` and add the query parameter
   `status=PENDING_STAFF`. **Send**.

**Expected:** `DOC_ID_A` appears, plus the 2 demo `application_form` rows
with status `PENDING_STAFF`. All belong to Demo Warehouse.

If you see documents from a different warehouse, tenant scoping is broken at
[wdms_documents/views.py `_scope_documents_for_user`](warehouse_dms/wdms_documents/views.py).

### 4.4 Get available transitions for the document — staff perspective

1. Open `documents → GET /documents/{document_id}/transitions/`.
2. Path parameter `document_id` = `DOC_ID_A`.
3. **Send**.

**Expected:**
```json
{
  "response": { "status": true, "code": 2000, "message": "..." },
  "data": [
    { "fromState": "PENDING_STAFF", "toState": "PENDING_MANAGER", "action": "confirm", "requiredRole": "STAFF", "reasonRequired": false },
    { "fromState": "PENDING_STAFF", "toState": "CORRECTION_NEEDED", "action": "send_back", "requiredRole": "STAFF", "reasonRequired": true }
  ]
}
```

**Verify:** exactly **2** transitions. Both `requiredRole: STAFF`. No CEO/manager actions leak through (proves the FSM filter respects role).

### 4.5 Confirm the document (staff → manager)

1. Open `documents → POST /documents/{document_id}/transition/`.
2. Path parameter `document_id` = `DOC_ID_A`.
3. Body:
   ```json
   { "action": "confirm" }
   ```
4. **Send**.

**Expected:**
```json
{
  "response": { "status": true, "code": 2000, "message": "Transition executed" },
  "data": {
    "id": <DOC_ID_A>,
    "status": "PENDING_MANAGER",
    "transitions": [
      {
        "fromStatus": "PENDING_STAFF",
        "toStatus": "PENDING_MANAGER",
        "action": "confirm",
        "actor": { "username": "staff_demo", "...": "..." },
        "reason": ""
      }
    ]
  }
}
```

**Verify:** `status` flipped to `PENDING_MANAGER`, exactly one transition row
was added, and `transitions[0].actor.username == "staff_demo"`. This is the
audit log working.

### 4.6 Negative test — depositor cannot confirm

Don't change roles yet. As staff, you have a working token, but switch back
to depositor in Scalar's Authorize dialog. Then re-run the same request:

1. `POST /documents/{document_id}/transition/` with `DOC_ID_A` and `{ "action": "confirm" }`.

**Expected:**
```json
{
  "response": { "status": false, "code": 4000, "message": "Action 'confirm' not allowed for user on document in status 'PENDING_MANAGER'" }
}
```

`HTTP 200` — failure is in the body. The document's status doesn't change.

**What it proves:** the FSM rejects role-mismatched actions. A depositor
trying to confirm gets the same generic "not allowed" response a staff member
would get for an action that doesn't fit the current state. The engine is the
single chokepoint.

### 4.7 Manager approves (manager → CEO)

1. Authorize as `manager_demo`.
2. `POST /documents/{document_id}/transition/` with `DOC_ID_A` and `{ "action": "approve" }`.

**Expected:** `status: PENDING_CEO`, transitions list now has 2 entries (the
older `confirm` + a new `approve` by `manager_demo`).

### 4.8 CEO final-approves (CEO → APPROVED)

1. Authorize as `ceo_demo`.
2. `POST /documents/{document_id}/transition/` with `DOC_ID_A` and `{ "action": "final_approve" }`.

**Expected:** `status: APPROVED`, transitions list has 3 entries, last actor
is `ceo_demo`, last action is `final_approve`.

This completes the foundation Success Criterion #5.

### 4.9 Verify full audit trail on detail

1. `GET /documents/{document_id}/` with `DOC_ID_A`.

**Expected:** `data.transitions` is an array of 3 dicts, ordered by descending
primary key (newest first per the model's `ordering`). Each entry has
`fromStatus`, `toStatus`, `action`, `actor`, `reason`.

This is Success Criterion #8.

---

## Section 5 — Correction flows

Two cycles to test: the wide cycle (down to depositor via `CORRECTION_NEEDED`)
and the targeted send-back (skipping the depositor and going only one level).

### 5.1 Wide cycle — staff sends back to depositor

1. Authorize as `depositor_demo`. Upload another `application_form` per
   step 4.1, capturing the new id as `DOC_ID_B`.
2. Authorize as `staff_demo`. `POST /documents/{document_id}/transition/`
   with `DOC_ID_B` and:
   ```json
   { "action": "send_back", "reason": "Missing signature on page 2" }
   ```

**Expected:**
- `status: CORRECTION_NEEDED`
- `currentCorrectionNote: "Missing signature on page 2"` — verify this on the
  detail view, this is the field the frontend reads to render the prominent
  banner.
- `transitions[0].reason` matches the same string.

### 5.2 Depositor resubmits

1. Authorize as `depositor_demo`. `POST /documents/{document_id}/transition/`
   with `DOC_ID_B` and:
   ```json
   { "action": "resubmit" }
   ```

**Expected:**
- `status: PENDING_STAFF`
- `currentCorrectionNote: ""` — engine clears the note when leaving
  CORRECTION\_NEEDED.
- `transitions` list now has 2 entries.

This is Success Criteria #6 and #7.

### 5.3 Negative — `send_back` without a `reason`

1. Authorize as `staff_demo`. Pick a fresh document in `PENDING_STAFF`.
2. `POST /documents/{document_id}/transition/` with:
   ```json
   { "action": "send_back" }
   ```
   (No `reason`.)

**Expected:**
```json
{
  "response": { "status": false, "code": 4000, "message": "Action 'send_back' requires a reason" }
}
```

The transition does not happen. The document stays in `PENDING_STAFF`. This
proves `reason_required: true` is enforced.

### 5.4 The targeted send-back (Phase 2's richer correction flow)

This test verifies the new transitions added during the JSON review — without
which a CEO who spots a small issue would have to bounce a document all the
way back to the depositor.

1. Walk a fresh `application_form` to `PENDING_CEO`:
   - Authorize as `depositor_demo` and upload (`DOC_ID_C`).
   - Authorize as `staff_demo`, `confirm`.
   - Authorize as `manager_demo`, `approve`.
2. Authorize as `ceo_demo`. `POST /documents/{document_id}/transition/`
   with `DOC_ID_C` and:
   ```json
   { "action": "send_back_to_manager", "reason": "Recompute the totals on the cover page." }
   ```

**Expected:**
- `status: PENDING_MANAGER` — **not** `CORRECTION_NEEDED`.
- `currentCorrectionNote: ""` — clearing note happens on every non-CORRECTION transition, including this one.
- `transitions` list now has 4 entries: `confirm`, `approve`,
  `send_back_to_manager`, all with the right actors.

3. Verify available transitions to the manager now: authorize as
   `manager_demo`, `GET /documents/{document_id}/transitions/`.

**Expected:** the same set as a fresh PENDING_MANAGER document — `approve`,
`send_back`, `send_back_to_staff`, `reject`. The system "forgot" the document
came back from the CEO, which is correct: state is state, regardless of
history.

This is the test that proves the richer correction flow actually wires through
the FSM and not just exists in the JSON.

### 5.5 Manager re-approves after the targeted send-back

1. Authorize as `manager_demo`. Re-run `approve`.

**Expected:** `status: PENDING_CEO`. CEO can now `final_approve` again — same
chain as 4.8.

---

## Section 6 — Negative tests

### 6.1 Depositor cannot upload an inspection form

1. Authorize as `depositor_demo`.
2. `POST /documents/upload/` with `documentTypeId: inspection_form`, any file,
   `warehouseId: 1`, `title: "should not work"`.

**Expected:**
```json
{
  "response": { "status": false, "code": 4000, "message": "Role 'DEPOSITOR' is not permitted to upload 'inspection_form'" }
}
```

No document is created.

**What it proves:** the per-type `allowed_uploader_roles` rule fires inside
the upload handler, even though the endpoint itself is open to any
authenticated user.

### 6.2 Staff CAN upload an inspection form

1. Authorize as `staff_demo`. Same call as above but `documentTypeId:
   inspection_form`.

**Expected:** `status: true`, `data.status: PENDING_MANAGER` (the
inspection\_form's `initial_state`, skipping staff review since staff
originated it).

### 6.3 Unauthenticated request

1. Click **Authorize** in Scalar and clear the token (or just
   delete it from the dialog).
2. Try `GET /documents/`.

**Expected:** HTTP **401** Unauthorized — Ninja's `HttpBearer` rejects the
request before our handler runs. The body is the Ninja default
`{ "detail": "Unauthorized" }` shape, not our envelope (because our handler
never runs).

### 6.4 Cross-tenant isolation (optional, requires a second tenant)

This one is a stretch test because Phase 2 only seeds one tenant. To verify
cross-tenant isolation seriously you'd need a second tenant.

**Quick path** (Django admin):
1. Open the Django admin → Tenants → Add. Name it "Other Tenant".
2. Add a Warehouse "Other Warehouse" linked to "Other Tenant" + an existing
   Region.
3. Add a User `staff_other` with password `demo123`. Add a UserProfile linking
   `staff_other` to "Other Tenant" + "Other Warehouse" with `accountType:
   STAFF`.
4. Add a UsersWithRoles row linking `staff_other` to the STAFF role.
5. Login as `staff_other`. `GET /documents/`.

**Expected:** `data` is empty — no document leaks across tenants.

If `staff_other` sees Demo Warehouse documents, the queryset chokepoint at
`_scope_documents_for_user` has a leak — investigate the `STAFF` branch.

---

## Section 7 — Reset / cleanup

If the test data gets too cluttered, drop the volume and reseed:

```bash
docker compose down -v
docker compose up -d --build
docker compose exec web python manage.py migrate
docker compose exec web python manage.py seed_permissions
docker compose exec web python manage.py seed_demo_documents
```

`down -v` destroys the postgres data volume — only acceptable on a dev
database. The `seed_demo_documents` command itself is idempotent on its
own data, but it does not delete documents you uploaded by hand.

---

## Quick scoreboard — Phase 2 success criteria → which section covers them

| # | Foundation success criterion (paraphrased)                    | Covered by |
|---|---------------------------------------------------------------|------------|
| 1 | Depositor uploads → status `PENDING_STAFF`                    | 4.1        |
| 2 | Staff sees the document in the warehouse list                 | 4.3        |
| 3 | Staff `confirm` → `PENDING_MANAGER`, transition recorded      | 4.4–4.5    |
| 4 | Manager `approve` → `PENDING_CEO`                             | 4.7        |
| 5 | CEO `final_approve` → `APPROVED`                              | 4.8        |
| 6 | Manager `send_back` with reason → `CORRECTION_NEEDED`, note   | 5.1        |
| 7 | Depositor `resubmit` → `PENDING_STAFF`                        | 5.2        |
| 8 | Detail endpoint returns full transition history               | 4.9        |
| 9 | Types endpoint returns four types with full schema            | 3.1        |
| 10| Wrong-role action rejected with 403-equivalent body           | 4.6, 6.1   |
| 11| Cross-tenant reads blocked                                    | 6.4        |

If every box ticks green, Phase 2 is complete and Phase 3 (notifications +
SSE) can begin.
