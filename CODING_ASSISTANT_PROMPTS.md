# Warehouse DMS — Coding Assistant Prompt Pack

**Purpose:** Six phase-scoped prompts for Claude Sonnet 4.6 (Copilot), Claude Opus (Claude Code), and GPT/Codex. Copy one prompt at a time into a fresh session with the foundation document and visual reference attached. Run the phase. Review. Course-correct. Move to the next prompt.

**Rule of thumb for every prompt below:** Before pasting the prompt, attach both `WAREHOUSE_DMS_FOUNDATION.md` and `warehouse_dms_visual_reference.html` to the session. The prompts reference these documents constantly and will not produce correct output without them.

---

## How to sequence the prompts

The prompts are designed to run in order. Do not skip ahead. Each phase assumes the previous phase is complete and tested.

| # | Phase | Recommended Model | Tool |
|---|-------|-------------------|------|
| 1 | Backend skeleton | Claude Sonnet 4.6 | Copilot Pro |
| 2 | Document workflow without AI | Claude Opus | Claude Code |
| 3 | Notifications + SSE infrastructure | Claude Sonnet 4.6 | Copilot Pro |
| 4 | AI pipeline integration | Claude Opus | Claude Code |
| 5 | Frontend scaffold + operational shell | GPT-5 / Codex | Cursor / Codex CLI |
| 6 | Frontend role experiences + HITL review | GPT-5 / Codex | Cursor / Codex CLI |

Reports and regulatory layer get added later as a Phase 7 prompt when the first six are stable — do not bolt them on early.

---

## PROMPT 1 — Backend Skeleton (Phase 1 of the foundation document)

**Recommended model:** Claude Sonnet 4.6 via Copilot Pro
**Estimated session length:** 3–5 hours of guided coding
**Reference project:** the `secured_SRS` Django project (attach or paste its structure)

```
You are helping me build the backend skeleton for an AI-enabled warehouse document management system. I have attached:

1. WAREHOUSE_DMS_FOUNDATION.md — the complete architectural specification
2. warehouse_dms_visual_reference.html — the visual design reference

You must read the foundation document in full before writing any code. Pay particular attention to:
- Part Four (project structure with wdms_ prefix)
- Part Five (multi-tenancy model)
- Part Six (role-based access control)
- The fact that this project mirrors the architecture of my existing secured_SRS project, which uses Django Ninja, BaseModel, ResponseObject, and a specific service-layer pattern with authentication and authorization cleanly separated.

SCOPE OF THIS PROMPT — Phase 1 only:

Build the project skeleton. This means:

1. Create the Django project `warehouse_dms` with the exact app structure from Part Four of the foundation document. The apps are: wdms_utils, wdms_uaa, wdms_accounts, wdms_tenants, wdms_documents, wdms_ai_pipeline, wdms_notifications, wdms_reports, wdms_regulatory. For this phase, only the first four need working models — the rest can be stub apps with empty models.py files.

2. Port the following from secured_SRS into wdms_utils, keeping their exact internal structure and behaviour:
   - BaseModel.py (identical)
   - SharedSerializer.py (identical — keep the camelCase alias_generator, the TimeRangeEnum, the BaseSerializer, BasePagedFilteringSerializer, BasePagedResponseList, BaseNonPagedResponseData, BaseSchema)
   - response.py (identical — ResponseObject, get_paginated_and_non_paginated_data, apply_search_filter, apply_date_filters, PageObject)
   - encryption.py (identical AESCipher)
   - tokens.py (identical)
   - email.py (identical)
   - permissions.py (NEW content — define the warehouse DMS permission groups and codes as described in Part Six of the foundation document, with role_permission_mappings for DEPOSITOR, STAFF, MANAGER, CEO, REGULATOR, ADMIN)
   - CreateUserAddSeedPermissions.py (adapted — same structure as secured_SRS but reads the new permissions and creates the new roles)
   - general.py (identical — get_week_range)

3. Build wdms_uaa with the same pattern as secured_SRS srs_uaa:
   - Models: UserPermissionsGroup, UserPermissions, UserRoles, UserRolesWithPermissions, UsersWithRoles, LoginAttempt (identical structure)
   - authentication/services.py with AuthenticationService
   - authentication/user_management.py with UserManagementService, adapted to assign DEPOSITOR as the default role
   - authorization/services.py with AuthorizationService
   - authorization/auth_permission.py with PermissionAuth
   - views.py with the login, login_with_google, roles management, and grouped_permissions endpoints
   - serializers.py with the same schema patterns

4. Build wdms_accounts following secured_SRS srs_accounts patterns:
   - UserProfile model, but EXTEND it to add:
     * tenant ForeignKey to wdms_tenants.Tenant (nullable for admins and during transition)
     * warehouse ForeignKey to wdms_tenants.Warehouse (nullable)
     * preferred_language CharField with 'en' and 'sw' choices, default 'en'
   - Change account_type choices to DEPOSITOR, STAFF, MANAGER, CEO, REGULATOR, ADMIN
   - ForgotPasswordRequestUser and ActivateAccountTokenUser identical to secured_SRS
   - Full views.py with register, verify, forgot password, change password, get my profile, update my profile, admin user creation

5. Build wdms_tenants with the models defined in Part Five of the foundation document:
   - Tenant model
   - Region model (seed it with initial Tanzania regions: Dar es Salaam, Dodoma, Arusha, Mwanza, Mbeya, Tanga, Morogoro, Kilimanjaro, Iringa, Kigoma — use a migration data seed)
   - Warehouse model
   - querysets.py with get_user_tenant, get_tenant_queryset, and a stub for get_regulator_queryset (will be filled in later phases)
   - views.py with CRUD endpoints for Tenant, Region, Warehouse — admin-only for tenant/region, tenant-scoped for warehouse
   - serializers.py following the table/input/filtering/paged/non-paged pattern from secured_SRS

6. Configure secured_SRS/settings.py as warehouse_dms/settings.py with:
   - PostgreSQL database (use DATABASE_URL env var with dj-database-url)
   - pgvector extension enabled via django-pgvector setup
   - Redis URL for CELERY_BROKER_URL and CELERY_RESULT_BACKEND (but do not wire up Celery tasks yet)
   - JWT settings identical to secured_SRS
   - LOGGING config identical to secured_SRS but with logger name 'wdms_logger'
   - The same dotenv_values('.env') pattern
   - Role name constants: DEFAULT_SUPER_ADMIN_ROLE_NAME='ADMIN', DEPOSITOR_ROLE_NAME, STAFF_ROLE_NAME, MANAGER_ROLE_NAME, CEO_ROLE_NAME, REGULATOR_ROLE_NAME, DEFAULT_NORMAL_USER_ROLE=DEPOSITOR_ROLE_NAME
   - INSTALLED_APPS for all wdms_ apps and pgvector, ninja, rest_framework_simplejwt

7. Configure urls.py and wdms_api_v1.py following the secured_SRS pattern — a single NinjaAPI aggregator at /api/v1/ with routers from wdms_uaa (/auth/), wdms_accounts (/accounts/), wdms_tenants (/tenants/).

8. Create a Docker Compose setup at the project root with: web (Django), db (PostgreSQL 16 with pgvector), redis. Include a Dockerfile for web. Do not include worker, beat, or frontend services yet — those come in later phases.

9. Create a requirements.txt with pinned versions of: Django 5.1+, django-ninja, pgvector, psycopg2-binary, celery, redis, python-dotenv, pycryptodome, pyjwt, rest_framework_simplejwt, django-storages[google], dj-database-url, gunicorn, uvicorn, scalar-django-ninja, google-auth, jinja2.

10. Create a README.md at the project root with setup instructions: clone, create .env from .env.example, docker compose up, manage.py migrate, manage.py seed_permissions (the management command you'll copy from secured_SRS).

CONSTRAINTS AND STYLE:

- Match secured_SRS code style exactly. Same import order, same docstring style, same log messages format, same error handling pattern, same use of ResponseObject.get_response(id, message). If secured_SRS uses a particular pattern, use that pattern here.
- Use camelCase aliases on every schema (to_camel alias_generator) — the frontend expects camelCase.
- Every model inherits from BaseModel.
- Every view uses the ResponseObject response envelope.
- Every list view uses get_paginated_and_non_paginated_data.
- Every tenant-bound queryset goes through get_tenant_queryset.

WHAT YOU SHOULD NOT DO IN THIS PHASE:

- Do not create Document, UploadAttempt, or any workflow models — those are Phase 2.
- Do not set up Celery tasks or workers — that's Phase 3.
- Do not touch the AI pipeline — that's Phase 4.
- Do not scaffold the frontend — that's Phase 5.
- Do not write notification logic — that's Phase 3.

SUCCESS CRITERIA — how I will verify the phase is done:

1. `docker compose up` brings web, db, redis up cleanly.
2. `python manage.py migrate` runs without errors against the PostgreSQL container.
3. `python manage.py seed_permissions` creates the six roles, all permissions, and the admin user.
4. I can POST to `/api/v1/auth/login/` with admin credentials and receive an access token.
5. I can GET `/api/v1/auth/roles/` with that token and see all six roles.
6. I can POST `/api/v1/tenants/` to create a tenant, POST `/api/v1/tenants/regions/` to create a region, and POST `/api/v1/tenants/warehouses/` to create a warehouse.
7. I can register a depositor, verify the account, and log in as that depositor.
8. The OpenAPI docs at `/api/docs` render cleanly with all endpoints visible.

WHERE TO START:

Start by reading both attached documents end to end. Then ask me any clarifying questions you have BEFORE writing any code. After I answer, produce a proposed file tree with empty file stubs so I can confirm the structure, then implement in this order: wdms_utils, settings.py, wdms_uaa, wdms_accounts, wdms_tenants, urls.py, Docker setup, README. Commit after each app is complete so I can review before you move on.
```

