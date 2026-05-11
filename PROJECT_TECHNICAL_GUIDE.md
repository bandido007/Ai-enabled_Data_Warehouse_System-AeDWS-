# AI-enabled Data Warehouse System (AeDWS) - Technical Guide

## 1. Executive Summary

AeDWS is an AI-assisted warehouse document management and regulatory workflow
system. It helps depositors, warehouse staff, managers, CEOs, regulators, and
administrators submit, review, approve, correct, search, and monitor warehouse
documents.

The project is split into two major applications:

- `warehouse_dms/`: Django backend with Django Ninja APIs, PostgreSQL, pgvector,
  Celery, Redis, authentication, workflow management, AI processing, reporting,
  notifications, and regulatory analytics.
- `warehouse_dms_frontend/`: React + TypeScript frontend built with Vite,
  React Router, TanStack Query, Zustand, Tailwind CSS, and reusable UI
  components.

The core business idea is simple:

1. A user submits a warehouse document or structured form.
2. The backend validates the submission.
3. Celery runs OCR, classification, field extraction, review-note generation,
   and embedding generation.
4. The document enters a role-based approval workflow.
5. Each transition is audited and can trigger notifications.
6. Regulators and internal users can search, inspect, rank, and monitor
   warehouse compliance.

This guide is written so that a reader can understand what the project does,
where the important code lives, how data flows, and how to explain the system
confidently during review, presentation, maintenance, or future development.

## 2. Technology Stack

### Backend

| Area | Technology | Where it appears | Purpose |
| --- | --- | --- | --- |
| Web framework | Django 5.1.4 | `warehouse_dms/warehouse_dms/settings.py` | Main backend framework, ORM, admin, settings, files, middleware. |
| API framework | Django Ninja 1.4.3 | `warehouse_dms/warehouse_dms/wdms_api_v1.py` | Typed API routes and OpenAPI documentation. |
| Auth tokens | Simple JWT + PyJWT + AES wrapper | `wdms_uaa/authentication/services.py` | Login returns AES-encrypted access and refresh JWTs. |
| Database | PostgreSQL | `warehouse_dms/docker-compose.yml` | Durable relational storage. |
| Vector search | pgvector | `wdms_documents/models.py`, document migrations | Stores 768-dimensional embeddings for semantic search. |
| Async jobs | Celery 5.4.0 | `warehouse_dms/warehouse_dms/celery.py`, `wdms_ai_pipeline/tasks.py` | Runs OCR, LLM, embeddings, email/SMS tasks, and future schedules. |
| Broker/cache | Redis 7 | `warehouse_dms/docker-compose.yml`, `wdms_ai_pipeline/sse.py` | Celery broker and upload-progress event channel. |
| OCR | Google Cloud Vision | `wdms_ai_pipeline/services/providers/vision_ocr.py` | Extracts text from PDFs and images. |
| LLM | Vertex AI Gemini | `wdms_ai_pipeline/services/providers/gemini_llm.py` | Classification, extraction, validation, summaries, ranking explanations. |
| Embeddings | Vertex AI text embeddings | `wdms_ai_pipeline/services/providers/vertex_embedding.py` | Converts text into vectors for semantic search. |
| Notifications | Django models + Celery + SMTP/SMS | `wdms_notifications/` | Dashboard, email, and SMS notification delivery. |
| Deployment | Docker Compose, Uvicorn, Whitenoise | `warehouse_dms/docker-compose.yml` | Runs web, worker, beat, database, and Redis services. |

### Frontend

| Area | Technology | Where it appears | Purpose |
| --- | --- | --- | --- |
| UI runtime | React 19 + TypeScript | `warehouse_dms_frontend/src/` | Frontend application. |
| Build tool | Vite | `warehouse_dms_frontend/vite.config.ts` | Development server and production build. |
| Routing | React Router v6 | `warehouse_dms_frontend/src/app/router.tsx` | Role-based page routing. |
| Server state | TanStack Query | `warehouse_dms_frontend/src/lib/queries.ts` | Fetching, polling, caching API data. |
| Client state | Zustand | `warehouse_dms_frontend/src/stores/auth-store.ts` | Stores session, roles, profile, and token state. |
| HTTP client | Axios | `warehouse_dms_frontend/src/lib/api.ts` | API requests and auth header injection. |
| Styling | Tailwind CSS | `warehouse_dms_frontend/tailwind.config.ts`, `src/index.css` | Utility styling and design tokens. |
| UI primitives | Radix UI + local components | `warehouse_dms_frontend/src/components/ui/` | Buttons, dialogs, dropdowns, tables, toasts, tabs. |
| Icons | Lucide React | frontend package dependencies | UI action icons. |

## 3. Repository Map

```text
.
+-- PROJECT_TECHNICAL_GUIDE.md
+-- warehouse_dms/
|   +-- manage.py
|   +-- requirements.txt
|   +-- docker-compose.yml
|   +-- Dockerfile
|   +-- .env.example
|   +-- warehouse_dms/
|   |   +-- settings.py
|   |   +-- urls.py
|   |   +-- wdms_api_v1.py
|   |   +-- celery.py
|   |   +-- asgi.py
|   |   +-- wsgi.py
|   +-- wdms_utils/
|   +-- wdms_uaa/
|   +-- wdms_accounts/
|   +-- wdms_tenants/
|   +-- wdms_documents/
|   +-- wdms_ai_pipeline/
|   +-- wdms_notifications/
|   +-- wdms_reports/
|   +-- wdms_regulatory/
+-- warehouse_dms_frontend/
|   +-- package.json
|   +-- vite.config.ts
|   +-- src/
|   |   +-- app/
|   |   +-- components/
|   |   +-- hooks/
|   |   +-- layouts/
|   |   +-- lib/
|   |   +-- pages/
|   |   +-- stores/
|   |   +-- styles/
|   |   +-- types/
+-- pgvector_src/
```

The backend is intentionally modular. Each `wdms_*` folder is a Django app with
its own models, views, serializers, migrations, and business responsibilities.

## 4. Backend Architecture

### 4.1 Django Project Package

