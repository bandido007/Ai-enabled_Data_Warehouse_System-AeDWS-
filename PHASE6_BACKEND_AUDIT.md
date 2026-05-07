# Phase 6 Backend Readiness Audit

**System:** AI-Enabled Warehouse DMS (AeDWS)
**Audit Date:** 2026-04-29
**Scope:** `wdms_documents`, `wdms_notifications`, `wdms_reports`, `wdms_regulatory`, `wdms_tenants`, `wdms_uaa`, `wdms_accounts`
**Method:** Static code reading only — no code was executed or modified.

---

## Section 1 — Document Review Screen Audit

The document review screen is the highest-priority Phase 6 screen. Six endpoints were audited.

### 1.1 Endpoint Inventory

| Endpoint | Status | Actual Path | Auth / Role Gate |
|---|---|---|---|
| GET document detail | ✅ Exists | `GET /api/v1/documents/{document_id}/` | Any authenticated user; filtered by `_scope_documents_for_user` |
| POST workflow transition | ✅ Exists | `POST /api/v1/documents/{document_id}/transition/` | Any authenticated user; FSMEngine enforces role inside |
| POST AI field corrections | ✅ Exists | `POST /api/v1/documents/{document_id}/correct-ai/` | STAFF or above |
| POST reclassification | ✅ Exists | `POST /api/v1/documents/{document_id}/reclassify/` | STAFF or above |
| GET allowed transitions | ✅ Exists | `GET /api/v1/documents/{document_id}/transitions/` | Any authenticated user |
| GET document types | ✅ Exists | `GET /api/v1/documents/types/` | Any authenticated user |
| GET reclassify-status SSE | ❌ Missing | n/a | n/a |

---

### 1.2 Response Shapes