---

## PROMPT 2 — Document Workflow Without AI (Phase 2 of the foundation document)

**Recommended model:** Claude Opus via Claude Code
**Estimated session length:** 4–6 hours of guided coding
**Prerequisite:** Phase 1 complete, tested, and committed

```
You are helping me build the document workflow layer for an AI-enabled warehouse document management system. I have attached:

1. WAREHOUSE_DMS_FOUNDATION.md — the complete architectural specification
2. warehouse_dms_visual_reference.html — the visual design reference

Phase 1 (skeleton with tenants, roles, auth) is already complete and committed. You are now building Phase 2.

You must read the foundation document in full before writing any code. Pay particular attention to:
- Part Seven (document type configuration schema — THIS IS THE HEART OF THIS PHASE)
- Part Eight (core data models — UploadAttempt, Document, WorkflowTransition)
- Part Nine, sections on Stage Two (human-in-the-loop approval chain)
- Part Eleven (starter code for the FSM engine — USE THIS EXACTLY, do not reinvent)

SCOPE OF THIS PROMPT — Phase 2 only:

Build the document workflow without any AI integration. The pipeline for documents in this phase is: depositor uploads a file → document is immediately created as PENDING_STAFF with no validation → staff reviews and confirms → manager approves → CEO final-approves. AI fields exist on the model but are not populated. No SSE. No Celery tasks.

1. Create `wdms_documents/config/document_types.json` with the four document types from Part Seven of the foundation document (application_form, inspection_form, compliance_certificate, warehouse_receipt). Include the full schema as shown in the foundation document.

2. Create `wdms_documents/fsm/types.py` — the document type configuration loader. It must:
   - Load the JSON file once at module import
   - Validate the schema (every type has id, label, category, initial_state, allowed_transitions, required_fields, file_formats, validation_rules, classification_hints, allowed_uploader_roles)
   - Expose a DocumentTypeDefinition dataclass
   - Expose: get_document_type(type_id), get_all_document_types(), get_allowed_transitions(type_id, from_state, user_role), get_required_fields(type_id)
   - Raise ImproperlyConfigured at import time if the JSON is malformed

3. Create `wdms_documents/models.py` with UploadAttempt, Document, and WorkflowTransition — use the EXACT model definitions from Part Eight of the foundation document. The embedding field is VectorField(dimensions=1536, null=True) from pgvector.django. Do not skip any fields even though we will not populate them all this phase.

4. Create `wdms_documents/fsm/engine.py` — copy the FSMEngine starter code from Part Eleven of the foundation document VERBATIM. It is already correct. Do not reinvent it. The signal `document_transitioned` is defined there.

5. Create `wdms_documents/views.py` with a ninja Router and these endpoints:

   Upload endpoints (simplified for this phase — no SSE, immediate document creation):
   - POST /api/v1/documents/upload/ — accepts multipart form data with the file, document_type_id, warehouse_id, title. Creates an UploadAttempt with validation_status='PASSED' (we skip real validation this phase). Immediately promotes it to a Document in the initial_state defined by the document type config. Returns the document.
   - POST /api/v1/documents/{id}/transition/ — accepts action and reason. Uses FSMEngine.execute_transition to move the document. Returns the updated document.

   Read endpoints (tenant-scoped):
   - GET /api/v1/documents/ — list documents with filtering by status, document_type_id, uploader_id, warehouse_id. Use get_paginated_and_non_paginated_data and get_tenant_queryset. Filter additionally by role: DEPOSITOR sees only own documents, STAFF sees own warehouse, MANAGER/CEO see own tenant.
   - GET /api/v1/documents/{id}/ — detail view including full transition history. Enforce the same role-scoped visibility.
   - GET /api/v1/documents/{id}/transitions/ — returns available transitions for the current user using FSMEngine.get_allowed_transitions.

   Metadata:
   - GET /api/v1/documents/types/ — returns all document types from the config as JSON, for the frontend to render upload forms and filters.

6. Create `wdms_documents/serializers.py` following the table/input/filtering/paged/non-paged pattern from secured_SRS. The DocumentTableSerializer should include the extracted_text, ai_classification, ai_extracted_fields, ai_review_notes, ai_confidence_score — even though they will be empty this phase, the frontend will expect the shape. Also include embedded transitions as a nested list in the detail serializer.

7. Add signal handlers in `wdms_documents/signals.py`:
   - Log every transition at INFO level with document id, from, to, actor
   - Do NOT dispatch notifications yet (that's Phase 3) — leave a comment where the notification dispatch will go

8. Add a management command `wdms_documents/management/commands/seed_demo_documents.py` that creates 20 sample documents across various statuses and types for manual testing. This makes Phase 5 (frontend) much easier because the frontend team has real data to work against.

9. Register the documents router in `warehouse_dms/wdms_api_v1.py` at `/documents/`.

10. Add permission codes for document operations in `wdms_utils/permissions.py`:
    - upload_document, view_own_documents, view_warehouse_documents, view_tenant_documents, view_jurisdiction_documents
    - confirm_document, approve_document_manager, approve_document_ceo, send_document_back
    Update role_permission_mappings so DEPOSITOR gets upload_document + view_own_documents, STAFF gets confirm_document + view_warehouse_documents, etc. Reseed.

CONSTRAINTS AND STYLE:

- Follow the FSM starter code from Part Eleven EXACTLY. It is designed to be the authority on transitions. Do not add shortcut methods, do not bypass execute_transition.
- Every transition must produce a WorkflowTransition record. That IS the audit log — there is no separate audit table.
- File uploads go to `documents/%Y/%m/` via FileField. For local dev, MEDIA_ROOT handles it. Do not hardcode paths.
- When a document enters CORRECTION_NEEDED, store the reason in `current_correction_note` on the document so the frontend can display it prominently without scrolling through the transition history.
- Tenant scoping is NON-NEGOTIABLE. Every list and detail query must go through get_tenant_queryset or filter by a tenant-reaching field. Audit every query you write.

WHAT YOU SHOULD NOT DO IN THIS PHASE:

- Do not wire up any AI service. The ai_* fields exist but stay empty.
- Do not implement SSE streaming. Upload is synchronous.
- Do not dispatch notifications — just log transitions.
- Do not touch the frontend.
- Do not implement search (keyword or semantic) — that's Phase 4.

SUCCESS CRITERIA:

1. I can log in as a depositor, POST a PDF to /api/v1/documents/upload/ with document_type_id='application_form' and a valid warehouse_id, and receive a created document with status=PENDING_STAFF.
2. I log in as a staff member of the same warehouse, GET /api/v1/documents/?status=PENDING_STAFF and see the document.
3. I POST /api/v1/documents/{id}/transition/ with action='confirm' and the document moves to PENDING_MANAGER. A WorkflowTransition is recorded.
4. A manager approves it with action='approve', it moves to PENDING_CEO.
5. A CEO final-approves with action='final_approve', it moves to APPROVED.
6. At the PENDING_MANAGER stage, the manager can send the document back to the depositor with action='send_back' and a reason. The document enters CORRECTION_NEEDED with the reason in current_correction_note.
7. When the depositor resubmits with action='resubmit', the document returns to PENDING_STAFF.
8. The full transition history is visible on GET /api/v1/documents/{id}/.
9. GET /api/v1/documents/types/ returns the four document types with their full schema.
10. A DEPOSITOR trying to approve a document, or a STAFF trying to final-approve, gets rejected with a 403-equivalent response.
11. A user from tenant A cannot see any documents from tenant B, ever.

WHERE TO START:

First, summarize your understanding of the document_types.json schema and the FSM engine back to me in your own words so I can verify you got it. Then ask any clarifying questions. Then produce the document_types.json file and have me review it BEFORE you write any Python — this file is the spine of the phase and getting it right matters more than speed. Then implement in this order: types loader, models + migration, FSM engine (copy from foundation), serializers, views, signals, permissions, demo seed command. Commit after models, after FSM, after views — three checkpoints.
```