Important files:

- `warehouse_dms/warehouse_dms/settings.py`
- `warehouse_dms/warehouse_dms/urls.py`
- `warehouse_dms/warehouse_dms/wdms_api_v1.py`
- `warehouse_dms/warehouse_dms/celery.py`

`settings.py` registers the project apps:

```python
INSTALLED_APPS = [
    "wdms_utils",
    "wdms_uaa",
    "wdms_accounts",
    "wdms_tenants",
    "wdms_documents",
    "wdms_ai_pipeline",
    "wdms_notifications",
    "wdms_reports",
    "wdms_regulatory",
]
```

The API root is created in `wdms_api_v1.py`:

```python
api_v1.add_router("/auth/", auth_router)
api_v1.add_router("/accounts/", accounts_router)
api_v1.add_router("/tenants/", tenants_router)
api_v1.add_router("/documents/", documents_router)
api_v1.add_router("/notifications/", notifications_router)
api_v1.add_router("/regulatory/", regulatory_router)
api_v1.add_router("/reports/", reports_router)
```

This means most backend functionality is available under `/api/v1/`.

`urls.py` also wires a special plain Django streaming endpoint:

```python
path(
    "api/v1/documents/upload/<int:attempt_id>/stream/",
    upload_stream_view,
    name="upload_stream",
)
```

That route is not a normal Ninja endpoint because Server-Sent Events require
`StreamingHttpResponse`.

### 4.2 Shared Base Model and API Envelope

Important files:

- `wdms_utils/BaseModel.py`
- `wdms_utils/SharedSerializer.py`
- `wdms_utils/response.py`
- `warehouse_dms/response.json`

Most database models inherit from `BaseModel`, which provides:

- `primary_key`
- `unique_id`
- `created_date`
- `updated_date`
- `is_active`
- `created_by`
- `id` property mapped to `primary_key`

API responses follow a consistent envelope:

```json
{
  "response": {
    "id": 1,
    "status": true,
    "message": "...",
    "code": 8000
  },
  "data": {}
}
```

The helper `ResponseObject.get_response(...)` reads response codes from
`warehouse_dms/response.json`.

The serializers use a camelCase alias generator. This is why backend fields
such as `document_type_id` are usually returned to the frontend as
`documentTypeId`.

## 5. Users, Authentication, Roles, and Permissions

### 5.1 Main Files

- `wdms_uaa/models.py`
- `wdms_uaa/authentication/services.py`
- `wdms_uaa/authorization/services.py`
- `wdms_uaa/authorization/auth_permission.py`
- `wdms_uaa/views.py`
- `wdms_accounts/models.py`
- `wdms_accounts/views.py`

### 5.2 Authentication Flow

1. The frontend posts username and password to:

   ```text
   POST /api/v1/auth/login
   ```

2. `AuthenticationService.authenticate_with_credentials(...)` verifies the
   Django user and password.

3. Simple JWT creates access and refresh tokens.

4. The project encrypts the JWT strings using `AESCipher`.

5. The login response returns:

   - `access`
   - `refresh`
   - `expires`
   - `user`
   - `roles`

6. The frontend stores the session in Zustand:

   ```text
   warehouse_dms_frontend/src/stores/auth-store.ts
   ```

7. Axios attaches the bearer token to future requests:

   ```typescript
   config.headers.Authorization = `Bearer ${token}`
   ```

8. Backend endpoints protected with `PermissionAuth` decrypt and validate the
   token, then optionally check permission codes.

### 5.3 Authorization Model

The RBAC tables live in `wdms_uaa/models.py`:

- `UserPermissionsGroup`
- `UserPermissions`
- `UserRoles`
- `UserRolesWithPermissions`
- `UsersWithRoles`
- `LoginAttempt`

Default roles are seeded by:

```text
python manage.py seed_permissions
```

The project uses these role names:

- `ADMIN`
- `DEPOSITOR`
- `STAFF`
- `MANAGER`
- `CEO`
- `REGULATOR`

`AuthorizationService.has_all_permissions(...)` checks whether a user has all
required permission codes. The code intentionally fixes a known SRS-style bug:
it requires every listed permission, not just the first matching permission.

### 5.4 Account Profiles

`wdms_accounts/models.py` extends Django `User` through `UserProfile`.

Important profile fields:

- `account_type`
- `phone_number`
- `has_been_verified`
- `preferred_language`
- `tenant`
- `warehouse`

These fields connect a user to the operational scope used by document lists,
approval queues, dashboards, and regulator visibility.

## 6. Tenancy and Warehouse Scope

### 6.1 Main Files

- `wdms_tenants/models.py`
- `wdms_tenants/views.py`
- `wdms_tenants/querysets.py`
- `wdms_regulatory/models.py`

### 6.2 Data Model

The tenant structure is:

```text
Region
  +-- Tenant
        +-- Warehouse
```

`Region` represents administrative regions, such as Tanzania regions.
`Tenant` represents an organization that owns warehouses.
`Warehouse` represents a physical warehouse belonging to a tenant.

`UserProfile` links users to a tenant and sometimes to a specific warehouse.

### 6.3 Scope Helpers

`wdms_tenants/querysets.py` contains the scope rules:

- `get_user_tenant(user)`: returns the tenant from the user's profile.
- `get_tenant_queryset(user)`: returns warehouses under the user's tenant.
- `get_tenant_scoped_queryset(...)`: filters models through a tenant path.
- `get_regulator_queryset(user)`: returns warehouses visible to a regulator.

Regulator scope is controlled by `RegulatorJurisdiction` in
`wdms_regulatory/models.py`:

- `NATIONAL`: regulator sees all active warehouses.
- `REGIONAL`: regulator sees warehouses in assigned region(s).

## 7. Document Management Domain

### 7.1 Main Files

- `wdms_documents/models.py`
- `wdms_documents/views.py`
- `wdms_documents/serializers.py`
- `wdms_documents/config/document_types.json`
- `wdms_documents/fsm/types.py`
- `wdms_documents/fsm/engine.py`
- `wdms_documents/signals.py`

### 7.2 Core Models