**GET /api/v1/documents/{id}/** → `DocumentNonPagedResponseSerializer`

```json
{
  "response": { "code": 1, "message": "..." },
  "data": {
    "id": 1,
    "uniqueId": "uuid",
    "createdDate": "2026-04-01",
    "updatedDate": "2026-04-01",
    "isActive": true,
    "createdBy": { "username": "...", "firstName": "...", "lastName": "..." },
    "warehouseId": 1,
    "warehouseName": "...",
    "uploaderId": 2,
    "uploaderUsername": "...",
    "documentTypeId": "grain_receipt",
    "title": "...",
    "fileUrl": "/media/...",
    "status": "PENDING_REVIEW",
    "extractedText": "...",
    "aiClassification": "grain_receipt",
    "aiExtractedFields": { "quantity": "500 MT", "commodity": "Maize" },
    "aiSummary": "...",
    "aiConfidenceScore": 0.87,
    "aiReviewNotes": "...",
    "aiKeywords": ["maize", "Dodoma"],
    "softWarningOverride": false,
    "currentCorrectionNote": "",
    "transitions": [
      {
        "id": 1,
        "uniqueId": "uuid",
        "fromStatus": "DRAFT",
        "toStatus": "PENDING_REVIEW",
        "action": "submit",
        "reason": "",
        "actor": { "username": "...", "firstName": "", "lastName": "" },
        "editedFields": {},
        "aiCorrections": {},
        "createdDate": "2026-04-01"
      }
    ]
  }
}
```

**POST /api/v1/documents/{id}/transition/** — Request body (JSON):

```json
{
  "action": "confirm",
  "reason": "",
  "editedFields": {},
  "aiCorrections": {}
}
```

Response shape is the same `DocumentNonPagedResponseSerializer` as above.

**POST /api/v1/documents/{id}/correct-ai/** — Request body (JSON):

```json
{
  "corrections": { "quantity": "600 MT" },
  "reason": "Corrected after physical count"
}
```

Response: same `DocumentNonPagedResponseSerializer`.

**POST /api/v1/documents/{id}/reclassify/** — Request body (JSON):

```json
{
  "newTypeId": "warehouse_receipt",
  "reason": "Wrong type selected at upload"
}
```

Response: same `DocumentNonPagedResponseSerializer`. The `aiClassification` field is immediately updated in the response; full re-extraction runs async in Celery.

**GET /api/v1/documents/{id}/transitions/** — Response:

```json
{
  "response": { "code": 1, "message": "" },
  "data": [
    {
      "fromState": "PENDING_REVIEW",
      "toState": "STAFF_CONFIRMED",
      "action": "confirm",
      "requiredRole": "STAFF",
      "reasonRequired": false
    }
  ]
}
```

**GET /api/v1/documents/types/** — Response:

```json
{
  "response": { "code": 1, "message": "" },
  "data": [
    {
      "id": "grain_receipt",
      "label": "Grain Receipt",
      "category": "Commodity",
      "initialState": "PENDING_REVIEW",
      "allowedUploaderRoles": ["DEPOSITOR"],
      "allowedTransitions": ["..."],
      "requiredFields": ["quantity", "commodity"],
      "optionalFields": ["quality_grade"],
      "fileFormats": ["pdf", "jpg"],
      "validationRules": { "minOcrConfidence": 0.6, "requireDate": true },
      "classificationHints": ["grain", "warehouse", "tonnage"]
    }
  ]
}
```

---

### 1.3 Notes on the Document Review Screen

**Reclassify-status SSE endpoint is missing.** `POST /reclassify/` triggers a Celery chain asynchronously. There is no `/api/v1/documents/{id}/reclassify-status/` SSE endpoint. The frontend must fall back to the spec's polling path — poll `GET /api/v1/documents/{id}/` every 2 seconds for up to 60 seconds and check whether `aiExtractedFields` has changed. This is entirely workable because the document detail endpoint already returns the full AI field map.

**Terracotta dot persistence:** The backend stores reviewer corrections in `ai_extracted_fields` and records originals in `WorkflowTransition.aiCorrections`. The frontend can detect "this field was manually overridden" by checking whether any `correct_ai` transition in the `transitions` array touches that field key. The flag is not a separate boolean on the field; the frontend must derive it from the transition history.

**Response envelope is standard** on all six endpoints (`response.code`, `response.message`, `data`). CamelCase aliasing is applied globally via `set_all_by_alias()` in `wdms_api_v1.py`. All fields in `data` are camelCase.

---

## Section 2 — Depositor Experience Audit

### 2.1 Endpoint Inventory

| Endpoint | Status | Actual Path | Notes |
|---|---|---|---|
| POST file upload | ✅ Exists | `POST /api/v1/documents/upload/` | Multipart form data |
| GET SSE stream | ✅ Exists | `GET /api/v1/documents/upload/{attempt_id}/stream/` | Plain Django view, not Ninja |
| POST confirm | ✅ Exists | `POST /api/v1/documents/upload/{attempt_id}/confirm/` | Form field |
| POST confirm with soft warning override | ✅ Exists | same endpoint | `soft_warning_override` Form field |
| GET nearby warehouses | ❌ Missing | n/a | No location fields on Warehouse model |

---

### 2.2 Upload Endpoint Shape

**POST /api/v1/documents/upload/** — multipart form data, fields:

| Field | Type | Required |
|---|---|---|
| `file` | binary file | Yes |
| `document_type_id` | string | Yes |
| `warehouse_id` | integer | Yes |
| `title` | string | Yes |

Response:

```json
{
  "response": { "code": 1, "message": "Upload started" },
  "data": {
    "attemptId": 42,
    "streamUrl": "/api/v1/documents/upload/42/stream/"
  }
}
```

**POST /api/v1/documents/upload/{attempt_id}/confirm/** — multipart form data:

| Field | Type | Default |
|---|---|---|
| `soft_warning_override` | boolean | `false` |

> ⚠️ **Shape mismatch warning:** This field is a `Form` field (not JSON), so the global camelCase aliasing does NOT apply. The frontend must send `soft_warning_override` (snake_case) as a form field, not `softWarningOverride` as JSON. If the frontend sends a JSON body with `softWarningOverride`, it will be ignored and default to `false`.

---

### 2.3 SSE Stream Events

The SSE stream at `/api/v1/documents/upload/{attempt_id}/stream/` emits three event types:

**`connected`** (initial handshake):
```
event: connected
data: {}
```

**`progress`** (one or more, as Celery stages complete):
```
event: progress
data: {"stage": "ocr", "status": "done", "message": "...", "details": {...}}
```

Stage names are arbitrary strings emitted by the Celery tasks (e.g. `"ocr"`, `"validation"`, `"embedding"`). The stream shape is correct for the frontend spec.

**`complete`** (terminal event):
```
event: complete
data: {"stage": "final", "status": "complete", "outcome": "PASSED|SOFT_WARNING|HARD_REJECT", "warnings": [...]}
```

This matches exactly what the frontend spec requires.

**Reconnection support:** The SSE module stores all events in a Redis list with 5-minute TTL. If the client reconnects after the Celery task has already finished, all stored events are replayed from the list before the stream closes. This is robust.

**Auth on the SSE view:** The stream view is a plain Django view, not a Ninja endpoint. It manually extracts and validates the Bearer JWT using `AuthenticationService.get_user_from_token()`. The frontend must send `Authorization: Bearer <token>` for this route — the same header used everywhere else.

---

### 2.4 Nearby Warehouses

No `latitude`, `longitude`, or `geo` field exists on the `Warehouse` or `Region` model. The `?nearby=true` parameter described in the spec does not exist. The `WarehouseFilteringSerializer` only supports filtering by `region_id`.

The depositor upload Step 2 (warehouse selection) will need to be scoped down: instead of geolocation + haversine ranking, show all warehouses filtered by region. Browser geolocation can still be shown for UX richness, but the backend cannot compute distance.

---

## Section 3 — Regulator Ranking Dashboard Audit

### 3.1 Summary

Neither `wdms_regulatory` nor `wdms_reports` has any views, serializers, or URL routes. Both apps contain only a placeholder comment: `# Phase 5 — ... models will be defined here.` Neither app is registered in `wdms_api_v1.py`.

### 3.2 Endpoint Inventory

| Endpoint | Status | Notes |
|---|---|---|
| GET warehouses scoped to regulator jurisdiction | ❌ Missing | No regulator queryset scoping anywhere |
| GET warehouse detail with statistics | ❌ Missing | Only the admin-gated tenant warehouse endpoints exist |
| GET current ranking score per warehouse | ❌ Missing | No reports app models or views |
| GET ranking history (sparklines) | ❌ Missing | No reports app models or views |
| POST trigger ranking recompute | ❌ Missing | No reports app models or views |
| GET aggregate compliance trends | ❌ Missing | No reports app models or views |
| GET regulator jurisdiction info | ❌ Missing | No regulatory app models or views |

### 3.3 Role and Jurisdiction Infrastructure

- The `REGULATOR` role name is referenced in `_scope_documents_for_user()` in `wdms_documents/views.py` but the branch returns `base.none()` with a comment: _"REGULATOR and any unknown role get nothing in Phase 2."_
- No `Jurisdiction` model exists anywhere in the codebase.
- No queryset helper filters warehouses by jurisdiction.
- The `Warehouse` model has a `region` FK to the `Region` model. Region is the finest geographic granularity available.
- The `Document` queryset can be filtered by `warehouse__region` since `Warehouse` has a `region` FK.

### 3.4 Minimum Viable Regulator Demo

Given this is a final-year project, a credible demo of the regulatory layer requires only four small additions (all read-only, no new database migrations):

1. **`GET /api/v1/regulatory/warehouses/`** — return warehouses annotated with `totalDocuments`, `approvedDocuments`, and a derived `complianceScore` (0–100 integer, computed as `approved / total * 100`). Optional `?regionId=` filter.
2. **`GET /api/v1/regulatory/warehouses/{id}/`** — warehouse detail with the same annotation plus a list of recent documents.
3. **`GET /api/v1/regulatory/warehouses/{id}/documents/`** — paginated document list for that warehouse.
4. **Seed a REGULATOR role** and patch `_scope_documents_for_user` to return region-scoped documents for that role instead of `base.none()`.

Sparklines, on-demand recomputation, and the AI ranking explanation are explicitly deferred. Estimated backend effort: **2–3 hours**.

---

## Section 4 — Search Experience Audit

### 4.1 Endpoint

`POST /api/v1/documents/search/` — **Exists and fully implemented.**

### 4.2 Request Shape

```json
{
  "query": "inspection Dodoma April",
  "type": "auto"
}
```

`type` accepts `"keyword"`, `"semantic"`, or `"auto"` (default). Matches the frontend spec exactly.

### 4.3 Response Shape

```json
{
  "response": { "code": 1, "message": "" },
  "data": {
    "mode": "semantic",
    "detected": true,
    "results": [
      {
        "id": 5,
        "title": "April Inspection Report",
        "documentTypeId": "inspection_report",
        "status": "FINAL_APPROVED",
        "warehouseName": "Dodoma Central",
        "snippet": "...inspection conducted on 14 April 2026...",
        "score": 0.83
      }
    ]
  }
}
```

### 4.4 Notes

- **`detected: true`** when mode was `"auto"` and the backend chose a mode. Use `data.detected && data.mode === "semantic"` to trigger the frontend banner.
- **Auto-detection heuristic:** queries with 5+ words or containing `?` route to semantic. Shorter phrases go to keyword. Implemented in `_looks_like_keyword()`.
- **Semantic search returns `score`** as `1 - cosine_distance`, ranging 0–1.
- **Keyword search returns plain text snippets** — no HTML highlights. The frontend must implement client-side highlight by matching query terms in the returned `snippet` string.
- **Role scoping applies to search.** The same `_scope_documents_for_user` queryset gate is used.

---

## Section 5 — Notification Preferences Audit

All five expected endpoints exist.

### 5.1 Endpoint Inventory

| Endpoint | Status | Actual Path |
|---|---|---|
| GET notification list | ✅ Exists | `GET /api/v1/notifications/` |
| GET preferences | ✅ Exists | `GET /api/v1/notifications/preferences/` |
| PUT update preferences | ✅ Exists | `PUT /api/v1/notifications/preferences/` |
| POST mark single read | ✅ Exists | `POST /api/v1/notifications/{notification_id}/mark-read/` |
| POST mark all read | ✅ Exists | `POST /api/v1/notifications/mark-all-read/` |

### 5.2 Notification List Shape

Query param: `?unreadOnly=true` (camelCase — the global alias applies). Returns paginated `NotificationEventTableSerializer`.

```json
{
  "response": { "code": 1, "message": "" },
  "page": { "totalItems": 15, "totalPages": 2, "currentPage": 1, "pageSize": 10 },
  "data": [
    {
      "id": 1,
      "uniqueId": "uuid",
      "createdDate": "...",
      "eventType": "DOCUMENT_APPROVED_FINAL",
      "subject": "Your document was approved",
      "body": "...",
      "relatedDocumentId": 5,
      "channelsSent": ["dashboard", "email"],
      "readOnDashboard": false,
      "readAt": null
    }
  ]
}
```

### 5.3 Preferences Shape

GET and PUT both work on a flat list of `{eventType, channel, enabled}` objects.

```json
{
  "response": { "code": 1, "message": "" },
  "data": [
    { "eventType": "DOCUMENT_APPROVED_FINAL", "channel": "dashboard", "enabled": true },
    { "eventType": "DOCUMENT_APPROVED_FINAL", "channel": "email", "enabled": true },
    { "eventType": "DOCUMENT_APPROVED_FINAL", "channel": "sms", "enabled": false }
  ]
}
```

PUT body (partial updates supported — only rows in the array are upserted):

```json
{
  "preferences": [
    { "eventType": "DOCUMENT_APPROVED_FINAL", "channel": "sms", "enabled": true }
  ]
}
```

### 5.4 Business Rules

- **Dashboard channel cannot be disabled.** Any `channel: "dashboard", enabled: false` is silently coerced to `true`. The frontend should disable the dashboard-column toggle with an explanatory tooltip.
- **Default for SMS is always `false`** regardless of event type.
- **Default for email is `true`** only for terminal events (`DOCUMENT_APPROVED_FINAL`, `DOCUMENT_REJECTED`, `DOCUMENT_SENT_BACK`); `false` for all others.
- Available channels: `dashboard`, `email`, `sms`.

---

## Section 6 — Documents List and Dashboard Audit

### 6.1 GET /api/v1/documents/

**Exists.** Supported query params (`DocumentFilteringSerializer`):

| Param | Type |
|---|---|
| `status` | string |
| `documentTypeId` | string |
| `uploaderId` | integer |
| `warehouseId` | integer |
| `page` | integer |
| `pageSize` | integer |

> ⚠️ Free-text search filter is **not** present on the list endpoint. Use `POST /documents/search/` for text search.

### 6.2 Pagination Envelope

```json
{
  "response": { "code": 1, "message": "" },
  "page": {
    "totalItems": 100,
    "totalPages": 10,
    "currentPage": 1,
    "pageSize": 10
  },
  "data": [ "..." ]
}
```

`page` is a **top-level sibling** of `data`, not nested inside it.

### 6.3 Dashboard Metrics

There is **no dedicated dashboard metrics endpoint**. Options:

- **Client-side workaround (recommended):** fire parallel TanStack Query requests with `pageSize=1` for each status filter; read `page.totalItems` from each. Two to four HTTP calls, each returning a single row.
- **Backend addition (optional):** add `GET /api/v1/documents/metrics/` returning counts by status. Low priority — the workaround is acceptable.

---

## Section 7 — Cross-Cutting Concerns Audit

| Concern | Finding |
|---|---|
| **Standard response envelope** | Consistent across all endpoints: `{response: {code, message}, data, page?}`. Code `1` = success, `0` = business error, `2` = server error, `3` = not found. |
| **CamelCase aliasing** | Applied globally via `set_all_by_alias(api_v1)` for all Ninja-routed endpoints. **Exception:** `soft_warning_override` on the confirm endpoint is a `Form` field — NOT aliased. Must be sent as snake_case in multipart form data. |
| **Auth errors** | `PermissionAuth` returns HTTP 401. Shape is Ninja's built-in `{"detail": "Unauthorized"}`, **not** the standard project envelope. Frontend must check HTTP status code before attempting to parse `response.code`. |
| **Encrypted JWT** | `PermissionAuth` calls `AuthenticationService.get_user_from_token()` for all Ninja endpoints. The SSE view calls the same method manually. Pattern is consistent. |
| **File uploads** | Multipart form data only. Fields: `file` (binary), `document_type_id`, `warehouse_id`, `title`. No JSON body alternative. |
| **Special headers** | `Authorization: Bearer <token>` only. No CSRF token required for Ninja endpoints. The SSE view also accepts Django session cookies as a fallback. |
| **Reports / Regulatory apps** | Neither `wdms_reports` nor `wdms_regulatory` is wired into `wdms_api_v1.py`. Both are empty placeholder apps. |

---

## Section 8 — Gap Summary

### List 1: Endpoints That Exist and Match Expected Shape

The frontend can call these directly.

| Endpoint | Path |
|---|---|
| GET document detail | `GET /api/v1/documents/{id}/` |
| POST workflow transition | `POST /api/v1/documents/{id}/transition/` |
| POST AI field corrections | `POST /api/v1/documents/{id}/correct-ai/` |
| POST reclassification | `POST /api/v1/documents/{id}/reclassify/` |
| GET allowed transitions | `GET /api/v1/documents/{id}/transitions/` |
| GET document types | `GET /api/v1/documents/types/` |
| POST start upload | `POST /api/v1/documents/upload/` |
| GET SSE upload stream | `GET /api/v1/documents/upload/{attempt_id}/stream/` |
| POST confirm upload | `POST /api/v1/documents/upload/{attempt_id}/confirm/` |
| POST search | `POST /api/v1/documents/search/` |
| GET notifications list | `GET /api/v1/notifications/` |
| POST mark single notification read | `POST /api/v1/notifications/{id}/mark-read/` |
| POST mark all notifications read | `POST /api/v1/notifications/mark-all-read/` |
| GET notification preferences | `GET /api/v1/notifications/preferences/` |
| PUT update notification preferences | `PUT /api/v1/notifications/preferences/` |
| GET documents list with filters | `GET /api/v1/documents/` |
| GET warehouses list | `GET /api/v1/tenants/warehouses` |

---

### List 2: Endpoints That Exist But With a Shape Difference

| Endpoint | Difference | Recommendation |
|---|---|---|
| `POST /upload/{id}/confirm/` | `soft_warning_override` is a snake_case **Form field**, not a camelCase JSON body field. | **Frontend adapts:** send as multipart form with field name `soft_warning_override`. |
| `POST /documents/search/` | Keyword search returns **plain text snippets**, not HTML-highlighted spans. | **Frontend adapts:** implement client-side highlight by marking query terms bold in the `snippet` string. |
| `GET /api/v1/notifications/` | Unread filter is `?unreadOnly=true` (camelCase, not `?unread=true`). | **Frontend adapts:** use `?unreadOnly=true`. |
| All auth errors | 401 responses return `{"detail": "Unauthorized"}`, not the project envelope. | **Frontend adapts:** check HTTP status code first; parse `response.code` only on 200. |
| Dashboard metrics | No dedicated endpoint; counts must be derived from list `page.totalItems`. | **Frontend adapts:** parallel TanStack Query calls with `pageSize=1` per status. |

---

### List 3: Endpoints That Do Not Exist

| Endpoint | Feature | Recommendation |
|---|---|---|
| `GET /api/v1/documents/{id}/reclassify-status/` | HITL reclassify progress SSE | **Scope down:** poll `GET /api/v1/documents/{id}/` every 2 s for up to 60 s. No backend addition needed. |
| Nearby warehouses `?nearby=true` | Depositor Step 2 warehouse picker | **Scope down:** replace with region dropdown → `?regionId=X` filter. No backend addition needed. |
| All `/api/v1/regulatory/*` endpoints | Entire regulator dashboard | **Add small backend phase** — see below. |
| All `/api/v1/reports/*` endpoints | Sparklines, trends, recompute | **Defer** — no models exist; not needed for demo. |
| `GET /api/v1/documents/metrics/` | Dashboard counts | **Optional addition** — low priority; workaround exists. |

---

### Minimum Backend Addition for a Credible Regulator Demo

Four read-only endpoints using annotations over existing models — **no new database migrations required**:

1. **`GET /api/v1/regulatory/warehouses/`** — warehouses annotated with `totalDocuments`, `approvedDocuments`, `complianceScore`. Optional `?regionId=` filter. Role-gate: REGULATOR or ADMIN.
2. **`GET /api/v1/regulatory/warehouses/{id}/`** — warehouse detail with document counts and 10 most recent documents.
3. **`GET /api/v1/regulatory/warehouses/{id}/documents/`** — paginated documents for that warehouse.
4. **Seed REGULATOR role** and patch `_scope_documents_for_user` to return region-scoped documents instead of `base.none()`.

> Sparklines, on-demand recomputation, and AI ranking explanations are explicitly deferred. Estimated effort: **2–3 hours**.

---

## Go / No-Go Recommendation

> **Phase 6 can proceed with the following specific scope reductions:**

| Screen | Decision |
|---|---|
| HITL document review | ✅ **Proceed** — all endpoints exist. Use polling (not SSE) for reclassify progress. |
| Depositor upload flow with SSE | ✅ **Proceed** — all endpoints exist. Replace geolocation with region dropdown for warehouse selection. |
| Search page | ✅ **Proceed** — fully implemented. Add client-side keyword highlighting in the frontend. |
| Notification preferences page | ✅ **Proceed** — fully implemented. Disable the dashboard-channel toggle in the UI. |
| Regulator ranking dashboard | ⚠️ **Backend addition required first** — add the 4 endpoints listed above (~2–3 hours). Without this the regulator screen will have no data. |
| Dashboard metrics | ✅ **Proceed with workaround** — parallel TanStack Query calls per status. |