---

## PROMPT 3 — Notifications + SSE Infrastructure (Phase 3 of the foundation document)

**Recommended model:** Claude Sonnet 4.6 via Copilot Pro
**Estimated session length:** 3–4 hours
**Prerequisite:** Phases 1–2 complete and tested

```
You are helping me add the notification system and server-sent event infrastructure to an AI-enabled warehouse document management system. I have attached:

1. WAREHOUSE_DMS_FOUNDATION.md — the complete architectural specification
2. warehouse_dms_visual_reference.html — the visual design reference

Phases 1 and 2 are complete and committed. The document workflow is running. You are now building Phase 3.

Read the foundation document in full before writing any code. Pay particular attention to:
- Part Eight, the NotificationEvent, NotificationPreference, NotificationChannel, NotificationEventType models
- Part Nine, Stage Zero (pre-submission validation with SSE)
- Part Eleven, the server-sent event publishing helpers and the notification dispatcher — USE THIS CODE EXACTLY

SCOPE OF THIS PROMPT — Phase 3 only:

Add the notification system (dashboard, email, SMS via Africa's Talking) and the SSE streaming infrastructure. Note: in this phase, the SSE infrastructure is wired up and testable but the actual AI validation calls come in Phase 4. We build the plumbing here, not the AI calls.

1. Set up Celery properly in this phase:
   - Create `warehouse_dms/celery.py` with the Celery app, broker=CELERY_BROKER_URL, result_backend=CELERY_RESULT_BACKEND, autodiscover_tasks across all wdms_ apps
   - Import it in `warehouse_dms/__init__.py` so Django picks it up
   - Add Celery Beat scheduler configuration (empty schedule for now — Phase 4 will add the ranking task)
   - Update Docker Compose to add `worker` service (celery -A warehouse_dms worker) and `beat` service (celery -A warehouse_dms beat)

2. Create `wdms_notifications/models.py` with NotificationChannel, NotificationEventType, NotificationPreference, NotificationEvent — use the EXACT model definitions from Part Eight of the foundation document.

3. Create `wdms_notifications/dispatcher.py` — copy the notification dispatcher starter code from Part Eleven of the foundation document VERBATIM. It subscribes to the document_transitioned signal fired by the FSM engine.

4. Create `wdms_notifications/channels/`:
   - `email.py` with a Celery task `send_email_task(event_id)` that loads the NotificationEvent, renders an HTML email using the same Jinja2 pattern as secured_SRS/srs_utils/email.py, and sends via SMTP configured by environment variables. Templates go in `wdms_notifications/templates/email/`.
   - `sms.py` with a Celery task `send_sms_task(event_id)` that loads the event and sends an SMS via Africa's Talking. Use the africastalking Python SDK (add to requirements.txt). The API key, username, and sender ID are read from environment variables.
   - `dashboard.py` — this is a no-op file because dashboard notifications ARE the NotificationEvent record itself. Include a comment explaining this.

5. Create `wdms_notifications/views.py` with these endpoints:
   - GET /api/v1/notifications/ — list the authenticated user's notifications (NotificationEvent records where recipient=request.user), paginated, ordered by newest first.
   - POST /api/v1/notifications/{id}/mark-read/ — mark a notification as read.
   - POST /api/v1/notifications/mark-all-read/ — mark all as read.
   - GET /api/v1/notifications/preferences/ — return the user's notification preferences organized by event type and channel.
   - PUT /api/v1/notifications/preferences/ — accept an array of preferences and update them.

6. Create `wdms_notifications/management/commands/seed_default_preferences.py` — for every existing user, create default preferences: dashboard=on for all event types, email=on for terminal events (APPROVED, REJECTED, SENT_BACK), sms=off for all. Run this after Phase 3 deployment.

7. Create `wdms_ai_pipeline/sse.py` — copy the server-sent event publishing and streaming code from Part Eleven of the foundation document VERBATIM. This gives us publish_progress, publish_complete, and stream_upload_progress.

8. Update `wdms_documents/views.py` to use SSE for the upload flow. Replace the Phase 2 synchronous upload with:
   - POST /api/v1/documents/upload/ — saves the file to staging, creates an UploadAttempt with status=PENDING, enqueues a Celery task `validate_upload_stub(attempt_id)` (defined next), returns the attempt_id and a stream URL.
   - GET /api/v1/documents/upload/{attempt_id}/stream/ — wraps stream_upload_progress. This endpoint must be served by Uvicorn/Daphne, not Gunicorn's sync workers, because SSE requires long-lived connections. Update the Docker Compose web service command accordingly.
   - POST /api/v1/documents/upload/{attempt_id}/confirm/ — promotes the UploadAttempt to a Document. Accepts a soft_warning_override boolean. The Document is created in the document type's initial_state. The UploadAttempt is marked PROMOTED.

9. Create `wdms_ai_pipeline/tasks.py` with a STUB task `validate_upload_stub(attempt_id)`. In this phase, it does NOT call real AI — it just simulates the flow:
   - publish_progress(attempt_id, 'ocr', 'processing', 'Reading document...')
   - sleep 2 seconds
   - publish_progress(attempt_id, 'ocr', 'done', 'OCR complete', character_count=500, confidence=0.88)
   - publish_progress(attempt_id, 'validation', 'processing', 'Checking required fields...')
   - sleep 2 seconds
   - Update the UploadAttempt with validation_status=PASSED and ocr_text='(stub)' and ocr_confidence=0.88
   - publish_complete(attempt_id, 'PASSED', warnings=[])
   
   This stub lets us test the full SSE plumbing end-to-end in Phase 3 without needing AI credentials. Phase 4 will replace this task with the real validation logic.

10. Update `wdms_documents/signals.py` — remove the comment placeholder from Phase 2 and confirm the dispatcher is connected via @receiver in dispatcher.py (it already is if you used the starter code verbatim).

11. Add email templates in `wdms_notifications/templates/email/`:
    - `document_approved_final.html`
    - `document_rejected.html`
    - `document_sent_back.html`
    - `document_approved_by_manager.html`
    Each is a simple branded email with the system logo, recipient name, subject, body, and a link to the document in the frontend. Use inline CSS — email clients are hostile to external styles.

12. Add permission codes `view_own_notifications`, `manage_own_preferences` to wdms_utils/permissions.py and map them to every non-admin role. Reseed.

CONSTRAINTS AND STYLE:

- The dispatcher is a SIGNAL RECEIVER. It must never be called directly from view code. The FSM engine fires the signal; the dispatcher listens. Do not create a coupling where views call dispatch functions manually.
- SMS is expensive. The default preference for SMS is OFF. Never send SMS for intermediate states — only terminal states should default to SMS-on.
- The SSE endpoint uses `StreamingHttpResponse`. Set `X-Accel-Buffering: no` header so nginx does not buffer.
- Redis pub-sub is the channel between Celery workers and SSE stream. The channel name is `upload:{attempt_id}`. Keep it consistent across publish and subscribe.
- When you update Docker Compose to add worker + beat, keep existing web + db + redis services. Add only — do not modify the existing services unless you must.

WHAT YOU SHOULD NOT DO IN THIS PHASE:

- Do not call Google Vision, Groq, or OpenAI. The validate_upload_stub is a stub on purpose.
- Do not wire up the AI pre-review chain. That's Phase 4.
- Do not touch the frontend.
- Do not implement ranking reports or the regulator layer.

SUCCESS CRITERIA:

1. `docker compose up` brings web, worker, beat, db, redis all up cleanly.
2. A depositor POSTs a file to /api/v1/documents/upload/ and receives an attempt_id.
3. Connecting to /api/v1/documents/upload/{attempt_id}/stream/ with a browser EventSource shows the two-stage progress events arriving in real time.
4. The attempt completes with outcome=PASSED, and confirming via POST produces a Document in the right initial state.
5. A transition from PENDING_MANAGER to PENDING_CEO triggers a NotificationEvent in the database for the uploader and all CEOs in the tenant.
6. If the CEO has email=on for DOCUMENT_APPROVED_BY_MANAGER, an email is dispatched via the Celery worker within seconds (test with a local SMTP catcher like MailHog).
7. GET /api/v1/notifications/ returns the user's unread notifications paginated.
8. PUT /api/v1/notifications/preferences/ updates preferences and new transitions respect them.

WHERE TO START:

Read the attached docs. Then summarize to me how the SSE plumbing works end-to-end: client POSTs upload → server creates attempt → server enqueues Celery task → Celery worker publishes progress to Redis channel → SSE endpoint subscribes to that channel → events stream to the browser. Once you explain this back correctly, produce the Docker Compose update first, then wire Celery, then the notification models, then the dispatcher, then the SSE helpers, then the upload flow. Commit at each milestone.
```