`UploadAttempt`

Represents a staged upload before it becomes a real `Document`.

Important fields:

- `uploader`
- `warehouse`
- `document_type_id`
- `title`
- `staged_file`
- `ocr_text`
- `ocr_confidence`
- `validation_status`
- `validation_warnings`
- `celery_task_id`
- `promoted_document`

Upload attempt statuses:

- `PENDING`
- `HARD_REJECT`
- `SOFT_WARNING`
- `PASSED`
- `PROMOTED`

`Document`

Represents a live document inside the workflow.

Important fields:

- `warehouse`
- `uploader`
- `document_type_id`
- `title`
- `file`
- `status`
- `extracted_text`
- `ai_classification`
- `ai_extracted_fields`
- `ai_summary`
- `ai_confidence_score`
- `ai_review_notes`
- `ai_keywords`
- `embedding`
- `soft_warning_override`
- `current_correction_note`

Document statuses:

- `DRAFT`
- `PENDING_STAFF`
- `PENDING_MANAGER`
- `PENDING_CEO`
- `APPROVED`
- `REJECTED`
- `CORRECTION_NEEDED`

`WorkflowTransition`

Every status change creates an audit record.

Important fields:

- `document`
- `from_status`
- `to_status`
- `actor`
- `action`
- `reason`
- `edited_fields`
- `ai_corrections`

If anyone asks "how does the system know who approved what?", the answer is:
`WorkflowTransition` is the audit trail.

## 8. Document Types and Business Rules

### 8.1 Why `document_types.json` Is Critical

The file `wdms_documents/config/document_types.json` is one of the most
important files in the system. It is the business rule table for documents.

Each document type defines:

- document ID
- human label
- form number
- category
- initial workflow state
- roles allowed to upload
- allowed transitions
- required fields
- optional fields
- allowed file formats
- validation rules
- classification hints
- optional viewer roles

The loader in `wdms_documents/fsm/types.py` validates this JSON at startup. If
the JSON is malformed, duplicated, or missing required keys, Django refuses to
start. This is a good design because workflow configuration errors are caught
early.

### 8.2 Document Types Currently Configured

| ID | Label | Initial state | Upload roles | Category |
| --- | --- | --- | --- | --- |
| `application_form` | Warehouse Operator License Application | `PENDING_STAFF` | `DEPOSITOR` | `FORM` |
| `inspection_form` | Warehouse Inspector's License Application | `PENDING_MANAGER` | `STAFF` | `FORM` |
| `compliance_certificate` | Warehouse Operations Compliance | `APPROVED` | `REGULATOR` | `CERTIFICATE` |
| `goods_deposit_note` | Goods Deposit Note | `PENDING_STAFF` | `DEPOSITOR` | `FORM` |
| `insurance_certificate` | Goods Insurance Certificate | `PENDING_STAFF` | `DEPOSITOR` | `CERTIFICATE` |
| `customs_declaration` | Customs Declaration Form | `PENDING_STAFF` | `DEPOSITOR` | `FORM` |
| `packing_list` | Packing List | `PENDING_STAFF` | `DEPOSITOR` | `REPORT` |
| `warehouse_receipt` | Warehouse Delivery Receipt | `PENDING_MANAGER` | `STAFF` | `RECEIPT` |
| `depositor_registration` | Depositor Registration and Declaration Form | `PENDING_STAFF` | `DEPOSITOR` | `FORM` |
| `quality_certificate_form` | Quality Certificate Form | `PENDING_STAFF` | `DEPOSITOR`, `STAFF` | `CERTIFICATE` |
| `warehouse_receipt_delivery_report` | Warehouse Receipt Delivery Report | `PENDING_MANAGER` | `STAFF` | `REPORT` |
| `commodity_parameter_acknowledgement` | Commodity Quality Parameters Acknowledgement Form | `PENDING_STAFF` | `DEPOSITOR`, `STAFF` | `FORM` |
| `notice_of_withholding` | Notice of Withholding | `PENDING_MANAGER` | `STAFF` | `FORM` |
| `commodity_misdelivery` | Commodity Mis-Delivery Claim | `PENDING_STAFF` | `DEPOSITOR`, `STAFF` | `FORM` |
| `notice_of_deteriorating_goods` | Notice of Deteriorating Goods | `PENDING_STAFF` | `STAFF` | `FORM` |
| `staff_permission` | Staff Permission Request Form | `PENDING_MANAGER` | `STAFF` | `FORM` |
| `manager_permission` | Manager Permission Request Form | `PENDING_CEO` | `MANAGER` | `FORM` |
| `issued_quality_certificate` | Quality Certificate Issued to Depositor | `APPROVED` | `MANAGER`, `CEO` | `CERTIFICATE` |
| `warehouse_compliance_report` | Warehouse Operations Compliance Report | `PENDING_CEO` | `REGULATOR`, `ADMIN` | `CERTIFICATE` |
| `regulatory_ranking_report` | Regulatory Warehouse Ranking Report | `APPROVED` | `REGULATOR`, `ADMIN` | `REPORT` |
| `regulatory_inspection_report` | Regulatory Inspection Report | `APPROVED` | `REGULATOR`, `ADMIN` | `REPORT` |
| `warehouse_operation_cost_report` | Warehouse Operation Cost Structure Report | `PENDING_MANAGER` | `STAFF` | `REPORT` |

### 8.3 How to Add a New Document Type

1. Add a new entry to `wdms_documents/config/document_types.json`.
2. Choose an `initial_state`.
3. Define `allowed_uploader_roles`.
4. Define `allowed_transitions`.
5. List `required_fields` and `optional_fields`.
6. Add `classification_hints` so the LLM can classify the document.
7. Restart the backend so the loader validates the configuration.
8. Update frontend form options if the new type needs a custom page.

## 9. Finite State Machine Workflow

### 9.1 Main File

```text
wdms_documents/fsm/engine.py
```

This file is the heart of the workflow system.

The FSM engine is responsible for:

- computing allowed transitions for the current user
- verifying the user's role
- requiring a reason when configured
- changing the document status
- creating a `WorkflowTransition` audit record
- firing a `document_transitioned` signal

Views do not directly change `document.status`. They call:

```python
FSMEngine().execute_transition(...)
```

This is important. It means document state changes are centralized and audited.

### 9.2 Example Flow

For a depositor application form:

```text
DEPOSITOR uploads application_form
  -> initial state: PENDING_STAFF

STAFF confirms
  -> PENDING_MANAGER

MANAGER approves
  -> PENDING_CEO

CEO final_approve
  -> APPROVED
```

If staff, manager, or CEO finds a problem:

```text
PENDING_* -> CORRECTION_NEEDED
```

The depositor then resubmits:

```text
CORRECTION_NEEDED -> PENDING_STAFF
```

### 9.3 What Happens on Resubmit

The FSM engine has special logic for:

```text
action == "resubmit"
```

When edited fields are provided:

- it merges `edited_fields` into `document.ai_extracted_fields`
- it clears AI summary/review/confidence
- it sends the document back into the configured review state
- the view can trigger AI re-review

This is how the system supports human correction of AI-extracted fields.

## 10. Upload and AI Validation Flow

### 10.1 Main Files

- `wdms_documents/views.py`
- `wdms_ai_pipeline/tasks.py`
- `wdms_ai_pipeline/sse.py`
- `wdms_ai_pipeline/services/registry.py`
- `wdms_ai_pipeline/services/providers/vision_ocr.py`
- `wdms_ai_pipeline/services/providers/gemini_llm.py`
- `wdms_ai_pipeline/services/providers/vertex_embedding.py`
- `wdms_ai_pipeline/services/mocks/`

### 10.2 Stage 0: Upload Attempt Validation

Endpoint:

```text
POST /api/v1/documents/upload/
```

This endpoint:

1. validates the document type
2. checks whether the user's role can upload that document type
3. checks warehouse/tenant/regulator scope
4. creates an `UploadAttempt`
5. enqueues `validate_upload.delay(attempt.pk)`
6. returns an `attempt_id` and `stream_url`

The frontend opens:

```text
GET /api/v1/documents/upload/{attempt_id}/stream/
```

That SSE stream receives progress events from Redis.

Celery task:

```text
wdms_ai_pipeline/tasks.py::validate_upload
```

This task:

1. runs OCR
2. checks OCR confidence against the document type's threshold
3. asks the LLM to validate required fields and rules
4. sets the upload attempt status to `HARD_REJECT`, `SOFT_WARNING`, or `PASSED`
5. publishes a final SSE event

### 10.3 Stage 0 Outcomes

`HARD_REJECT`

- The document cannot be promoted.
- Example: no readable text or confidence below required minimum.

`SOFT_WARNING`

- The document has warnings but can be accepted if the user overrides.
- Example: missing optional clues or questionable field extraction.

`PASSED`

- The upload is acceptable and can be promoted.

### 10.4 Stage 1: Confirm Upload and Promote to Document

Endpoint:

```text
POST /api/v1/documents/upload/{attempt_id}/confirm/
```

This endpoint:

1. checks the upload attempt status
2. rejects `HARD_REJECT`
3. requires override for `SOFT_WARNING`
4. creates a real `Document`
5. sets the initial status from `document_types.json`
6. marks the attempt as `PROMOTED`
7. triggers AI pre-review

AI pre-review entry point:

```python
trigger_ai_pre_review(document.pk)
```

### 10.5 Stage 1 AI Chain

Defined in `wdms_ai_pipeline/tasks.py`:

```text
run_ocr
  -> classify_document
  -> extract_structured_fields
  -> generate_review
  -> generate_embedding
  -> signal_ai_review_complete
```

What each task does:

- `run_ocr`: ensures the document has text, reusing Stage 0 OCR when possible.
- `classify_document`: asks Gemini to classify the document among known types.
- `extract_structured_fields`: extracts required and optional fields.
- `generate_review`: produces summary, reviewer notes, and keywords.
- `generate_embedding`: writes a 768-dimensional vector to `Document.embedding`.
- `signal_ai_review_complete`: sends a signal for notifications.

### 10.6 Form-Fill Flow

Endpoint:

```text
POST /api/v1/documents/form-fill/
```

This creates a document from structured form fields without a file.

The submitted fields are stored directly in:

```text
Document.ai_extracted_fields
```

Since the form already provides structured fields, the AI chain skips OCR and
classification:

```text
generate_review
  -> generate_embedding
  -> signal_ai_review_complete
```

### 10.7 Mock AI Mode

The project can run without Google Cloud credentials by setting:

```text
USE_MOCK_AI_SERVICES=true
```

The registry in `wdms_ai_pipeline/services/registry.py` returns:

- `MockOCRService`
- `MockLLMService`
- `MockEmbeddingService`

This makes local development and testing much easier.

## 11. AI Provider Design

### 11.1 Service Interfaces

The backend uses interfaces:

- `services/interfaces/ocr.py`
- `services/interfaces/llm.py`
- `services/interfaces/embedding.py`

The tasks call the registry, not the providers directly. This is a clean
architecture decision because real providers can be replaced by mocks.

### 11.2 Google Cloud Vision OCR

Provider:

```text
wdms_ai_pipeline/services/providers/vision_ocr.py
```

It supports:

- images: `png`, `jpg`, `jpeg`, `tif`, `tiff`, `bmp`, `gif`, `webp`
- PDFs: `pdf`

Images use `document_text_detection`.
PDFs use `batch_annotate_files`.

The provider returns:

- text
- average confidence
- per-page confidence

### 11.3 Gemini LLM Provider

Provider:

```text
wdms_ai_pipeline/services/providers/gemini_llm.py
```

Gemini is used for:

- classification
- field extraction
- upload validation
- review summary
- ranking explanation

The project uses structured JSON output through Pydantic response schemas.
That is much safer than parsing free-form LLM text.

Prompts live in:

```text
wdms_ai_pipeline/prompts/
```

Important prompt files:

- `classification.py`
- `extraction.py`
- `validation.py`
- `review.py`
- `ranking_explanation.py`