## PROMPT 4 — AI Pipeline Integration (Phase 4 of the foundation document)

**Recommended model:** Claude Opus via Claude Code
**Estimated session length:** 5–7 hours
**Prerequisite:** Phases 1–3 complete, SSE plumbing verified with the stub task
---
You are integrating the artificial intelligence pipeline into an AI-enabled warehouse document management system. I have attached:

1. WAREHOUSE_DMS_FOUNDATION.md — the complete architectural specification
2. warehouse_dms_visual_reference.html — the visual design reference  
3. SECURED_SRS_REFERENCE_PATTERNS.md — the architectural patterns of the reference project

Phases 1–3 are complete. The workflow, notifications, and SSE plumbing all work. The validate_upload_stub is in place and proven end-to-end. You are now replacing that stub with real AI and adding the full pre-review chain.

IMPORTANT NOTE ON THE AI PROVIDER STACK — READ THIS BEFORE ANYTHING ELSE.

The original foundation document specified Groq for language model tasks and OpenAI for embeddings. We have changed this decision. The system will now use a Google Cloud consolidation for two specific reasons. First, the Tanzanian use case involves documents that mix Swahili and English on the same page, and Gemini handles African languages noticeably better than Llama models do because Google has explicitly invested in African language support as a strategic priority. Second, consolidating onto a single cloud provider simplifies authentication, billing, and operational complexity, which matters for a final year project that will be defended by a single developer.

The revised stack is:
- Google Cloud Vision API for raw text extraction with per-word confidence scores
- Vertex AI gemini-2.5-flash for all language model tasks (classification, field extraction, validation, review generation, ranking explanation)
- Vertex AI text-embedding-004 for semantic search embeddings (768 dimensions, not 1536)

If you encounter references to Groq or OpenAI in the foundation document or in the prompt below, treat them as legacy specifications that have been superseded by this revised stack. The interface contracts in the service layer are unchanged because the entire point of the interface pattern is that swapping providers does not require touching the consumers. Only the providers folder changes.

One important schema consequence. The Document model's embedding field is currently declared as VectorField(dimensions=1536) in the Phase 2 migration. You need to add a new migration in this phase that alters the column to VectorField(dimensions=768). The text-embedding-004 model produces 768-dimensional vectors and pgvector cannot store vectors of mismatched dimensions in the same column.

Read the foundation document in full before writing any code. Pay particular attention to:
- Part Nine, Stages Zero and One in detail
- Part Eleven, the Celery pipeline chain starter code — USE THIS VERBATIM
- Part Seven, the document type configuration — this drives every AI prompt

SCOPE OF THIS PROMPT — Phase 4 only:

Replace the stubs with real AI. Add semantic search. This is the most technically involved phase.

1. Create the service layer structure at wdms_ai_pipeline/services/:
   - interfaces/ocr.py with OCRServiceInterface (extract_text method, returns OCRResult dataclass with text, confidence, per_page_confidence)
   - interfaces/llm.py with LLMServiceInterface (classify, extract_fields, generate_review, validate_fields, generate_ranking_explanation methods)
   - interfaces/embedding.py with EmbeddingServiceInterface (embed method returning list[float] of dim 768)
   - mocks/ with mock implementations of all three — these are used in tests and can be toggled via env var USE_MOCK_AI_SERVICES=true. The mock embedding implementation must produce 768-dimensional vectors, not 1536.
   - providers/vision_ocr.py with VisionOCRService calling Google Cloud Vision via the google-cloud-vision Python library
   - providers/gemini_llm.py with GeminiLLMService calling Vertex AI's gemini-2.5-flash via the google-cloud-aiplatform Python library. Use Vertex's structured output feature with response_mime_type set to application/json and a response_schema specified for each prompt that returns structured data, so you get back valid JSON without having to parse free-form text.
   - providers/vertex_embedding.py with VertexEmbeddingService calling Vertex AI's text-embedding-004 model via the google-cloud-aiplatform library
   - registry.py with get_service_registry() — reads env and returns either mock or real services. The registry is a singleton.