### 11.4 Vertex Embeddings and pgvector

Provider:

```text
wdms_ai_pipeline/services/providers/vertex_embedding.py
```

Embeddings are generated with `text-embedding-004` by default and expected to
have 768 dimensions.

Model field:

```python
embedding = VectorField(dimensions=768, null=True, blank=True)
```

The semantic search endpoint embeds the query and compares it with stored
document embeddings using pgvector cosine distance.

## 12. Search

### 12.1 Main Endpoint

```text
POST /api/v1/documents/search/
```

Implemented in:

```text
wdms_documents/views.py
```

Input:

```json
{
  "query": "warehouse license",
  "type": "auto"
}
```

Supported modes:

- `keyword`
- `semantic`
- `auto`

### 12.2 Keyword Search

Keyword search uses normal database filtering against document text-like
fields, such as title, document type, AI summary, extracted text, and keywords.

This is best when the user knows exact phrases or identifiers.

### 12.3 Semantic Search

Semantic search:

1. embeds the user query through the embedding service
2. excludes documents without embeddings
3. annotates distance using pgvector cosine distance
4. returns the closest results

This is best when the user asks by meaning rather than exact terms.

Example:

```text
"documents about deteriorating commodities"
```

could match a document whose exact title is:

```text
"Notice of Conditioning / Selling / Disposal of Deteriorating Goods"
```

## 13. Notifications

### 13.1 Main Files

- `wdms_notifications/models.py`
- `wdms_notifications/dispatcher.py`
- `wdms_notifications/views.py`
- `wdms_notifications/channels/dashboard.py`
- `wdms_notifications/channels/email.py`
- `wdms_notifications/channels/sms.py`
- `wdms_notifications/templates/email/`

### 13.2 Notification Models

`NotificationPreference`

Controls which channels are enabled for each event type and user.

Channels:

- `DASHBOARD`
- `EMAIL`
- `SMS`

`NotificationEvent`

Represents a notification item. Dashboard notifications are rows in this table.

Important fields:

- `recipient`
- `event_type`
- `subject`
- `body`
- `related_document_id`
- `channels_sent`
- `read_on_dashboard`
- `read_at`

### 13.3 Triggering Notifications

The FSM engine fires:

```python
document_transitioned.send(...)
```

The dispatcher listens to that signal and maps selected transitions to event
types:

- staff confirmation
- manager approval
- CEO final approval
- correction request
- rejection

The AI pipeline also fires:

```python
document_ai_review_complete.send(...)
```

The dispatcher uses that signal to notify staff that a document is ready for
review.

## 14. Reporting and Regulatory Monitoring

### 14.1 Main Files

- `wdms_reports/models.py`
- `wdms_reports/ranking.py`
- `wdms_reports/views.py`
- `wdms_regulatory/models.py`
- `wdms_regulatory/views.py`
- `wdms_regulatory/serializers.py`

### 14.2 Warehouse Ranking

`WarehouseRanking` stores a precomputed compliance score for a warehouse.

The ranking formula is rule-based:

- approval ratio: 40 points
- low correction rate: 25 points
- inspection coverage: 20 points
- recent activity: 15 points

The final score maps to risk:

- `LOW`: score >= 70
- `MEDIUM`: score >= 40 and < 70
- `HIGH`: score < 40

The latest ranking is marked with:

```text
is_latest=True
```

This avoids expensive queries when showing the current ranking.

### 14.3 Regulatory Statistics

Endpoint:

```text
GET /api/v1/regulatory/warehouses/{warehouse_id}/statistics/
```

This returns:

- document counts by status
- document counts by type
- total approved/rejected documents
- inspection form count
- correction count
- last activity
- current ranking score
- risk category
- compliance trend

Regulators can only access warehouses in their jurisdiction unless they are
superusers/admins.

## 15. Frontend Architecture

### 15.1 Main Files

- `warehouse_dms_frontend/src/app/router.tsx`
- `warehouse_dms_frontend/src/app/providers.tsx`
- `warehouse_dms_frontend/src/lib/api.ts`
- `warehouse_dms_frontend/src/lib/queries.ts`
- `warehouse_dms_frontend/src/stores/auth-store.ts`
- `warehouse_dms_frontend/src/types/api.ts`
- `warehouse_dms_frontend/src/layouts/`
- `warehouse_dms_frontend/src/pages/`
- `warehouse_dms_frontend/src/components/`

### 15.2 Routing

`src/app/router.tsx` controls application navigation.

The router redirects by role:

- unauthenticated users go to `/login`
- `DEPOSITOR` users go to `/depositor`
- `REGULATOR` users go to `/regulator`
- operational roles go to `/dashboard`

Role-protected sections:

```text
STAFF / MANAGER / CEO / ADMIN
  -> OperationalShell
  -> dashboard, documents, search, upload, review, admin pages

DEPOSITOR
  -> OperationalShell
  -> depositor home, upload, documents, corrections, downloads

REGULATOR / ADMIN
  -> RegulatorShell
  -> regulator dashboard, warehouse details, documents, inspections
```

### 15.3 API Client

`src/lib/api.ts` creates the Axios instance.

Responsibilities:

- choose `VITE_API_URL` or `/api/v1`
- attach `Authorization: Bearer <token>`
- convert relative media URLs into full URLs
- mark API health as reachable/unreachable
- show toast errors for network/server failures
- provide helpers such as `getItem`, `getList`, `postItem`, `postEnvelope`

### 15.4 Query Layer

`src/lib/queries.ts` defines reusable functions and React Query hooks.

Examples:

- `useProfileQuery`
- `useDocumentTypesQuery`
- `useWarehousesQuery`
- `useDocumentsQuery`
- `useDocumentQuery`
- `useDocumentTransitionsQuery`
- `useNotificationsQuery`
- `useDocumentSearchQuery`
- `useDocumentStatsQuery`

This layer keeps API access consistent and avoids spreading raw Axios calls
through the UI.

### 15.5 Auth Store

`src/stores/auth-store.ts` persists:

- access token
- refresh token
- expiry
- user
- profile
- roles

It also exposes:

- `permissionSet()`
- `primaryRole()`
- `clearSession()`

### 15.6 Important Page Groups

Operational users:

- `src/pages/dashboard-page.tsx`
- `src/pages/documents-page.tsx`
- `src/pages/document-review-page.tsx`
- `src/pages/scan-upload-page.tsx`
- `src/pages/staff-permission-form-page.tsx`
- `src/pages/admin/`

Depositor users:

- `src/pages/depositor/depositor-home-page.tsx`
- `src/pages/depositor/depositor-upload-page.tsx`
- `src/pages/depositor/depositor-documents-page.tsx`
- `src/pages/depositor/depositor-document-detail-page.tsx`
- `src/pages/depositor/depositor-correction-page.tsx`
- `src/pages/depositor/depositor-registration-form-page.tsx`

Regulators:

- `src/pages/regulator/regulator-dashboard-page.tsx`
- `src/pages/regulator/regulator-warehouse-detail-page.tsx`
- `src/pages/regulator/regulator-documents-page.tsx`
- `src/pages/regulator/regulator-inspections-page.tsx`
- `src/pages/regulator/regulator-document-view-page.tsx`

Shared document review components:

- `src/components/document-review/document-viewer.tsx`
- `src/components/document-review/pdf-viewer.tsx`
- `src/components/document-review/image-viewer.tsx`
- `src/components/document-review/review-panel.tsx`
- `src/components/document-review/extracted-fields-form.tsx`
- `src/components/document-review/history-timeline.tsx`
- `src/components/document-review/transition-dialog.tsx`

## 16. End-to-End User Journeys

### 16.1 Depositor Uploads a Document

```text
Depositor logs in
  -> frontend stores token and roles
  -> depositor opens upload page
  -> frontend fetches document types and warehouses
  -> depositor submits file
  -> backend creates UploadAttempt
  -> Celery validates with OCR + LLM
  -> frontend watches SSE progress
  -> user confirms upload
  -> backend creates Document
  -> AI pre-review runs
  -> staff receive notification
  -> document appears in staff queue
```

Key code:

- `src/pages/depositor/depositor-upload-page.tsx`
- `src/lib/queries.ts::startUploadAttempt`
- `src/lib/queries.ts::confirmUploadAttempt`
- `wdms_documents/views.py::upload_document`
- `wdms_documents/views.py::upload_stream_view`
- `wdms_documents/views.py::confirm_upload`
- `wdms_ai_pipeline/tasks.py::validate_upload`
- `wdms_ai_pipeline/tasks.py::trigger_ai_pre_review`

### 16.2 Staff Reviews a Document

```text
Staff opens documents/review page
  -> frontend fetches document detail and available transitions
  -> staff checks file, extracted fields, summary, AI notes, transition history
  -> staff confirms or sends back
  -> backend calls FSMEngine.execute_transition
  -> WorkflowTransition is created
  -> document_transitioned signal fires
  -> notifications are dispatched
```

Key code:

- `src/pages/document-review-page.tsx`
- `src/components/document-review/`
- `src/lib/queries.ts::submitDocumentTransition`
- `wdms_documents/views.py::transition_document`
- `wdms_documents/fsm/engine.py`
- `wdms_notifications/dispatcher.py`

### 16.3 Depositor Corrects a Returned Document

```text
Document is in CORRECTION_NEEDED
  -> depositor opens correction page
  -> frontend shows current correction note and extracted fields
  -> depositor edits fields
  -> frontend submits action=resubmit with editedFields
  -> FSM merges edited fields into ai_extracted_fields
  -> document returns to review state
  -> AI review can rerun
```

Key code:

- `src/pages/depositor/depositor-correction-page.tsx`
- `src/lib/queries.ts::submitResubmit`
- `wdms_documents/fsm/engine.py`
- `wdms_documents/views.py::transition_document`

### 16.4 Regulator Monitors a Warehouse

```text
Regulator logs in
  -> frontend redirects to regulator dashboard
  -> regulator opens a warehouse page
  -> backend checks jurisdiction
  -> backend returns warehouse statistics
  -> ranking is read or computed on demand
  -> UI displays status counts, ranking score, risk category, trend
```

Key code:

- `src/pages/regulator/regulator-dashboard-page.tsx`
- `src/pages/regulator/regulator-warehouse-detail-page.tsx`
- `wdms_regulatory/views.py::get_warehouse_statistics`
- `wdms_tenants/querysets.py::get_regulator_queryset`
- `wdms_reports/ranking.py::compute_ranking`

## 17. API Surface Summary

### Authentication

```text
POST /api/v1/auth/login
POST /api/v1/auth/login/google
GET  /api/v1/auth/roles
POST /api/v1/auth/roles/assign
GET  /api/v1/auth/permissions/grouped
```

### Accounts

```text
POST /api/v1/accounts/register
POST /api/v1/accounts/verify
POST /api/v1/accounts/forgot-password
POST /api/v1/accounts/change-password
GET  /api/v1/accounts/me
PUT  /api/v1/accounts/me
GET  /api/v1/accounts/users
POST /api/v1/accounts/users
PUT  /api/v1/accounts/users/{unique_id}
POST /api/v1/accounts/users/{unique_id}/reset-password
DELETE /api/v1/accounts/users/{unique_id}
```

### Tenants and Warehouses

```text
GET    /api/v1/tenants/regions
POST   /api/v1/tenants/regions
PUT    /api/v1/tenants/regions/{unique_id}
DELETE /api/v1/tenants/regions/{unique_id}
GET    /api/v1/tenants/
POST   /api/v1/tenants/
PUT    /api/v1/tenants/{unique_id}
DELETE /api/v1/tenants/{unique_id}
GET    /api/v1/tenants/warehouses
POST   /api/v1/tenants/warehouses
PUT    /api/v1/tenants/warehouses/{unique_id}
DELETE /api/v1/tenants/warehouses/{unique_id}
```

### Documents