2. Create wdms_ai_pipeline/prompts/ with prompt templates as Python strings (not f-strings in code — separate files for reviewability):
   - classification.py — prompt that takes extracted text and a list of candidate types with hints, returns JSON with type_id and confidence. The prompt should explicitly note that the text may be in Swahili, English, or a mix of both, and that the model should classify based on document semantics rather than language.
   - extraction.py — takes text, required_fields, optional_fields, returns JSON of field_name to value. The prompt should handle Swahili date formats (Januari, Februari, Machi, Aprili, Mei, Juni, Julai, Agosti, Septemba, Oktoba, Novemba, Desemba) and convert them to ISO 8601 format in the output.
   - validation.py — takes text, required_fields, validation_rules, returns list of warnings and a verdict (HARD_REJECT/SOFT_WARNING/PASS)
   - review.py — takes text, extracted fields, type label, returns summary and review notes and keywords. The summary should be in the same language as the document — if the document is in Swahili, the summary is in Swahili; if mixed, English.
   - ranking_explanation.py — takes warehouse name, rule-based score components, returns a human-readable explanation
   
   Each prompt insists on structured JSON output via Vertex AI's response_schema feature. Define a Pydantic model for each expected output shape and pass it to Vertex as the schema. This is much more reliable than the "respond only with JSON" pattern because Vertex enforces the structure at the model level.

3. Replace wdms_ai_pipeline/tasks.py with the real Celery tasks from Part Eleven of the foundation document:
   - run_ocr, classify_document, extract_structured_fields, generate_review, generate_embedding, signal_ai_review_complete — ALL COPIED VERBATIM from the foundation starter code
   - trigger_ai_pre_review(document_id) — the convenience chain builder
   - trigger_reclassification(document_id, new_type_id) — for staff-initiated reclassification
   - Replace the validate_upload_stub with a real validate_upload task:
     * Run OCR on the staged file via the OCRServiceInterface
     * publish_progress events for each stage via sse.publish_progress
     * Call the LLM validation prompt with the extracted text and the document type's required_fields and validation_rules
     * Determine outcome (HARD_REJECT / SOFT_WARNING / PASSED) based on the LLM verdict AND the OCR confidence floor from the document type config
     * Update the UploadAttempt with ocr_text, ocr_confidence, validation_status, validation_warnings
     * publish_complete with the outcome

4. Update wdms_documents/views.py:
   - In the /upload/{id}/confirm/ endpoint, after promoting to Document, call trigger_ai_pre_review(document.id) to kick off the async chain.
   - Add POST /api/v1/documents/{id}/reclassify/ — accepts new_type_id, updates the document's ai_classification, calls trigger_reclassification. Records the old AI output in a new WorkflowTransition with action='reclassify' and the ai_corrections field populated.
   - Add POST /api/v1/documents/{id}/correct-ai/ — accepts a dict of field_name to new_value. Updates the document's ai_extracted_fields with the overrides. Does NOT re-run extraction (that only happens on reclassify). Records the overrides in the next WorkflowTransition.ai_corrections field.

5. Add semantic search endpoint:
   - POST /api/v1/documents/search/ — accepts {query: str, type: 'keyword' | 'semantic' | 'auto'}
   - For keyword: use PostgreSQL full-text search on title + extracted_text via Django's SearchVector + SearchRank. Configure the search vector to use the 'simple' configuration rather than 'english' because the corpus mixes Swahili and English and the English-specific stemmer would mangle Swahili words.
   - For semantic: call services.embedding.embed(query), then use pgvector's cosine distance operator (<=>) to order documents by similarity. Top 20.
   - For auto: detect based on query structure — if it is a short phrase (less than 5 words with no natural sentence structure), use keyword; otherwise semantic. Expose the detection decision in the response so frontend can display "showing semantic results" or similar.
   - Enforce the same role-scoped visibility as the list endpoint.

6. Add a new signal receiver in wdms_notifications/dispatcher.py for the document_ai_review_complete signal — when AI pre-review completes, notify the staff of the warehouse that a new document is ready for review.

7. Update wdms_ai_pipeline/tasks.py to include proper error handling:
   - Each task has max_retries=3, default_retry_delay=60
   - On final failure after retries, mark the document with ai_confidence_score=None and ai_review_notes="AI pre-review failed — please proceed with manual review" so staff can still process the document manually. The document does NOT block in a broken state.
   - Log failures to the wdms_logger with full stack traces
   - Handle Vertex AI rate limit responses (HTTP 429) and quota errors with exponential backoff. Catch the specific exception google.api_core.exceptions.ResourceExhausted and raise self.retry(exc=e, countdown=calculated_backoff).
   - Handle Vision API quota errors the same way.

8. Add environment variable handling:
   - GOOGLE_APPLICATION_CREDENTIALS — path to the service account JSON file (used by both Vision and Vertex AI authentication)
   - GOOGLE_CLOUD_PROJECT — the GCP project ID
   - GOOGLE_CLOUD_LOCATION — the Vertex AI region, default 'us-central1' or 'europe-west4' depending on where the project is hosted
   - GEMINI_MODEL — default 'gemini-2.5-flash'
   - VERTEX_EMBEDDING_MODEL — default 'text-embedding-004'
   - USE_MOCK_AI_SERVICES — default 'false'
   Document all of these in the README, and add notes explaining how to set up a GCP service account with the required roles. The service account needs roles/aiplatform.user for Vertex AI and roles/cloudvision.user for Vision API.

9. Add a pgvector migration that:
   - Creates the vector extension if not present
   - Alters the Document.embedding field from VectorField(dimensions=1536) to VectorField(dimensions=768) since text-embedding-004 produces 768-dimensional vectors. Note that altering vector column dimensions in pgvector requires dropping and re-adding the column or doing a migration with a default empty value. Pick the cleaner approach.
   - Adds an IVFFlat index on the Document.embedding field for fast similarity search after the dimension change

10. Add a management command wdms_ai_pipeline/management/commands/reprocess_document.py that takes a document_id argument and re-runs the full AI pre-review chain. Useful for debugging and for reprocessing when prompts are improved.

11. Add a Python dependency declaration in requirements.txt:
    - google-cloud-vision (for Vision API)
    - google-cloud-aiplatform (for Vertex AI Gemini and embeddings)
    - Remove any references to groq or openai Python clients from earlier specs.

CONSTRAINTS AND STYLE:

- Every external API call goes through the service interfaces. Views and tasks never import Vertex AI or Vision directly — they go through the registry.
- Mock services exist and MUST produce realistic-shaped output so integration tests work without API keys. Mock embeddings are 768-dimensional vectors of small random floats, normalized.
- Prompts are in dedicated files, not inlined in task code. This makes them reviewable and editable without code changes.
- Never log full OCR text or full LLM responses to the standard logger — that content may contain PII. Log only metadata (document id, confidence, classification).
- Embedding storage uses pgvector's VectorField with dimensions=768. Similarity queries use the cosine distance operator via .order_by(CosineDistance('embedding', query_vector)).
- Use Vertex AI's structured output feature (response_schema) for every Gemini call that needs structured data. This is more reliable than parsing free-form JSON from text responses.
- For Gemini calls, set temperature to 0.1 for classification, extraction, and validation tasks because we want deterministic outputs. For review and ranking_explanation tasks, set temperature to 0.4 because some natural language variation is acceptable.

WHAT YOU SHOULD NOT DO IN THIS PHASE:

- Do not build the frontend.
- Do not implement the ranking report or regulatory endpoints.
- Do not add authentication to the /search/ endpoint differently from the list endpoint — it uses the same role scoping.
- Do not retain references to Groq or OpenAI providers anywhere in the code. The legacy specs are superseded.

SUCCESS CRITERIA:

1. A depositor uploads a real PDF inspection form. The SSE stream shows OCR processing, OCR done with a real character count and confidence, validation processing, validation done with a real verdict.
2. If required fields are missing from the PDF, the outcome is SOFT_WARNING with specific warnings listed. The depositor can override and submit anyway.
3. After confirmation, a staff member checks the document 30 seconds later and sees the AI pre-review fully populated — classification, extracted fields, summary, review notes, keywords, embedding.
4. The staff member changes the classification from 'application_form' to 'warehouse_receipt' via /reclassify/. The ai_extracted_fields repopulate with the new type's required fields after a few seconds.
5. The staff member edits the inspector_name field via /correct-ai/. The change is visible immediately. A WorkflowTransition records the correction.
6. POST /api/v1/documents/search/ with a semantic query returns documents ordered by semantic relevance.
7. With USE_MOCK_AI_SERVICES=true set, the full pipeline runs end-to-end without any API keys, using mock implementations. Mock embeddings are 768-dimensional.
8. If Vertex AI is unavailable, the document still gets created; ai_review_notes shows the fallback message, and staff can review manually.
9. A document with Swahili content (e.g. inspection findings written in Swahili) is correctly classified, fields are extracted including Swahili dates converted to ISO format, and the review summary is generated in Swahili.