```text
POST /api/v1/documents/upload/
GET  /api/v1/documents/upload/{attempt_id}/stream/
POST /api/v1/documents/upload/{attempt_id}/confirm/
POST /api/v1/documents/form-fill/
POST /api/v1/documents/validate-form/
GET  /api/v1/documents/stats/
GET  /api/v1/documents/types/
POST /api/v1/documents/transitions/bulk/
POST /api/v1/documents/search/
GET  /api/v1/documents/
GET  /api/v1/documents/{document_id}/
GET  /api/v1/documents/{document_id}/transitions/
POST /api/v1/documents/{document_id}/transition/
POST /api/v1/documents/{document_id}/reclassify/
POST /api/v1/documents/{document_id}/correct-ai/
```

### Notifications

```text
GET  /api/v1/notifications/
POST /api/v1/notifications/{notification_id}/mark-read/
POST /api/v1/notifications/mark-all-read/
GET  /api/v1/notifications/preferences/
PUT  /api/v1/notifications/preferences/
```

### Reports and Regulatory

```text
GET  /api/v1/reports/warehouses/{warehouse_id}/ranking/
POST /api/v1/reports/warehouses/{warehouse_id}/ranking/recompute/
GET  /api/v1/reports/analytics/aggregates/
GET  /api/v1/regulatory/warehouses/{warehouse_id}/statistics/
```

## 18. Runtime and Deployment Flow

### 18.1 Docker Compose Services

`warehouse_dms/docker-compose.yml` starts:

- `db`: PostgreSQL 16 with pgvector
- `redis`: Redis 7
- `web`: Django ASGI app served by Uvicorn
- `worker`: Celery worker
- `beat`: Celery Beat scheduler

The web service uses Uvicorn instead of a basic sync server because the upload
progress stream uses long-lived SSE connections.

### 18.2 Local Backend Startup

```bash
cd warehouse_dms
cp .env.example .env
docker compose up --build
docker compose exec web python manage.py migrate
docker compose exec web python manage.py seed_permissions
```

Useful URLs:

```text
API docs:     http://localhost:8001/api/v1/docs
Django admin: http://localhost:8001/admin
```

### 18.3 Local Frontend Startup

```bash
cd warehouse_dms_frontend
pnpm install
pnpm dev
```

The frontend defaults to:

```text
VITE_API_URL=/api/v1
```

For direct backend access, configure:

```text
VITE_API_URL=http://localhost:8001/api/v1
```

## 19. Security Notes

### 19.1 Secrets

Never commit:

- `.env`
- service account JSON files
- API keys
- production JWT signing keys
- SMTP credentials
- Africa's Talking API keys
- Google Cloud credentials

The repository already ignores:

```text
.env
*.env
service.json
*service-account*.json
*service_account*.json
warehouse_dms/eztr.txt
```

If a Google service account key is ever committed, treat it as compromised:

1. delete or revoke the key in Google Cloud IAM
2. create a new key only if needed
3. update the local `.env`
4. rewrite Git history if the secret is in commits

### 19.2 Auth and Authorization

The project uses:

- JWT for identity
- AES wrapping for tokens returned by the app
- RBAC permissions for administrative endpoints
- explicit role checks for workflow transitions
- tenant and warehouse scoping for data visibility
- regulator jurisdiction scoping

### 19.3 User-Uploaded Files

Uploaded files are stored under Django media storage. Be careful when moving to
production:

- restrict allowed file types
- scan uploads if possible
- serve media through a controlled domain
- avoid exposing private files without auth
- consider object storage such as Google Cloud Storage or S3

## 20. How to Navigate the Codebase Quickly

If asked about authentication:

- Start with `wdms_uaa/views.py`
- Then read `wdms_uaa/authentication/services.py`
- Then read `wdms_uaa/authorization/auth_permission.py`
- Then inspect frontend `src/stores/auth-store.ts` and `src/lib/api.ts`

If asked about roles and permissions:

- Start with `wdms_uaa/models.py`
- Then read `wdms_uaa/authorization/services.py`
- Then inspect `wdms_utils/management/commands/seed_permissions.py`

If asked about document workflow:

- Start with `wdms_documents/config/document_types.json`
- Then read `wdms_documents/fsm/types.py`
- Then read `wdms_documents/fsm/engine.py`
- Then read `wdms_documents/views.py::transition_document`

If asked about AI:

- Start with `wdms_ai_pipeline/tasks.py`
- Then read `wdms_ai_pipeline/services/registry.py`
- Then read `wdms_ai_pipeline/services/providers/`
- Then read `wdms_ai_pipeline/prompts/`

If asked about upload progress:

- Start with `wdms_documents/views.py::upload_document`
- Then read `wdms_ai_pipeline/tasks.py::validate_upload`
- Then read `wdms_ai_pipeline/sse.py`
- Then inspect the frontend upload page and query functions

If asked about search:

- Start with `wdms_documents/views.py::search_documents`
- Then inspect `Document.embedding` in `wdms_documents/models.py`
- Then inspect `vertex_embedding.py`
- Then inspect frontend `src/pages/search/document-search-page.tsx`

If asked about regulators:

- Start with `wdms_regulatory/models.py`
- Then read `wdms_tenants/querysets.py::get_regulator_queryset`
- Then read `wdms_regulatory/views.py`
- Then inspect frontend regulator pages

If asked about reports/ranking:

- Start with `wdms_reports/ranking.py`
- Then read `wdms_reports/models.py`
- Then read `wdms_reports/views.py`

If asked about frontend routing:

- Start with `src/app/router.tsx`
- Then inspect `src/components/layout/require-auth.tsx`
- Then inspect `src/layouts/`

## 21. How to Explain the Project in an Interview or Defense

Short explanation:

> AeDWS is an AI-enabled warehouse document management system. It allows users
> to upload or fill warehouse documents, validates them using OCR and LLMs,
> extracts structured fields, routes documents through role-based approval
> workflows, records every transition in an audit trail, sends notifications,
> supports semantic search with pgvector embeddings, and gives regulators
> dashboards for compliance monitoring and warehouse risk ranking.

Technical explanation:

> The backend is a Django 5 system using Django Ninja for typed APIs. It uses
> PostgreSQL and pgvector to store relational records and document embeddings.
> Redis and Celery run asynchronous OCR, LLM validation, classification,
> extraction, review generation, embedding, email, and SMS jobs. Document
> workflow rules are configuration-driven through `document_types.json` and
> enforced by a finite state machine engine. The frontend is React and
> TypeScript with role-based routing, Axios, TanStack Query, and Zustand.

AI explanation:

> The AI layer is abstracted behind OCR, LLM, and embedding interfaces. In
> production it uses Google Cloud Vision, Vertex AI Gemini, and Vertex text
> embeddings. In development it can switch to mocks using
> `USE_MOCK_AI_SERVICES=true`. The LLM provider uses structured JSON schemas,
> which makes model output safer and easier to validate than plain text.

Workflow explanation:

> Documents do not move freely between statuses. Every move is checked against
> `document_types.json`, the user's role, the current document status, and any
> required reason. The FSM engine updates the document and creates a
> `WorkflowTransition` record in a single transaction, then fires signals used
> by notifications.

Frontend explanation:

> The frontend is organized by role. Depositors have upload, documents,
> correction, and downloads pages. Staff, managers, CEOs, and admins use the
> operational shell for dashboards, reviews, search, settings, and admin pages.
> Regulators use a separate shell for warehouse statistics, document inspection,
> and regulatory dashboards.

## 22. Recommended Future Improvements

### Security

- Rotate any exposed Google Cloud service account key immediately.
- Move production secrets into a secret manager.
- Replace broad `CORS_ALLOW_ALL_ORIGINS=True` with explicit allowed origins.
- Add file scanning for uploaded documents.
- Add object-level permission tests for every role.
- Consider signed URLs or authenticated media serving for private files.

### Backend Quality

- Add full test coverage around `FSMEngine.execute_transition`.
- Add tests for every document type transition.
- Add tests for tenant and regulator scoping.
- Add Celery task integration tests using mocks.
- Add idempotency checks for upload confirmation and notification dispatch.
- Standardize profile references in reports views; some checks refer to
  profile names such as `staff_profile`, while the main profile model is
  `user_profile`.

### AI Reliability

- Track AI task status per document in a dedicated model.
- Store model version and prompt version used for each AI result.
- Add confidence thresholds per extracted field, not just per OCR document.
- Add human feedback loops for corrected fields.
- Add prompt regression tests against sample documents.
- Consider Google Document AI for structured forms if OCR/extraction needs
  stronger document-specific parsing.

### Product Features

- Add advanced audit dashboards.
- Add exportable regulatory reports.
- Add document versioning.
- Add comments/discussion on document reviews.
- Add full bilingual content coverage for English and Swahili.
- Add scheduled ranking recomputation with Celery Beat.

### Frontend Quality

- Add route-level loading and error boundaries.
- Add unit tests for query hooks and auth behavior.
- Add integration tests for upload, review, correction, and regulator flows.
- Add form schemas for stronger frontend validation.
- Add accessibility review for dialogs, tables, and document viewers.

## 23. Reusing This Architecture in Other Projects

This project pattern can be reused for many document-heavy approval systems:

- university admissions document review
- procurement request approvals
- insurance claim intake and review
- customs/import/export document validation
- medical record submission and triage
- bank loan application processing
- legal contract intake and approval
- government licensing portals
- HR onboarding document management

The reusable architectural pattern is:

```text
Upload or form-fill
  -> validation
  -> AI extraction
  -> structured review
  -> role-based finite state machine
  -> audit log
  -> notifications
  -> search and analytics
```

For any similar project, keep these principles:

- Put business workflow rules in configuration when they change often.
- Enforce state changes through one engine, not scattered view logic.
- Keep AI providers behind interfaces.
- Store AI outputs separately from human corrections.
- Audit every state transition.
- Scope data by tenant, role, and jurisdiction.
- Use async workers for slow tasks.
- Use semantic search when users search by meaning, not exact words.

## 24. Further Reading and Reference Links

The following official or primary references are useful for understanding the
technologies used in this project:

- Django 5.1 documentation: https://docs.djangoproject.com/en/5.1/contents/
- Django API reference: https://docs.djangoproject.com/en/5.1/ref/
- Django Ninja documentation: https://django-ninja.dev/
- Celery documentation: https://docs.celeryq.dev/en/stable/
- Celery 5.4 user guide matching this project's pinned version:
  https://docs.celeryq.dev/en/v5.4.0/userguide/
- Docker Compose documentation: https://docs.docker.com/compose/
- Docker Compose file reference: https://docs.docker.com/compose/compose-file/
- pgvector repository and documentation: https://github.com/pgvector/pgvector
- Google Cloud Vision OCR documentation: https://cloud.google.com/vision/docs/ocr
- Vertex AI documentation: https://cloud.google.com/vertex-ai/docs
- Simple JWT documentation:
  https://django-rest-framework-simplejwt.readthedocs.io/en/stable/
- Vite guide: https://vite.dev/guide/
- React Router v6 documentation: https://reactrouter.com/v6
- TanStack Query React v5 documentation:
  https://tanstack.com/query/latest/docs/react/

## 25. Final Mental Model

Think of AeDWS as five connected systems:

1. Identity and scope system
   - Who is the user?
   - What role do they have?
   - Which tenant, warehouse, or region can they access?

2. Document intake system
   - What document is submitted?
   - Is it readable?
   - Is it the right type?
   - Are required fields present?

3. AI enrichment system
   - OCR extracts text.
   - Gemini classifies and extracts structured fields.
   - Gemini writes review notes and summaries.
   - Vertex embeddings enable semantic search.

4. Workflow system
   - `document_types.json` defines allowed transitions.
   - `FSMEngine` enforces those transitions.
   - `WorkflowTransition` records the audit trail.
   - Notifications are triggered by signals.

5. Experience and monitoring system
   - React pages expose role-specific workflows.
   - TanStack Query keeps data fresh.
   - Regulators inspect warehouse compliance.
   - Reports and rankings summarize risk.

If a reader understands these five systems, they can navigate the project,
explain the code, answer architectural questions, and extend the application
with confidence.