WHERE TO START:

Read the docs. Then explain to me three things in your own words before writing code:

First, why the service registry plus interfaces plus mock and real provider pattern matters for this project specifically, given that we are integrating three external services and the project is graded on demonstration rather than production scale.

Second, how a Vertex AI rate limit failure (google.api_core.exceptions.ResourceExhausted) propagates from the API call inside a service provider through the LLM interface up to the Celery task, and how the retry mechanism prevents one rate-limited call from blocking the entire document processing pipeline.

Third, what specific change to the database schema is required because we switched from 1536-dimensional OpenAI embeddings to 768-dimensional Vertex embeddings, and what risks are involved in altering a vector column in pgvector when there may already be data in it.

Once you answer these three questions correctly, produce the service interfaces first, then the mock implementations, then the real providers. Test with USE_MOCK_AI_SERVICES=true before you ever hit a real API. Then wire the tasks. Commit after interfaces, after mocks, after providers, after tasks, after search. Five checkpoints.
---

## PROMPT 5 — Frontend Scaffold + Operational Shell (Phase 5, frontend half A)

**Recommended model:** GPT-5 / Codex (via Cursor or Codex CLI)
**Estimated session length:** 4–6 hours
**Prerequisite:** Phases 1–4 complete, backend API stable, seed_demo_documents run so there is real data to render against

```
You are building the frontend for an AI-enabled warehouse document management system. I have attached:

1. WAREHOUSE_DMS_FOUNDATION.md — the complete architectural specification (Part Sixteen is the frontend design system, read it carefully)
2. warehouse_dms_visual_reference.html — the live visual reference board. Open this in a browser while you code. Every design decision you need is already shown there.

The Django backend is complete and running at http://localhost:8000/api/v1/. The OpenAPI spec is at http://localhost:8000/api/docs. You are now building Phase 5: the React frontend scaffold and the operational shell used by STAFF, MANAGER, CEO, and ADMIN roles.

Read the foundation document in full, with particular attention to:
- Part Sixteen in its entirety (design tokens, component library, operational shell, HITL review screen)
- The visual reference HTML — every component you need to match is rendered there

SCOPE OF THIS PROMPT — Phase 5 only:

Build the foundation of the React app. Operational shell first. Login, role-routing, dashboard, document list, document detail. No HITL review screen yet (that is Phase 6). No depositor experience yet (Phase 6). No regulator experience yet (Phase 6).

1. Initialize a Vite project with React and TypeScript at `warehouse_dms_frontend/` in a sibling directory to the Django project. Use `pnpm create vite@latest warehouse_dms_frontend --template react-ts`.

2. Install and configure:
   - TailwindCSS with the design tokens from Part Sixteen wired into `tailwind.config.ts` as theme extensions. Every color, spacing value, font family, and border radius from the visual reference must be a named Tailwind utility. No magic hex values in components.
   - shadcn/ui — initialize it with `pnpm dlx shadcn@latest init`, configure components.json to install into `src/components/ui/`
   - TanStack Query for server state
   - React Router v6 for routing
   - react-i18next for internationalization (configure with en and sw locales, even though sw translations are empty)
   - zustand for small client state (auth token, user profile)
   - axios for HTTP with an interceptor that attaches the encrypted JWT token to every request
   - IBM Plex Sans, IBM Plex Serif, IBM Plex Mono from Google Fonts, loaded via the index.html head

3. Set up the design token foundation in `src/styles/tokens.css`:
   - Copy every CSS variable from the visual reference (brand, neutrals, semantic, shadows, radii, type scale)
   - These variables are the source of truth for Tailwind's config
   - Enable tabular figures globally: `html { font-feature-settings: 'tnum' on, 'lnum' on; }`

4. Build the shadcn/ui primitives tokenized to our palette:
   - Install Button, Badge, Input, Label, Select, Dialog, DropdownMenu, Table, Tabs, Card, Toast, Separator, Skeleton
   - Customize each one's default variants to match the visual reference:
     * Button variants: primary (brand teal), secondary (bordered), ghost, destructive (muted red outlined)
     * Badge variants: success, warning, error, info, neutral — with optional dot prefix
     * Input: warm border color, focus ring at rgba(15, 76, 92, 0.15)
     * Table: mono headers with uppercase tracking, tabular-nums body, hover state
   - Verify against the visual reference board. If a variant in shadcn's default doesn't match, override it.

5. Build custom components used throughout the operational shell:
   - `<StatusBadge status={DocumentStatus}>` — maps status enum to the right badge variant + label
   - `<ConfidenceBadge confidence={number}>` — maps 0..1 to HIGH/MED/LOW/NOT_DETECTED
   - `<MetricCard label value delta />` — used on dashboards
   - `<PageHeader title subtitle actions />` — used above every page
   - `<UserAvatar user size />` — initials circle in brand teal
   - `<EmptyState icon title description action />` — shown when a list has no results

6. Build the OperationalShell layout at `src/layouts/OperationalShell.tsx`:
   - 48px fixed top bar with logomark, global search placeholder (Cmd+K opens a real command palette built with cmdk library), notification bell, user menu
   - 240px fixed sidebar, collapsible to 60px icon-only
   - Scrollable main area with max-width 1400px and 32px horizontal padding
   - Sidebar navigation items filtered by the logged-in user's permissions (fetch from /auth/me endpoint, cache with TanStack Query)
   - Use React Router's `<Outlet />` for the routed page content
   Match the layout pixel-for-pixel to section 05 of the visual reference.

7. Build the authentication flow:
   - `/login` page with email/password form styled per the visual reference's Input component
   - After login, decrypt the access token (wait — we store it encrypted; configure axios to send it as `Authorization: Bearer {token}` verbatim since the backend handles decryption)
   - Fetch `/api/v1/accounts/get_my_profile` to get the user profile including role, tenant, warehouse, preferred_language
   - Store in zustand auth store
   - Redirect based on role: DEPOSITOR goes to /depositor (not built this phase — show a placeholder), STAFF/MANAGER/CEO/ADMIN go to /dashboard, REGULATOR goes to /regulator (placeholder this phase)
   - `/logout` clears the store and redirects to /login
   - Protect every route with a `<RequireAuth roles={string[]}>` wrapper

8. Build the operational dashboard at `/dashboard`:
   - Page header with greeting (Habari, {firstName} if preferred_language='sw', else Hello, {firstName})
   - Four metric cards: role-dependent
     * STAFF: Awaiting review, Processed today, Corrections sent, Avg review time
     * MANAGER: Pending approval, Approved this week, Rejected this week, Avg approval time
     * CEO: Same as manager plus tenant-wide aggregates
   - The work queue: the most pressing list for that role. STAFF sees their pending review list. MANAGER sees their pending approvals. CEO sees pending final approvals.
   - Below that, a recent activity feed showing the last 10 WorkflowTransitions in scope.
   - All data fetched via TanStack Query with proper loading skeletons and error states.

9. Build the document list page at `/documents`:
   - Table with columns: ID, Document, Type, Depositor, AI Confidence, Status, Submitted
   - Match exactly the table in section 05 of the visual reference
   - Filter bar above: by status, by document type, by warehouse (if CEO), date range, search input
   - Pagination using the backend's camelCase paginated response format (currentPageNumber, totalElements, etc.)
   - Clicking a row navigates to /documents/{id} (the detail view is Phase 6)
   - Handle empty state, loading state, error state

10. Build placeholder pages for /depositor, /regulator, /documents/{id}, /notifications, /settings — each showing a "coming in next phase" message. This lets navigation work without 404s.

11. Build a `<NotificationDropdown>` in the top bar:
    - Fetches unread notifications from /api/v1/notifications/?unread=true
    - Shows count badge if > 0
    - Opens a popover with last 10 notifications
    - Clicking a notification marks it read and navigates to the related document
    - "Mark all read" button at the bottom

12. Configure the development experience:
    - `.env.local` with VITE_API_URL=http://localhost:8000/api/v1
    - Proxy /api to the Django backend via vite.config.ts so cookies and same-origin behavior work in development
    - Add scripts: dev, build, lint, typecheck
    - Configure ESLint with @typescript-eslint and the Tailwind plugin
    - Configure Prettier to match the code style (2 space indent, single quotes, trailing comma es5)

CONSTRAINTS AND STYLE:

- NEVER use a color or spacing value that is not in the design tokens. If you find yourself writing `className="text-[#0F4C5C]"` something is wrong. Use `text-brand-teal`.
- NEVER use a font-family other than the IBM Plex trio. If a component needs a serif, it is rendering document content. Otherwise, it is sans.
- Motion: hover and focus transitions at 150ms ease-out only. No animations on page enter. No micro-interactions. Zero confetti, zero bouncing.
- Every interactive element must have a visible focus ring in brand teal (`focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2`).
- Use the visual reference as ground truth. If the reference shows a dot prefix on the status badge, your implementation has a dot prefix. If the reference shows monospace identifiers, yours are monospace.
- Use TanStack Query for ALL server data. No useEffect+fetch patterns.
- Every translatable string goes through `t('key.path')` from react-i18next, even before sw translations exist. Keys are namespaced: `dashboard.metrics.pending`, `documents.table.columns.status`.

WHAT YOU SHOULD NOT DO IN THIS PHASE:

- Do not build the HITL document review screen — that is the most complex screen and it gets its own phase.
- Do not build the depositor mobile experience — Phase 6.
- Do not build the regulator ranking dashboard — Phase 6.
- Do not implement SSE streaming for upload — Phase 6, when you build the depositor upload flow.
- Do not implement the search page with semantic results — Phase 6.
- Do not build complex form wizards — placeholder pages are enough this phase.

SUCCESS CRITERIA:

1. `pnpm install && pnpm dev` brings up Vite and the app loads at http://localhost:5173.
2. Logging in as admin/admin123 redirects to /dashboard with admin navigation visible.
3. The dashboard fetches and displays real metric data from the backend.
4. The document list renders the 20 seeded demo documents, sortable and filterable.
5. Clicking a row navigates to the placeholder detail page.
6. The notification dropdown shows any notifications for that user.
7. Logging out clears the session and returns to /login.
8. Switching preferred language (via the user menu) to Swahili changes the greeting to "Habari" and updates visible strings (even if most strings are still in English because translations are stubbed).
9. Side-by-side with the visual reference board, the dashboard and document list look IDENTICAL — same colors, same typography, same spacing, same badge styles.
10. Keyboard navigation works throughout: tab order is logical, focus rings visible, Cmd+K opens the command palette.
11. Lighthouse accessibility score >= 95.

WHERE TO START:

Open the visual reference board in your browser. Open the foundation doc. Match the IBM Plex fonts first in index.html, because getting typography right is the foundation of everything else. Then Tailwind tokens, then shadcn/ui primitives, then the shell, then auth, then dashboard, then list. Take a screenshot after the dashboard is done and compare it pixel-by-pixel to section 05 of the visual reference. If they don't match, fix yours before moving on.
```

---

## PROMPT 6 — Frontend Role Experiences + HITL Review (Phase 5, frontend half B)

**Recommended model:** GPT-5 / Codex (via Cursor or Codex CLI)
**Estimated session length:** 5–7 hours
**Prerequisite:** Phase 5 complete, operational shell live, backend AI pipeline live

```
You are completing the frontend for an AI-enabled warehouse document management system. I have attached:

1. WAREHOUSE_DMS_FOUNDATION.md — the complete architectural specification
2. warehouse_dms_visual_reference.html — the visual design reference

Phase 5 is complete — auth, operational shell, dashboard, document list. Now Phase 6 adds the three critical screens that make the system actually useful: the HITL document review, the depositor mobile experience with SSE upload, and the regulator ranking dashboard.

Read the foundation document again, particularly Part Sixteen sections on "The Document Review Screen", "The Depositor Experience", and "The Regulator Experience". Every detail in those sections matters.

SCOPE OF THIS PROMPT — Phase 6 only:

Three major screens plus the search experience. All still within the frontend project started in Phase 5.

1. HITL Document Review Screen at `/documents/{id}`:

   Build the 60/40 split layout from section 06 of the visual reference.

   Left side — the document viewer:
   - Install `react-pdf` (wraps pdf.js) for PDF rendering
   - For image files, use a simple `<img>` inside a zoomable container (use `react-zoom-pan-pinch` or similar)
   - Toolbar at top with zoom out, zoom level, zoom in, fit width
   - Page thumbnails in a narrow strip at the bottom for multi-page PDFs
   - Background tone matches visual reference (#F2F0EA)

   Right side — the AI review panel:
   - Header with document title, type badge, status badge, uploader name, upload timestamp
   - AI Summary section: the summary text in a left-bordered panel, with the overall confidence badge
   - Extracted fields section: each field as an editable `<Input>` with:
     * Label
     * ConfidenceBadge (from Phase 5)
     * The value, pre-filled from ai_extracted_fields
     * If the user edits a field, call /api/v1/documents/{id}/correct-ai/ on blur to persist, and show the terracotta dot indicator per the visual reference
   - Type selector at the top of extracted fields: a `<Select>` showing the classified type; changing it calls /api/v1/documents/{id}/reclassify/ and shows a loading state while extraction re-runs
   - History section: vertical `<Timeline>` component (build this) showing every WorkflowTransition
   - Action bar at the bottom, sticky, with role-appropriate buttons:
     * STAFF: Confirm, Send Back
     * MANAGER: Approve, Reject, Send Back
     * CEO: Final Approve, Reject, Send Back
   - Each button opens a Dialog for confirmation (reason required for Send Back, Reject; optional for positive actions)
   - After action succeeds, show a toast and navigate back to the list

   Subscribe to reclassification progress via a small SSE connection to /api/v1/documents/{id}/reclassify-status/ (if the backend provides one — if not, use polling every 2 seconds for up to 60 seconds, then show "reclassification taking longer than expected" with a manual refresh button).

2. Depositor Mobile Experience under `/depositor/*`:

   A completely different layout than the operational shell. Build `src/layouts/DepositorShell.tsx`:
   - No sidebar
   - Simplified top bar: logomark, notification bell, user menu
   - Centered content column, max-width 520px on desktop, full width on mobile
   - Generous padding (space-6 / space-8)
   - Uses the same design tokens but different composition

   Pages:
   - `/depositor` — home. Greeting, prominent upload CTA card (matches visual reference section 08 left), stack of last 5 documents as DocumentCards.
   - `/depositor/upload` — the multi-step upload flow:
     * Step 1: Select document type. Cards for each available type with icon + label + description.
     * Step 2: Select warehouse. If depositor has one linked, auto-select and skip. Otherwise show nearby warehouses (use browser geolocation + haversine distance calculation against /api/v1/tenants/warehouses/?nearby=true).
     * Step 3: Upload file. Dropzone + tap-to-pick. Shows the filename once picked. Button "Start validation".
     * Step 4: SSE progress. Uses EventSource to connect to /api/v1/documents/upload/{attempt_id}/stream/. Renders the stage-by-stage UI from section 07 of the visual reference. Stages light up as events arrive.
     * Step 5: Outcome:
       - If PASSED: show success, offer to continue or upload another
       - If SOFT_WARNING: list the warnings clearly, offer two buttons: "Fix and re-upload" (goes back to step 3) or "Submit anyway with these warnings" (calls /confirm/ with soft_warning_override=true)
       - If HARD_REJECT: show the reason, offer "Try again" button
   - `/depositor/documents/{id}` — mobile-friendly document detail. Shows status prominently, vertical timeline, if status=CORRECTION_NEEDED show the correction_note in a prominent card with a "Re-upload corrected version" button.
   - `/depositor/downloads` — list of approved documents with download buttons.

3. Regulator Ranking Dashboard under `/regulator/*`:

   Build `src/layouts/RegulatorShell.tsx` — same structure as OperationalShell but the sidebar has regulator-specific items: Dashboard, Warehouse Rankings, Approved Documents, Inspection Reports, Analytics, Notifications.

   Pages:
   - `/regulator` — the landing dashboard:
     * Four metric cards at top: warehouses in jurisdiction, high-risk warehouses, avg compliance score, inspections this quarter
     * Warehouse rankings section: match section 08 right of the visual reference exactly. Sortable list with position, warehouse name, region, score bar, score value, sparkline (use recharts for sparklines, pulling 6-month history from /api/v1/reports/warehouses/{id}/ranking/history/), risk badge
     * "Recompute" button at the top right of the rankings section that calls POST /api/v1/reports/warehouses/{id}/ranking/recompute/ for all visible warehouses (rate-limited on backend). Show spinner during recompute.
     * Below rankings: a line chart showing aggregate compliance trends across the jurisdiction over the last 12 months.
   - `/regulator/warehouses/{id}` — warehouse detail:
     * Metric cards specific to that warehouse: current score, risk category, last inspection date, documents count
     * Full rule-based component breakdown (each contributing factor with its weight and contribution to the score)
     * AI explanation of the ranking in a highlighted card
     * Recent documents list
     * Inspection reports list

4. Search Experience at `/search`:

   Accessible from the top bar's Cmd+K command palette AND from the sidebar "Search" item.

   - Large search input at the top with keyword/semantic/auto toggle (default: auto)
   - As the user types, debounce 300ms then call /api/v1/documents/search/
   - Results list with highlighted matches for keyword searches, or a relevance bar for semantic searches
   - Each result is clickable and navigates to the document detail
   - Backend returns the detection decision (keyword vs semantic); show a small banner "Showing semantic results — your query looked like natural language"
   - Keyboard navigation: arrow keys to move through results, Enter to open

5. Notification Preferences Page at `/settings/notifications`:
   - Reachable from user menu → Settings
   - Table of event types × channels (dashboard, email, sms) with toggles
   - Warning next to SMS: "SMS charges may apply based on your region"
   - Save button at the bottom that PUTs to /api/v1/notifications/preferences/

6. Polish:
   - Add loading skeletons to every data-fetching view
   - Add error boundaries with friendly messages
   - Add empty states with illustrations (simple SVG line drawings in brand teal, consistent style)
   - Add a toast system using shadcn's Toast component, triggered from:
     * Successful transitions
     * Failed API calls
     * Connection lost during SSE
   - Add a global connection status indicator that shows when the API is unreachable

CONSTRAINTS AND STYLE:

- The HITL review screen is the most important screen in the system. Get it RIGHT. Match the visual reference pixel by pixel. If a terracotta dot appears on edited fields, it appears in your implementation. If the action bar is sticky, yours is sticky.
- The depositor experience must feel like M-Pesa, not like a web app. One primary action at a time. Generous tap targets (minimum 44px). No dense tables.
- Every screen must work on mobile (375px minimum width). Operational screens can get visually cramped on mobile — that's acceptable because staff use desktops, but critical actions must still be tappable.
- Keep SSE reconnection logic robust: if the connection drops mid-validation, retry with exponential backoff, show a "reconnecting" indicator, give up after 30 seconds with a clear error message.
- Internationalization: every new string in this phase goes through t() as well. Add the keys even if sw translations are empty.

WHAT YOU SHOULD NOT DO IN THIS PHASE:

- Do not build the admin-specific screens for managing users, warehouses, document types — those are a follow-up phase.
- Do not implement a PWA / offline mode — future work.
- Do not wire up Google Analytics, Sentry, or any third-party SDK — security review required first.

SUCCESS CRITERIA:

1. As a staff user, I open a document from the list. The left side renders the PDF with working zoom. The right side shows the AI review with real extracted fields.
2. I edit a field. On blur, the backend is called; the field gets a terracotta dot. I reload the page — the dot persists because the override is stored.
3. I change the classification via the type selector. A loading state appears in the extracted fields section. After the Celery chain finishes (30-60 seconds), the fields update with the new type's schema.
4. I click Confirm. A dialog opens. I confirm. The document transitions, a toast appears, I return to the list.
5. As a depositor on a phone, I log in and land on a home screen with a big upload button. I tap it and go through the flow. The SSE stream works end-to-end — I see OCR processing, validation processing, final outcome.
6. I upload a document missing a required field. SOFT_WARNING. I see the specific warnings. I choose to submit anyway.
7. As a regulator, I log in and see the ranking dashboard with sparklines. I click a warehouse and drill into its detail page.
8. I search "inspection Dodoma April" from Cmd+K. Results appear. The backend decided to use semantic search and said so.
9. Every screen passes a manual check against the visual reference.
10. The app works at 375px width (iPhone SE dimensions) without any horizontal scrolling anywhere.

WHERE TO START:

The HITL review screen is the hardest. Start there, because if you get it right, everything else is easier. Build the layout first, then the document viewer, then the AI panel, then the action bar, then wire up the API calls. Test with a staff user and a real PDF document seeded by the backend. Only after HITL is verified against the visual reference should you move to the depositor shell. Regulator last. Commit after each screen.
```

---

## Appendix: General rules that apply to every prompt above

These are rules you can mention to any model at any time.

**The foundation document is law.** Any behavior that contradicts the foundation document is a bug, regardless of how reasonable it looks. If a decision is ambiguous, ask. If it is not in the foundation document, propose it and wait for me to confirm before coding.

**The visual reference is ground truth for visual details.** Do not invent colors, fonts, or spacing values. Every pixel you place has a named token behind it.

**Commit granularly.** One commit per logical unit — one per model, one per view group, one per component. Never a single giant commit.

**Test as you go.** Before marking a phase complete, walk through the success criteria manually. Do not hand me a phase where the success criteria fail silently.

**Ask before architectural drift.** If mid-phase you realize the foundation document has a gap or mistake, stop and ask. Do not silently "improve" the architecture — that is how codebases rot.

**Match my existing code style.** The secured_SRS project establishes patterns: how errors are logged, how response objects are constructed, how permissions are checked. Match those patterns, even when a different pattern might feel cleaner to you. Consistency across the codebase has more value than local elegance.

---

## When to deviate from these prompts

These prompts are starting points. If during Phase 2 you discover that a design from Phase 1 needs revision, stop and revise Phase 1 before continuing. Do not paper over issues. The prompts assume the previous phases are solid — if they aren't, the later prompts will amplify the problems.

If you get more than halfway through a prompt and feel the model has drifted significantly from the spec, abandon the session and start a fresh one with the same prompt. Drift is usually irrecoverable; a fresh context is cheaper than debugging a tangled session.

---

*Last updated: 2026-04-23*
*Companion documents: WAREHOUSE_DMS_FOUNDATION.md, warehouse_dms_visual_reference.html*
