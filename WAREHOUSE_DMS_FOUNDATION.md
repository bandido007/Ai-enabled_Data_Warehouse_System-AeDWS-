# AI-Enabled Warehouse Document Management System
## Foundation Architecture Document

**Version:** 1.0
**Status:** Living Document — Update as Decisions Evolve
**Audience:** Human developers and AI coding assistants (Copilot, Codex, Claude Opus)

---

## How to Use This Document

This document is the source of truth for the warehouse document management system. Every architectural decision, every data model, every pipeline stage, and every convention used in the project is described here. When you or an AI coding assistant sit down to write code, this document tells you what to build and how it fits into the larger whole.

The document is written in full prose rather than bullet points because the reasoning behind each decision matters as much as the decision itself. When an AI assistant reads this file, the reasoning helps it generate code that is consistent with the spirit of the system, not just the letter. When a new developer joins the project, the reasoning helps them understand why things are the way they are and when it is safe to deviate.

The document follows the architectural patterns established in the `secured_SRS` project, which means the same `BaseModel`, the same `ResponseObject`, the same Django Ninja router style, the same service layer with interfaces and mocks, the same camelCase API aliasing, and the same separation of authentication from authorization. Anywhere you see a pattern being introduced, you can look at `secured_SRS` for a working reference implementation of the same idea applied to a different domain.

---

## Part One: Philosophy and Guiding Principles

### The Core Principle

The system is built on one overriding principle that every design decision must respect: **workflow is the backbone, artificial intelligence is the intelligence layer, and humans remain responsible for verification and approval**. Workflow controls the official process, meaning who submits what and when, and who approves what and when. Artificial intelligence supports speed, quality, search, analysis, and decision support, meaning it reads documents, classifies them, extracts fields, scores them, and recommends actions. Humans look at what the artificial intelligence has produced and confirm, correct, approve, or reject, meaning they remain the legal and procedural authority for every official act.

This principle matters because it resolves almost every ambiguous design question that will come up during the build. When someone asks whether the artificial intelligence should be allowed to approve a document automatically, the answer is no, because approval is workflow and humans own it. When someone asks whether the system should let a document skip staff review because the artificial intelligence is highly confident, the answer is no, because review is workflow and humans own it. When someone asks whether the artificial intelligence should rewrite a classification after staff corrects it, the answer is yes, because classification and extraction are intelligence support and the artificial intelligence owns them, subject to human override.

### The Seven Locked Decisions

Seven decisions shape the entire architecture of this system, and they are locked in. Any code written for this project must respect these decisions. If a future conversation wants to revisit one of them, that conversation must explicitly open the question and update this document before changing code.

The first decision concerns the pre-submission validation gate, which is the point where a depositor uploads a document and the system must decide whether to accept it into the workflow. The gate has three outcomes rather than two. A hard reject means the document is corrupted, the format is wrong, or the optical character recognition produced nothing usable, and no database record is created at all. A soft warning means the document is mostly fine but has one or two fields that the artificial intelligence could not read confidently, and the depositor is shown the warnings and can either fix the upload or override the warning and submit anyway, in which case the document enters the system flagged for extra staff attention. A pass means the document is clean and enters the normal workflow. This three-outcome design respects the reality that real government documents are messy while still protecting the workflow from entirely broken submissions.

The second decision concerns how documents flow backward when a higher role rejects them or requests correction. The flow is fully configurable, meaning any role can send a document back to any previous role. If a chief executive officer spots an obvious error that should have been caught by the depositor, the chief executive officer can send the document straight back to the depositor without bouncing it through the manager and the staff first. This respects how real bureaucratic chains actually operate, where a superior can always override and redirect a subordinate's work.

The third decision concerns notifications. Each user chooses their own notification channels rather than having the system impose a default pattern. The dashboard channel is always on because it is cheap and everyone expects it. The email channel and the short message service channel are opt-in per user. This sidesteps the problem of short message service costs and also gives users agency over how much noise the system generates in their lives.

The fourth decision concerns what happens when staff correct the artificial intelligence's classification of a document. When staff correct the classification, the artificial intelligence re-runs its extraction with the new type's required fields, rather than asking the staff to manually type every field for the new type. This keeps staff in a reviewing posture rather than forcing them into a data-entry posture. The reclassification itself is logged as a signal that the artificial intelligence made an error, which over time becomes a valuable dataset about where the system needs improvement.

The fifth decision concerns the regulatory scope. Regulators are users of the system, not external integrators, because the client has confirmed that regulatory staff will log in directly. Regulators are scoped by jurisdiction, meaning each regulator has either a regional jurisdiction or a national jurisdiction. A regional regulator sees only warehouses within their region. A national regulator sees all warehouses. This mirrors the real structure of Tanzanian regulatory authority and gives the model enough flexibility to represent both regional and national regulators without overengineering.

The sixth decision concerns how warehouse ranking reports are generated. Ranking is a nightly batch job driven by Celery Beat that computes rule-based scores and then invokes a large language model to generate human-readable explanations of those scores. The results are cached in a `WarehouseRanking` table. Regulators see the cached result instantly when they open the dashboard, and they have a button to trigger an on-demand recomputation if they want fresher data. The on-demand button is rate-limited to once per hour per regulator to prevent abuse. This balances cost, freshness, and user experience.

The seventh decision concerns the finite state machine that drives the document approval workflow. The machine is configurable rather than hard-coded, meaning each document type in the system defines its own set of allowed transitions rather than every document following the same depositor-to-staff-to-manager-to-chief-executive-officer chain. This matters because several document types do not follow that chain at all. The warehouse inspection form is uploaded by staff after a physical inspection, so it starts at the staff state. The compliance certificate originates from the regulator and flows to the warehouse, so it starts at the regulator state. A hard-coded machine would force us to write separate workflow code for each type, and every new type the client adds would require more code. A configurable machine reads the document type definition, finds the transitions allowed from the current state, and exposes them to the user interface, which then renders the appropriate buttons based on what the configuration says is possible.

### The Human-in-the-Loop Review Pattern

Because artificial intelligence performs pre-review before staff touches the document, the staff interface must present both the original document and the artificial intelligence's review side by side. This is not a minor user interface decision; it is a core architectural requirement that shapes the frontend and the serializer design. When staff open a document for review, the screen is split. On the left, the actual uploaded file renders in a viewer, whether that is a portable document format viewer or an image viewer with zoom and pan. On the right, the artificial intelligence's structured review appears as editable fields, including the classification, the extracted fields, the confidence score, and the notes. Every field that the artificial intelligence populated is editable by the staff. When the staff edits a field, the edit is logged as a data point indicating where the artificial intelligence was wrong. When the staff confirms the document, it moves to the next state in the workflow. When the staff requests correction, it moves backward to whichever previous role the staff chooses.

This pattern carries over to the manager and the chief executive officer interfaces, except that those users also see the staff's edits and notes in addition to the artificial intelligence's original review. The intelligence layer accumulates at each stage rather than being replaced, so the chief executive officer sees the full trail of what the artificial intelligence said, what the staff did, what the manager did, and only then makes the final decision.

---

## Part Two: Architecture Overview

### The Three Layers

The system is organized into three architectural layers that correspond to the classic presentation, business logic, and data concerns, but with specific names and responsibilities that match the way artificial intelligence and workflow intersect in this system.

The first layer is the frontend user interface layer, implemented in React. This layer is a single-page application that presents different dashboards to different roles, subscribes to server-sent events for real-time feedback during document upload, and communicates with the backend through a representational state transfer application programming interface. This layer knows nothing about how documents are classified, how workflow transitions are enforced, or how notifications are dispatched. It knows only what the user sees and how the user interacts.

The second layer is the backend workflow and orchestration layer, implemented in Django with Django Ninja for the application programming interface surface. This layer owns the document finite state machine, the tenant isolation rules, the role-based access control, the notification dispatch logic, and the report generation logic. It also orchestrates the artificial intelligence pipeline by enqueuing Celery tasks when workflow events fire, and it exposes server-sent event streams for the frontend to subscribe to during pre-submission validation.

The third layer is the artificial intelligence processing layer, implemented as Celery workers that consume tasks from a Redis broker. This layer runs the actual calls to Google Vision for optical character recognition, Groq for large language model tasks, and OpenAI for embedding generation. It is designed so that any of those external services can be swapped out, stubbed with a mock, or replaced with a different provider without changing the backend workflow layer. The interfaces and mock pattern established in `secured_SRS` carries over directly.

### The Data Store Picture

PostgreSQL is the primary database, storing all workflow state, all document metadata, all user data, all tenant and warehouse data, all notification preferences, all audit trails, and all ranking reports. The pgvector extension is enabled on the same PostgreSQL instance, storing embedding vectors for semantic search. This avoids the operational complexity of running a separate vector database and keeps all the system's state in one place where transactions and backups cover everything consistently. Redis is used for two separate purposes. It is the Celery message broker, carrying tasks from the backend to the workers and results back. It is also the server-sent event fan-out mechanism, allowing a backend worker to publish an event on a Redis channel and have the Django server push it to all subscribed clients. The document files themselves are stored in the file system during local development and in Google Cloud Storage when the system is deployed to the cloud. Django's storage abstraction, combined with the `django-storages` library, means this swap happens through configuration alone.

### The High-Level Flow

When a depositor uploads a document, the request hits the backend with the file and the document type. The backend saves the file to a staging location and creates a lightweight `UploadAttempt` record, not a `Document` record yet. The backend then enqueues a Celery task to perform pre-submission validation. The backend immediately returns a task identifier to the frontend, which subscribes to a server-sent event stream for that task identifier. The Celery worker runs optical character recognition on the file, checks the extracted text against the document type's required fields, and publishes progress events to the Redis channel for that task identifier. The Django server pushes those events to the frontend over the server-sent event stream. At the end, the worker publishes a final event indicating hard reject, soft warning, or pass. If hard reject, the frontend shows the error and the staging file is eventually cleaned up. If soft warning, the frontend shows the warnings and gives the depositor the choice to fix or override. If pass or override, the frontend calls a confirm endpoint that promotes the `UploadAttempt` to a real `Document` with status `PENDING_STAFF` and enqueues the artificial intelligence pre-review chain.

The pre-review chain is a Celery chain that runs classification, field extraction, scoring, review generation, and embedding generation in sequence, each step reading the output of the previous step. When the chain completes, the `Document` record has all its artificial intelligence fields populated and the document appears in the staff dashboard for review. From that point onward, the workflow is driven by human actions, with each transition firing a signal that dispatches notifications according to each recipient's preferences.

---

## Part Three: Technology Stack and Tooling

The backend is Django version five with Django Ninja as the application programming interface framework. Django Ninja is chosen over Django Rest Framework because the `secured_SRS` project already uses Django Ninja, because it has better type annotations through Pydantic-style schemas, because it generates an OpenAPI specification automatically, and because its router and schema patterns are cleaner for this style of application. Django Rest Framework is still present in the installed applications list because `rest_framework_simplejwt` is used for token generation, exactly as in `secured_SRS`.

The database is PostgreSQL version sixteen or later, with the `pgvector` extension enabled for semantic search. The asynchronous task queue is Celery with Redis as both the broker and the result backend. The same Redis instance also backs the server-sent event fan-out mechanism. The frontend is React, built with Vite, using TailwindCSS for styling, React Router for navigation, and TanStack Query for server state management. Authentication is JSON Web Tokens via `rest_framework_simplejwt`, with the same AES encryption wrapper used in `secured_SRS`.

The external artificial intelligence services are Google Vision for optical character recognition, Groq for large language model tasks such as classification, field extraction, scoring, review generation, and ranking explanation, and OpenAI for embedding generation. Each of these is wrapped behind an interface in the service layer, with a mock implementation available for local development and testing without incurring API costs. Email notifications are sent through Simple Mail Transfer Protocol or SendGrid. Short message service notifications are sent through Africa's Talking, the same provider used in the `ChapChap` project.

The deployment path starts with Docker Compose on a local machine or on-premise government server and moves to Google Cloud Platform when the system is ready for production. On Google Cloud Platform, Django runs on Cloud Run, the database runs on Cloud Structured Query Language with pgvector enabled, Redis runs on Cloud Memorystore, Celery workers run as Cloud Run Jobs or Compute Engine virtual machines, and file storage is Google Cloud Storage. The `django-storages` library handles the swap from local file system to Google Cloud Storage through configuration alone.

---

## Part Four: Project Structure

The project follows the same naming and structural conventions as `secured_SRS`. The main project directory is `warehouse_dms`, and each application is prefixed with `wdms_`. The applications are organized by responsibility, with `wdms_uaa` handling user authentication and authorization, `wdms_accounts` handling user profiles and registration, `wdms_tenants` handling the multi-tenant warehouse structure, `wdms_documents` handling document models and the finite state machine, `wdms_ai_pipeline` handling the Celery tasks that perform artificial intelligence work, `wdms_notifications` handling the notification dispatch and user preferences, `wdms_reports` handling report generation and warehouse ranking, `wdms_regulatory` handling regulator-specific endpoints and jurisdiction filtering, and `wdms_utils` carrying the shared utilities including `BaseModel`, `ResponseObject`, `get_paginated_and_non_paginated_data`, and the permission seeder.

The full project tree looks like this:

```
warehouse_dms/
├── warehouse_dms/              # Main project
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   ├── wsgi.py
│   ├── celery.py               # Celery app instance
│   └── wdms_api_v1.py          # Ninja API aggregator
│
├── wdms_uaa/                   # User Authentication & Authorization
│   ├── models.py               # UserRoles, UserPermissions, LoginAttempt
│   ├── views.py                # Login, role management
│   ├── serializers.py
│   ├── authentication/
│   │   ├── services.py         # AuthenticationService
│   │   ├── user_management.py  # UserManagementService
│   │   └── middleware.py
│   └── authorization/
│       ├── services.py         # AuthorizationService
│       └── auth_permission.py  # PermissionAuth
│
├── wdms_accounts/              # User Profiles
│   ├── models.py               # UserProfile, ActivateAccountToken, ForgotPassword
│   ├── views.py
│   └── serializers.py
│
├── wdms_tenants/               # Multi-tenant warehouse structure
│   ├── models.py               # Tenant, Warehouse, Region
│   ├── views.py
│   ├── serializers.py
│   └── querysets.py            # TenantScopedQuerySet
│
├── wdms_documents/             # Core document system
│   ├── models.py               # Document, UploadAttempt, WorkflowTransition
│   ├── views.py                # Upload, review, transition endpoints
│   ├── serializers.py
│   ├── fsm/
│   │   ├── engine.py           # Configurable FSM engine
│   │   ├── types.py            # Document type config loader
│   │   └── transitions.py      # Transition validation
│   ├── signals.py              # Transition signal handlers
│   └── config/
│       └── document_types.json # THE central config file
│
├── wdms_ai_pipeline/           # Celery tasks for AI work
│   ├── tasks.py                # Celery task definitions
│   ├── services/
│   │   ├── interfaces/         # OCR, LLM, Embedding interfaces
│   │   ├── mocks/              # Mock implementations
│   │   └── providers/          # Real implementations (Vision, Groq, OpenAI)
│   ├── prompts/                # LLM prompt templates
│   └── sse.py                  # SSE publishing helpers
│
├── wdms_notifications/         # Notification system
│   ├── models.py               # NotificationEvent, NotificationPreference
│   ├── views.py
│   ├── serializers.py
│   ├── dispatcher.py           # Notification dispatch logic
│   └── channels/
│       ├── email.py
│       ├── sms.py              # Africa's Talking
│       └── dashboard.py
│
├── wdms_reports/               # Reports & ranking
│   ├── models.py               # Report, WarehouseRanking
│   ├── views.py
│   ├── serializers.py
│   ├── services.py             # Report generation
│   └── ranking.py              # Rule-based + AI ranking logic
│
├── wdms_regulatory/            # Regulator endpoints
│   ├── models.py               # RegulatorJurisdiction
│   ├── views.py
│   ├── serializers.py
│   └── querysets.py            # Jurisdiction-scoped querysets
│
└── wdms_utils/                 # Shared utilities
    ├── BaseModel.py            # Identical to secured_SRS
    ├── SharedSerializer.py     # BaseSerializer, response envelopes
    ├── response.py             # ResponseObject, pagination
    ├── permissions.py          # Permission definitions
    ├── CreateUserAddSeedPermissions.py  # Seed roles & permissions
    ├── email.py
    ├── encryption.py
    └── tokens.py
```

The frontend lives in a sibling `warehouse_dms_frontend` directory and is completely separate from the Django project. The two communicate only through the application programming interface.

---

## Part Five: Multi-Tenancy Model

### The Tenant Hierarchy

The tenant model has three levels. The `Tenant` represents an institution or organization that owns one or more warehouses, such as a warehouse holding company or a government agency. The `Region` represents a geographical grouping, typically corresponding to administrative regions of Tanzania such as Dar es Salaam, Dodoma, or Arusha. The `Warehouse` represents a single physical warehouse facility. Every user belongs to a tenant, and most users also belong to a specific warehouse within that tenant. Regulators are the exception; they belong to a special regulatory tenant and have a jurisdiction that is either a region or the national value.

This hierarchy gives the system flexibility to represent different client configurations without requiring code changes. A large warehouse operator with facilities across multiple regions becomes one tenant with multiple warehouses spread across regions. A standalone warehouse becomes one tenant with one warehouse. A regulatory body becomes one tenant with regulators distributed across regions or set to national jurisdiction.

### The Tenant Scoping Pattern

Every model that belongs to a tenant must have a direct or indirect foreign key to `Tenant`, and every query against that model must filter by the current user's tenant. There are two ways to enforce this. The first way is to require every view to write the filter explicitly, which is error-prone because one forgotten filter exposes cross-tenant data. The second way is to use a mixin on the router or view function that automatically applies the filter. The second way is the one we adopt.

The pattern is implemented in `wdms_tenants/querysets.py` as a `TenantScopedQuerySet` and a helper function `get_tenant_queryset(model, request)` that returns a queryset filtered by the current user's tenant. Every router in `wdms_documents`, `wdms_reports`, and similar tenant-bound applications uses this helper rather than calling `Model.objects.filter(...)` directly. Regulators bypass this helper and use a different helper `get_regulator_queryset(model, request)` that applies jurisdiction-based filtering instead of tenant-based filtering.

### The Tenant Model Definition

The `Tenant` model carries the organization name, a slug for uniqueness, contact information, and an optional configuration blob. The `Region` model carries the region name, a slug, and geographical coordinates if needed for the nearby warehouses feature. The `Warehouse` model carries the warehouse name, a unique code, the tenant it belongs to, the region it is in, its physical location as a latitude and longitude pair for the nearby warehouses feature, and contact information.

```python
# wdms_tenants/models.py

from django.db import models
from wdms_utils.BaseModel import BaseModel


class Tenant(BaseModel):
    name = models.CharField(max_length=500)
    slug = models.SlugField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=50, blank=True)
    is_regulatory = models.BooleanField(
        default=False,
        help_text="True if this tenant is a regulatory body, not a warehouse operator",
    )

    class Meta:
        db_table = "tenants"
        ordering = ["-primary_key"]
        verbose_name_plural = "TENANTS"

    def __str__(self):
        return self.name


class Region(BaseModel):
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=100, unique=True)
    country_code = models.CharField(max_length=5, default="TZ")

    class Meta:
        db_table = "regions"
        ordering = ["name"]
        verbose_name_plural = "REGIONS"

    def __str__(self):
        return self.name


class Warehouse(BaseModel):
    tenant = models.ForeignKey(
        Tenant, related_name="warehouses", on_delete=models.CASCADE
    )
    region = models.ForeignKey(
        Region, related_name="warehouses", on_delete=models.PROTECT
    )
    name = models.CharField(max_length=500)
    code = models.CharField(max_length=50, unique=True)
    address = models.TextField(blank=True)
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    contact_phone = models.CharField(max_length=50, blank=True)

    class Meta:
        db_table = "warehouses"
        ordering = ["name"]
        verbose_name_plural = "WAREHOUSES"
        indexes = [
            models.Index(fields=["tenant", "region"]),
            models.Index(fields=["code"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"
```

### The User-Tenant-Warehouse Linkage

The `UserProfile` model in `wdms_accounts` is extended compared to the `secured_SRS` equivalent. Where `secured_SRS` carries only a one-to-one link to the Django `User` model and an account type, the warehouse system's profile additionally carries a foreign key to `Tenant`, an optional foreign key to `Warehouse`, and for regulators an optional foreign key to `Region` representing their jurisdiction. Non-regulators have a null jurisdiction. The account type choices expand to include `DEPOSITOR`, `STAFF`, `MANAGER`, `CEO`, `REGULATOR`, and `ADMIN`.

---

## Part Six: Role Model and Role-Based Access Control

The role-based access control system follows the same structure as `secured_SRS`, with `UserRoles`, `UserPermissions`, `UserPermissionsGroup`, `UserRolesWithPermissions`, and `UsersWithRoles` models living in `wdms_uaa`. The permission codes and role-permission mappings are defined in `wdms_utils/permissions.py` and seeded on application startup by the `CreateRolesAddPermissions` class, again identical in structure to the `secured_SRS` pattern.

The roles in the system are `ADMIN`, `DEPOSITOR`, `STAFF`, `MANAGER`, `CEO`, and `REGULATOR`. The administrator has every permission. The depositor can submit documents, view their own documents, and download their own approved documents. The staff can view documents pending their review, edit document metadata, add notes, confirm documents, and send documents back to depositors for correction. The manager can view documents pending their approval, approve documents, reject documents, and send documents back to any previous role. The chief executive officer can view documents pending final approval, grant final approval, reject documents, and send documents back to any previous role. The regulator can view approved documents within their jurisdiction, view ranking reports, view inspection reports, and trigger on-demand ranking recomputations.

The permission codes are grouped by functional area. The document lifecycle group has codes like `upload_document`, `confirm_document`, `approve_document_manager`, `approve_document_ceo`, and `send_document_back`. The document access group has codes like `view_own_documents`, `view_warehouse_documents`, `view_tenant_documents`, and `view_jurisdiction_documents`. The reporting group has codes like `generate_report`, `view_warehouse_ranking`, and `trigger_ranking_recompute`. The administration group has codes like `manage_users`, `manage_tenants`, `manage_warehouses`, `manage_document_types`, and `view_audit_trail`. The regulator group has codes like `view_regulator_dashboard` and `access_regulatory_api`.

---

## Part Seven: Document Type Configuration

### Why This Configuration Is Central

The document type configuration is the single most important piece of configuration in the entire system. It drives the pre-submission validation, the classification prompts, the extraction prompts, the finite state machine transitions, the validation rules, and the user interface field rendering. Every Celery task that touches a document reads this configuration to know what to do. Every user interface that shows document metadata reads this configuration to know what fields to show. Every workflow transition reads this configuration to know what transitions are allowed.

The configuration is stored as a JSON file at `wdms_documents/config/document_types.json` during early development and later moved to database-backed storage in a `DocumentTypeDefinition` model so that administrators can manage document types through an interface without redeploying code. The file-based approach is used first because it makes the system easier to bootstrap and test, and because Copilot and Codex work better when they can read a static reference file.

### The Configuration Schema

Each document type in the configuration has the following fields. The `id` is a short machine identifier like `application_form` or `inspection_form`. The `label` is the human-readable name. The `category` is one of `FORM`, `RECEIPT`, `CERTIFICATE`, or `REPORT`. The `initial_state` is the finite state machine state the document enters when first created, which is usually `PENDING_STAFF` for depositor-initiated documents but can be `PENDING_MANAGER` for staff-initiated documents like inspection forms. The `allowed_transitions` is a list of transition objects, each specifying a `from_state`, a `to_state`, the `required_role` that can trigger the transition, and an optional `reason_required` flag indicating whether the transition needs a textual reason. The `required_fields` is a list of field names that must be present for pre-submission validation to pass. The `optional_fields` is a list of field names the artificial intelligence should try to extract but whose absence is not a hard reject. The `file_formats` is a list of accepted file extensions. The `validation_rules` is an object with keys like `min_ocr_confidence`, `require_signature`, `require_stamp`, and `require_date`. The `classification_hints` is a list of keyword phrases that help the large language model distinguish this document type from others. The `allowed_uploader_roles` is a list of roles that can initiate this type of document, which matters because a depositor cannot upload an inspection form and a regulator cannot upload an application form.

### A Complete Example

```json
{
  "document_types": [
    {
      "id": "application_form",
      "label": "Application Form",
      "category": "FORM",
      "initial_state": "PENDING_STAFF",
      "allowed_uploader_roles": ["DEPOSITOR"],
      "allowed_transitions": [
        { "from_state": "PENDING_STAFF", "to_state": "PENDING_MANAGER", "required_role": "STAFF", "action": "confirm" },
        { "from_state": "PENDING_STAFF", "to_state": "CORRECTION_NEEDED", "required_role": "STAFF", "action": "send_back", "reason_required": true },
        { "from_state": "PENDING_MANAGER", "to_state": "PENDING_CEO", "required_role": "MANAGER", "action": "approve" },
        { "from_state": "PENDING_MANAGER", "to_state": "REJECTED", "required_role": "MANAGER", "action": "reject", "reason_required": true },
        { "from_state": "PENDING_MANAGER", "to_state": "CORRECTION_NEEDED", "required_role": "MANAGER", "action": "send_back", "reason_required": true },
        { "from_state": "PENDING_CEO", "to_state": "APPROVED", "required_role": "CEO", "action": "final_approve" },
        { "from_state": "PENDING_CEO", "to_state": "REJECTED", "required_role": "CEO", "action": "reject", "reason_required": true },
        { "from_state": "PENDING_CEO", "to_state": "CORRECTION_NEEDED", "required_role": "CEO", "action": "send_back", "reason_required": true },
        { "from_state": "CORRECTION_NEEDED", "to_state": "PENDING_STAFF", "required_role": "DEPOSITOR", "action": "resubmit" }
      ],
      "required_fields": ["applicant_name", "warehouse_code", "date", "signature"],
      "optional_fields": ["reference_number", "description", "contact_phone"],
      "file_formats": ["pdf", "jpg", "jpeg", "png"],
      "validation_rules": {
        "min_ocr_confidence": 0.75,
        "require_signature": true,
        "require_stamp": false,
        "require_date": true
      },
      "classification_hints": [
        "application for warehouse services",
        "request to deposit goods",
        "depositor application"
      ]
    },
    {
      "id": "inspection_form",
      "label": "Warehouse Inspection Form",
      "category": "FORM",
      "initial_state": "PENDING_MANAGER",
      "allowed_uploader_roles": ["STAFF"],
      "allowed_transitions": [
        { "from_state": "PENDING_MANAGER", "to_state": "PENDING_CEO", "required_role": "MANAGER", "action": "approve" },
        { "from_state": "PENDING_MANAGER", "to_state": "CORRECTION_NEEDED", "required_role": "MANAGER", "action": "send_back", "reason_required": true },
        { "from_state": "PENDING_CEO", "to_state": "APPROVED", "required_role": "CEO", "action": "final_approve" },
        { "from_state": "PENDING_CEO", "to_state": "CORRECTION_NEEDED", "required_role": "CEO", "action": "send_back", "reason_required": true },
        { "from_state": "CORRECTION_NEEDED", "to_state": "PENDING_MANAGER", "required_role": "STAFF", "action": "resubmit" }
      ],
      "required_fields": ["warehouse_name", "region", "inspection_date", "inspector_name", "findings"],
      "optional_fields": ["recommendations", "photographs_attached"],
      "file_formats": ["pdf", "jpg", "jpeg", "png"],
      "validation_rules": {
        "min_ocr_confidence": 0.80,
        "require_signature": true,
        "require_stamp": true,
        "require_date": true
      },
      "classification_hints": [
        "warehouse inspection report",
        "physical inspection findings",
        "compliance inspection"
      ]
    },
    {
      "id": "compliance_certificate",
      "label": "Warehouse Compliance Certificate",
      "category": "CERTIFICATE",
      "initial_state": "APPROVED",
      "allowed_uploader_roles": ["REGULATOR"],
      "allowed_transitions": [],
      "required_fields": ["warehouse_code", "certificate_number", "issue_date", "valid_until", "issuing_authority"],
      "optional_fields": ["conditions", "scope"],
      "file_formats": ["pdf"],
      "validation_rules": {
        "min_ocr_confidence": 0.85,
        "require_signature": true,
        "require_stamp": true,
        "require_date": true
      },
      "classification_hints": [
        "compliance certificate",
        "warehouse licensing",
        "regulatory authorization"
      ]
    },
    {
      "id": "warehouse_receipt",
      "label": "Warehouse Delivery Receipt",
      "category": "RECEIPT",
      "initial_state": "PENDING_MANAGER",
      "allowed_uploader_roles": ["STAFF"],
      "allowed_transitions": [
        { "from_state": "PENDING_MANAGER", "to_state": "APPROVED", "required_role": "MANAGER", "action": "approve" },
        { "from_state": "PENDING_MANAGER", "to_state": "CORRECTION_NEEDED", "required_role": "MANAGER", "action": "send_back", "reason_required": true },
        { "from_state": "CORRECTION_NEEDED", "to_state": "PENDING_MANAGER", "required_role": "STAFF", "action": "resubmit" }
      ],
      "required_fields": ["depositor_name", "goods_description", "quantity", "receipt_date"],
      "optional_fields": ["storage_location", "condition_notes"],
      "file_formats": ["pdf", "jpg", "jpeg", "png"],
      "validation_rules": {
        "min_ocr_confidence": 0.75,
        "require_signature": true,
        "require_stamp": false,
        "require_date": true
      },
      "classification_hints": [
        "warehouse delivery receipt",
        "goods received",
        "storage confirmation"
      ]
    }
  ]
}
```

The other document types from the client's specification, namely the permission form, the goods cost receipt, the quality certificate, the application report, the ranking report, the inspection report as received from regulator, and the operation cost structure report, follow the same schema and are defined during the initial build phase. The configuration file grows as new types are added.

### The Configuration Loader

The configuration file is loaded into memory once at Django startup and exposed through a singleton accessor in `wdms_documents/fsm/types.py`. The accessor provides methods like `get_type(type_id)` to look up a single type, `get_allowed_transitions(type_id, current_state, user_role)` to compute which transitions the user can perform on a document in a given state, and `get_required_fields(type_id)` to fetch the validation field list. The loader performs schema validation at startup and refuses to start the application if the configuration is malformed, which is the correct behavior because a broken configuration would silently break every document operation.

---

## Part Eight: Core Data Models

### The Document and Upload Attempt Models

The `UploadAttempt` model represents a file that has been uploaded but has not yet passed pre-submission validation. It carries a foreign key to the uploader user, the document type identifier, the staged file path, the optical character recognition result as a text field, the validation status as one of `PENDING`, `HARD_REJECT`, `SOFT_WARNING`, or `PASSED`, the validation warnings as a JSON array, a Celery task identifier for tracking, and a creation timestamp. Upload attempts are cleaned up by a nightly job that deletes records older than twenty-four hours whose status is `HARD_REJECT` or `PENDING`, which prevents the staging area from accumulating abandoned uploads.

The `Document` model is the central model of the system. It carries a foreign key to the warehouse, a foreign key to the uploader user, the document type identifier matching an entry in the configuration file, the title, the stored file field pointing to the permanent storage location, the current finite state machine status, the extracted text from optical character recognition, the artificial intelligence-populated fields including classification, extracted structured data, confidence score, and summary, a vector embedding field using the pgvector extension, a soft warning override flag indicating that the document entered the system despite warnings, a correction note when the document is in the `CORRECTION_NEEDED` state, and the usual `BaseModel` fields.

```python
# wdms_documents/models.py

from django.db import models
from django.contrib.auth.models import User
from django.contrib.postgres.fields import ArrayField
from pgvector.django import VectorField
from wdms_utils.BaseModel import BaseModel
from wdms_tenants.models import Warehouse


class DocumentStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PENDING_STAFF = "PENDING_STAFF", "Pending Staff Review"
    PENDING_MANAGER = "PENDING_MANAGER", "Pending Manager Approval"
    PENDING_CEO = "PENDING_CEO", "Pending CEO Final Approval"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CORRECTION_NEEDED = "CORRECTION_NEEDED", "Correction Needed"


class UploadAttemptStatus(models.TextChoices):
    PENDING = "PENDING", "Pending Validation"
    HARD_REJECT = "HARD_REJECT", "Hard Reject"
    SOFT_WARNING = "SOFT_WARNING", "Soft Warning"
    PASSED = "PASSED", "Passed"
    PROMOTED = "PROMOTED", "Promoted to Document"


class UploadAttempt(BaseModel):
    uploader = models.ForeignKey(
        User, related_name="upload_attempts", on_delete=models.CASCADE
    )
    warehouse = models.ForeignKey(
        Warehouse, related_name="upload_attempts", on_delete=models.CASCADE
    )
    document_type_id = models.CharField(max_length=100)
    title = models.CharField(max_length=500, blank=True)
    staged_file = models.FileField(upload_to="staging/")
    ocr_text = models.TextField(blank=True)
    ocr_confidence = models.FloatField(null=True, blank=True)
    validation_status = models.CharField(
        max_length=20,
        choices=UploadAttemptStatus.choices,
        default=UploadAttemptStatus.PENDING,
    )
    validation_warnings = models.JSONField(default=list, blank=True)
    celery_task_id = models.CharField(max_length=100, blank=True)
    promoted_document = models.ForeignKey(
        "Document", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="source_attempt",
    )

    class Meta:
        db_table = "upload_attempts"
        ordering = ["-primary_key"]
        verbose_name_plural = "UPLOAD ATTEMPTS"


class Document(BaseModel):
    warehouse = models.ForeignKey(
        Warehouse, related_name="documents", on_delete=models.CASCADE
    )
    uploader = models.ForeignKey(
        User, related_name="uploaded_documents", on_delete=models.PROTECT
    )
    document_type_id = models.CharField(max_length=100, db_index=True)
    title = models.CharField(max_length=500)
    file = models.FileField(upload_to="documents/%Y/%m/")
    status = models.CharField(
        max_length=30,
        choices=DocumentStatus.choices,
        default=DocumentStatus.PENDING_STAFF,
        db_index=True,
    )
    # AI-populated fields
    extracted_text = models.TextField(blank=True)
    ai_classification = models.CharField(max_length=100, blank=True)
    ai_extracted_fields = models.JSONField(default=dict, blank=True)
    ai_summary = models.TextField(blank=True)
    ai_confidence_score = models.FloatField(null=True, blank=True)
    ai_review_notes = models.TextField(blank=True)
    ai_keywords = ArrayField(
        models.CharField(max_length=100), default=list, blank=True
    )
    embedding = VectorField(dimensions=1536, null=True, blank=True)
    # Workflow context
    soft_warning_override = models.BooleanField(default=False)
    current_correction_note = models.TextField(blank=True)

    class Meta:
        db_table = "documents"
        ordering = ["-primary_key"]
        verbose_name_plural = "DOCUMENTS"
        indexes = [
            models.Index(fields=["warehouse", "status"]),
            models.Index(fields=["document_type_id", "status"]),
            models.Index(fields=["uploader", "status"]),
        ]

    def __str__(self):
        return f"{self.document_type_id}: {self.title} ({self.status})"


class WorkflowTransition(BaseModel):
    document = models.ForeignKey(
        Document, related_name="transitions", on_delete=models.CASCADE
    )
    from_status = models.CharField(max_length=30)
    to_status = models.CharField(max_length=30)
    actor = models.ForeignKey(
        User, related_name="workflow_actions", on_delete=models.PROTECT
    )
    action = models.CharField(max_length=50)
    reason = models.TextField(blank=True)
    edited_fields = models.JSONField(default=dict, blank=True)
    ai_corrections = models.JSONField(
        default=dict, blank=True,
        help_text="Fields where the user corrected the AI output",
    )

    class Meta:
        db_table = "workflow_transitions"
        ordering = ["-primary_key"]
        verbose_name_plural = "WORKFLOW TRANSITIONS"
        indexes = [
            models.Index(fields=["document", "-primary_key"]),
        ]
```

The `WorkflowTransition` model is the audit log of the system. Every state change is recorded with the user who made the change, the action they took, the reason if one was required, any edits they made to document fields, and crucially any corrections they made to the artificial intelligence's output. The `ai_corrections` field is a JSON object recording which fields the user overrode and what the artificial intelligence had said versus what the user changed it to. Over time this field becomes a training dataset indicating where the artificial intelligence needs improvement.

### The Notification Preference and Event Models

Notifications are stored in two models. The `NotificationPreference` model holds each user's choice for each notification channel, keyed by event type. The `NotificationEvent` model is the persistent record of a notification that was dispatched, which also serves as the dashboard notification feed. When a workflow transition fires, a `NotificationEvent` is created for each recipient, and then depending on each recipient's preferences, an email or short message service task is enqueued.

```python
# wdms_notifications/models.py

from django.db import models
from django.contrib.auth.models import User
from wdms_utils.BaseModel import BaseModel


class NotificationChannel(models.TextChoices):
    DASHBOARD = "DASHBOARD", "Dashboard"
    EMAIL = "EMAIL", "Email"
    SMS = "SMS", "Short Message Service"


class NotificationEventType(models.TextChoices):
    DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED", "Document Uploaded"
    DOCUMENT_VALIDATED = "DOCUMENT_VALIDATED", "Document Validated"
    DOCUMENT_CONFIRMED_BY_STAFF = "DOCUMENT_CONFIRMED_BY_STAFF", "Staff Confirmed Document"
    DOCUMENT_APPROVED_BY_MANAGER = "DOCUMENT_APPROVED_BY_MANAGER", "Manager Approved"
    DOCUMENT_APPROVED_BY_CEO = "DOCUMENT_APPROVED_BY_CEO", "CEO Approved"
    DOCUMENT_REJECTED = "DOCUMENT_REJECTED", "Document Rejected"
    DOCUMENT_SENT_BACK = "DOCUMENT_SENT_BACK", "Document Sent Back for Correction"
    DOCUMENT_APPROVED_FINAL = "DOCUMENT_APPROVED_FINAL", "Document Officially Approved"
    RANKING_REPORT_UPDATED = "RANKING_REPORT_UPDATED", "Ranking Report Updated"


class NotificationPreference(BaseModel):
    user = models.ForeignKey(
        User, related_name="notification_preferences", on_delete=models.CASCADE
    )
    event_type = models.CharField(
        max_length=50, choices=NotificationEventType.choices
    )
    channel = models.CharField(
        max_length=20, choices=NotificationChannel.choices
    )
    enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "notification_preferences"
        unique_together = ["user", "event_type", "channel"]
        verbose_name_plural = "NOTIFICATION PREFERENCES"


class NotificationEvent(BaseModel):
    recipient = models.ForeignKey(
        User, related_name="notifications", on_delete=models.CASCADE
    )
    event_type = models.CharField(
        max_length=50, choices=NotificationEventType.choices
    )
    subject = models.CharField(max_length=500)
    body = models.TextField()
    related_document_id = models.BigIntegerField(null=True, blank=True)
    channels_sent = models.JSONField(default=list, blank=True)
    read_on_dashboard = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notification_events"
        ordering = ["-primary_key"]
        verbose_name_plural = "NOTIFICATION EVENTS"
        indexes = [
            models.Index(fields=["recipient", "read_on_dashboard"]),
        ]
```

### The Warehouse Ranking Model

The warehouse ranking is stored in a separate model rather than computed on demand, because the computation involves aggregating inspection data across many documents and invoking a large language model for explanation. The model stores the warehouse, the computation date, the rule-based score components as a JSON object, the final score, the risk category as one of `LOW`, `MEDIUM`, or `HIGH`, the AI-generated explanation, and the list of contributing factors.

```python
# wdms_reports/models.py

from django.db import models
from wdms_utils.BaseModel import BaseModel
from wdms_tenants.models import Warehouse


class RiskCategory(models.TextChoices):
    LOW = "LOW", "Low Risk"
    MEDIUM = "MEDIUM", "Medium Risk"
    HIGH = "HIGH", "High Risk"


class WarehouseRanking(BaseModel):
    warehouse = models.ForeignKey(
        Warehouse, related_name="rankings", on_delete=models.CASCADE
    )
    computed_at = models.DateTimeField(auto_now_add=True)
    rule_based_components = models.JSONField(default=dict)
    final_score = models.DecimalField(max_digits=5, decimal_places=2)
    risk_category = models.CharField(
        max_length=10, choices=RiskCategory.choices
    )
    ai_explanation = models.TextField()
    contributing_factors = models.JSONField(default=list)
    is_latest = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "warehouse_rankings"
        ordering = ["-computed_at"]
        verbose_name_plural = "WAREHOUSE RANKINGS"
        indexes = [
            models.Index(fields=["warehouse", "-computed_at"]),
            models.Index(fields=["is_latest", "risk_category"]),
        ]
```

When a new ranking is computed, the previous ranking for the same warehouse has its `is_latest` flag set to false, and the new row is created with `is_latest` set to true. This gives us historical rankings for audit purposes while making the current ranking trivially queryable.

### The Regulator Jurisdiction Model

The regulator jurisdiction is stored as a separate model rather than a field on `UserProfile` because a regulator may in some cases have multiple jurisdictions, and because the jurisdiction relationship is clearer when modeled explicitly.

```python
# wdms_regulatory/models.py

from django.db import models
from django.contrib.auth.models import User
from wdms_utils.BaseModel import BaseModel
from wdms_tenants.models import Region


class JurisdictionScope(models.TextChoices):
    NATIONAL = "NATIONAL", "National"
    REGIONAL = "REGIONAL", "Regional"


class RegulatorJurisdiction(BaseModel):
    regulator = models.ForeignKey(
        User, related_name="jurisdictions", on_delete=models.CASCADE
    )
    scope = models.CharField(
        max_length=20, choices=JurisdictionScope.choices
    )
    region = models.ForeignKey(
        Region, null=True, blank=True, on_delete=models.CASCADE,
        help_text="Required when scope is REGIONAL, null when NATIONAL",
    )

    class Meta:
        db_table = "regulator_jurisdictions"
        verbose_name_plural = "REGULATOR JURISDICTIONS"
```

---

## Part Nine: The Four Pipeline Stages in Detail

### Stage Zero: Pre-Submission Validation

The pre-submission validation stage runs synchronously from the user's perspective but asynchronously from the system's perspective, connected through server-sent events. When the depositor clicks upload, the frontend sends a multipart form data request to `POST /api/v1/documents/upload/` with the file and the document type identifier. The backend saves the file to the staging location, creates an `UploadAttempt` record with status `PENDING`, enqueues a Celery task called `validate_upload` with the upload attempt identifier, and returns a response containing the upload attempt identifier and the Celery task identifier. The frontend then opens a server-sent event connection to `GET /api/v1/documents/upload/{attempt_id}/stream/` and begins listening for events.

The Celery worker picks up the `validate_upload` task and begins publishing events to a Redis channel named after the upload attempt identifier. The first event announces that optical character recognition has started. The worker calls Google Vision on the staged file, receives the extracted text and the confidence score, and publishes an event announcing the result. The worker then loads the document type configuration, extracts the required fields list and the validation rules, and uses Groq to check which required fields are present in the extracted text. For each missing required field, the worker publishes a warning event. When all checks are complete, the worker computes the final validation status as `HARD_REJECT` if the optical character recognition confidence is below a floor threshold or if the file is unreadable, as `SOFT_WARNING` if some required fields are missing but the file is readable, or as `PASSED` if all required fields are present. The worker updates the `UploadAttempt` record with the status and warnings, and publishes a final event with the outcome.

The server-sent event view on the Django side subscribes to the Redis channel and forwards events to the frontend. When the final event arrives, the frontend either shows a hard reject message, a soft warning message with an option to fix or override, or a pass message. If the user chooses to submit, the frontend calls `POST /api/v1/documents/upload/{attempt_id}/confirm/`. The backend creates a `Document` record from the `UploadAttempt`, moves the file from staging to permanent storage, sets the status to the document type's `initial_state`, marks the `UploadAttempt` as promoted, and enqueues the Stage One artificial intelligence pre-review chain.

### Stage One: Artificial Intelligence Pre-Review Chain

The pre-review chain is a Celery chain with five steps that run in sequence, each passing the document identifier to the next. The first step, `classify_document`, reads the extracted text from the document, calls Groq with a prompt that includes the list of document types and their classification hints, and receives back a JSON structure with the predicted type identifier and a confidence score. The result is stored in the document's `ai_classification` and `ai_confidence_score` fields.

The second step, `extract_structured_fields`, reads the predicted type's required and optional fields from the configuration and calls Groq with a prompt that asks for structured extraction of those fields. The result is stored in the document's `ai_extracted_fields` JSON field as a dictionary keyed by field name.

The third step, `score_document`, calls Groq with a prompt that asks for a quality score and a completeness score given the document type and the extracted text. The result is stored in the document's `ai_confidence_score` field, replacing the preliminary score from the classification step.

The fourth step, `generate_review`, calls Groq with a prompt that asks for a human-readable review of the document, summarizing what it is, what it contains, and what should be flagged for staff attention. The result is stored in the document's `ai_review_notes` field.

The fifth step, `generate_embedding`, calls OpenAI's embedding endpoint with the extracted text and stores the result in the document's `embedding` pgvector field.

When the chain completes, a Celery callback fires a Django signal `document_ready_for_staff`, which causes the notification dispatcher to send notifications to all staff users in the warehouse's tenant who have opted in to the `DOCUMENT_UPLOADED` event on any channel.

If the staff later corrects the classification during review, the staff action triggers a re-run of steps two through four of the chain, because the new document type has different required fields and the extraction, scoring, and review all depend on the type. The re-run preserves the original artificial intelligence output in the `ai_corrections` audit field so that we can see what the artificial intelligence originally said and what the staff changed it to.

### Stage Two: Human-in-the-Loop Approval Chain

Once a document has its artificial intelligence pre-review populated, it enters the human-in-the-loop approval chain. Staff opens the document, sees the split screen with the original file on the left and the artificial intelligence review on the right, makes any corrections to extracted fields, adds any notes, and clicks confirm. The confirm action calls `POST /api/v1/documents/{id}/transition/` with the target state, which is `PENDING_MANAGER` for an application form. The backend validates that the user has the required role, that the transition is allowed by the document type's finite state machine configuration, and that any `reason_required` fields are provided. If valid, the transition is executed, a `WorkflowTransition` record is created capturing the audit trail, and the notification signal fires.

The manager and chief executive officer follow the same pattern, each adding their own layer of notes and decisions. The key difference from a linear workflow is that at any point, any of these roles can choose to send the document back to any previous role rather than approving or rejecting. The send-back transition is modeled as a transition from the current state to `CORRECTION_NEEDED`, with a `sent_back_to_role` field on the transition record indicating where the document should go next. When the target role is the depositor, the document remains in `CORRECTION_NEEDED` until the depositor resubmits, which transitions it back to `PENDING_STAFF`. When the target role is the staff, the document goes back to `PENDING_STAFF` directly. This flexibility is what the fully-configurable correction flow decision requires.

### Stage Three: Retrieval and Reporting

Retrieval is powered by a combination of keyword search, semantic search, and role-based filtering. A depositor searching for documents sees only their own documents. A staff member sees their warehouse's documents. A manager or chief executive officer sees their tenant's documents. A regulator sees documents within their jurisdiction. Within each role's scope, the user can search by keyword which performs a PostgreSQL full-text search on the title and extracted text, or by natural language query which is first embedded using OpenAI and then matched against the `embedding` field using pgvector's cosine distance operator. The backend endpoint that handles search takes the query, determines whether it looks like a keyword query or a natural language query based on length and structure, and runs the appropriate search. Results are ranked by relevance and returned with pagination using the existing `get_paginated_and_non_paginated_data` utility.

Reporting is a separate feature that generates aggregated statistics and analytical reports. The simplest reports are document count by status, by type, by warehouse, and by time period. These are straightforward structured query language queries wrapped in the existing pagination utility. More sophisticated reports include trend analysis over time, correction-request frequency per warehouse, and average approval latency from upload to final approval. These reports are generated on demand, cached for a short period, and can be exported as portable document format or comma-separated values for download.

### Stage Four: Regulatory Exposure

The regulatory layer serves two audiences. The first audience is regulators who log in to the system and use a dashboard. The second audience is external regulatory systems that integrate through a representational state transfer application programming interface. Both use the same underlying data and the same jurisdiction filtering.

The regulator dashboard is a set of React views that present approved documents within the jurisdiction, ranking reports for warehouses within the jurisdiction, inspection reports for warehouses within the jurisdiction, and a button to trigger an on-demand ranking recomputation. The dashboard uses the same application programming interface endpoints as the rest of the system but with jurisdiction-scoped querysets instead of tenant-scoped ones.

The regulatory application programming interface is a separate set of endpoints under `/api/v1/regulatory/` that require an application programming interface key instead of a user session. The endpoints include `GET /warehouses/` to list warehouses in the calling key's jurisdiction, `GET /warehouses/{id}/compliance-documents/` to list approved compliance documents for a specific warehouse, `GET /rankings/latest/` to get the latest ranking report across the jurisdiction, and `POST /webhooks/subscribe/` to register a callback uniform resource locator for real-time notifications when new approved documents become available. The application programming interface key is scoped to a jurisdiction and rate-limited per key.

---

## Part Ten: Application Programming Interface Surface

The application programming interface follows the Django Ninja pattern from `secured_SRS`, with each application exposing a router that is aggregated in `warehouse_dms/wdms_api_v1.py`. The response envelopes use the existing `ResponseObject` and pagination utilities. Every schema uses camelCase aliasing through the `BaseSchema` configuration.

The top-level router mount points are `/api/v1/auth/` for authentication, `/api/v1/accounts/` for account management, `/api/v1/tenants/` for tenant, region, and warehouse management, `/api/v1/documents/` for document operations, `/api/v1/notifications/` for notification preferences and history, `/api/v1/reports/` for report generation, and `/api/v1/regulatory/` for the regulator-facing endpoints.

Within `/api/v1/documents/`, the key endpoints are `POST /upload/` to start an upload attempt, `GET /upload/{attempt_id}/stream/` for the server-sent event stream during validation, `POST /upload/{attempt_id}/confirm/` to promote a validated upload to a document, `GET /` to list documents with filtering, `GET /{id}/` to retrieve a document with its full artificial intelligence review and transition history, `POST /{id}/transition/` to perform a finite state machine transition, `POST /{id}/correct-ai/` to save artificial intelligence corrections made by the reviewer, `POST /{id}/reclassify/` to trigger a classification change and re-run extraction, and `POST /search/` to perform keyword or semantic search.

Within `/api/v1/reports/`, the key endpoints are `GET /warehouses/{id}/ranking/` to retrieve the latest ranking for a warehouse, `POST /warehouses/{id}/ranking/recompute/` to trigger an on-demand recomputation subject to rate limiting, `GET /analytics/document-counts/` for aggregated counts, and `POST /generate/{report_type}/` to generate and download a report.

---

## Part Eleven: Starter Code for the Hard Pieces

### The Configurable Finite State Machine Engine

The finite state machine engine is the heart of the workflow layer. It reads the document type configuration, exposes the allowed transitions for a given document and user, and executes transitions atomically with audit logging. This is the first piece to get right because every workflow operation depends on it.

```python
# wdms_documents/fsm/engine.py

"""
Configurable Finite State Machine Engine

Reads document type definitions from wdms_documents/config/document_types.json
and exposes allowed transitions plus atomic transition execution with audit logging.

This engine is the heart of the workflow layer. Every document state change
passes through `execute_transition`, which guarantees:
- The transition is allowed by the document type's configuration
- The user has the required role
- Any `reason_required` constraint is satisfied
- The change is atomic with its audit trail
"""

import logging
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from django.db import transaction
from django.contrib.auth.models import User
from django.dispatch import Signal

from wdms_documents.models import Document, WorkflowTransition
from wdms_documents.fsm.types import get_document_type, DocumentTypeDefinition

logger = logging.getLogger("wdms_logger")

# Signal fired after every successful transition. Notification dispatcher subscribes.
document_transitioned = Signal()


@dataclass
class AllowedTransition:
    """Represents a transition available to a user for a document."""
    from_state: str
    to_state: str
    action: str
    required_role: str
    reason_required: bool


@dataclass
class TransitionResult:
    """Result of attempting a transition."""
    success: bool
    message: str
    new_status: Optional[str] = None
    transition_id: Optional[int] = None


class FSMEngine:
    """
    The finite state machine engine.

    Responsibilities:
    - Compute allowed transitions for a (document, user) pair
    - Execute transitions atomically with audit logging
    - Fire signals for downstream listeners (notifications, analytics)

    Non-responsibilities:
    - Does NOT dispatch notifications (handled by signal receivers)
    - Does NOT run AI pipeline (handled by Celery tasks triggered by signals)
    - Does NOT enforce tenant isolation (handled at view layer)
    """

    def get_allowed_transitions(
        self,
        document: Document,
        user: User,
    ) -> List[AllowedTransition]:
        """
        Return the list of transitions this user can perform on this document
        given its current status. The UI uses this to render action buttons.
        """
        type_def = get_document_type(document.document_type_id)
        if not type_def:
            return []

        user_role = self._get_user_role(user)
        if not user_role:
            return []

        allowed = []
        for transition in type_def.allowed_transitions:
            if transition["from_state"] != document.status:
                continue
            if transition["required_role"] != user_role:
                continue
            allowed.append(
                AllowedTransition(
                    from_state=transition["from_state"],
                    to_state=transition["to_state"],
                    action=transition["action"],
                    required_role=transition["required_role"],
                    reason_required=transition.get("reason_required", False),
                )
            )
        return allowed

    def can_transition(
        self,
        document: Document,
        user: User,
        action: str,
    ) -> Optional[AllowedTransition]:
        """
        Check whether a specific action is allowed for this user on this document.
        Returns the transition spec if allowed, None otherwise.
        """
        for transition in self.get_allowed_transitions(document, user):
            if transition.action == action:
                return transition
        return None

    @transaction.atomic
    def execute_transition(
        self,
        document: Document,
        user: User,
        action: str,
        reason: str = "",
        edited_fields: Optional[Dict[str, Any]] = None,
        ai_corrections: Optional[Dict[str, Any]] = None,
    ) -> TransitionResult:
        """
        Execute a state transition atomically.

        Steps:
        1. Validate the transition is allowed for this user and action
        2. Validate reason is provided if reason_required
        3. Update the document's status
        4. Create a WorkflowTransition audit record
        5. Fire the document_transitioned signal (notifications listen to this)

        All steps happen in a single database transaction. If any step fails,
        the entire transition is rolled back.
        """
        # Step 1: Validate
        transition_spec = self.can_transition(document, user, action)
        if not transition_spec:
            return TransitionResult(
                success=False,
                message=f"Action '{action}' not allowed for user on document in status '{document.status}'",
            )

        # Step 2: Check reason
        if transition_spec.reason_required and not reason.strip():
            return TransitionResult(
                success=False,
                message=f"Action '{action}' requires a reason",
            )

        # Step 3: Update document
        from_status = document.status
        document.status = transition_spec.to_state

        # If going to CORRECTION_NEEDED, store the reason in the dedicated field
        if transition_spec.to_state == "CORRECTION_NEEDED":
            document.current_correction_note = reason
        else:
            document.current_correction_note = ""

        document.save(update_fields=["status", "current_correction_note", "updated_date"])

        # Step 4: Audit log
        wt = WorkflowTransition.objects.create(
            document=document,
            from_status=from_status,
            to_status=transition_spec.to_state,
            actor=user,
            action=action,
            reason=reason,
            edited_fields=edited_fields or {},
            ai_corrections=ai_corrections or {},
            created_by=user,
        )

        # Step 5: Signal
        document_transitioned.send(
            sender=Document,
            document=document,
            from_status=from_status,
            to_status=transition_spec.to_state,
            action=action,
            actor=user,
            reason=reason,
        )

        logger.info(
            f"FSM transition: doc={document.pk} {from_status}->{transition_spec.to_state} "
            f"by {user.username} action={action}"
        )

        return TransitionResult(
            success=True,
            message="Transition executed",
            new_status=transition_spec.to_state,
            transition_id=wt.pk,
        )

    def _get_user_role(self, user: User) -> Optional[str]:
        """Get the user's primary role name (e.g., 'STAFF', 'MANAGER')."""
        from wdms_uaa.models import UsersWithRoles
        ur = UsersWithRoles.objects.filter(
            user_with_role_user=user, is_active=True
        ).select_related("user_with_role_role").first()
        return ur.user_with_role_role.name if ur else None
```

The engine is instantiated once per request at the view layer. It never talks to the notification system directly; instead it fires the `document_transitioned` signal, and the notification dispatcher subscribes to that signal. This keeps the engine focused on workflow correctness without coupling it to every downstream concern.

### The Celery Artificial Intelligence Pipeline Chain

The artificial intelligence pipeline is a Celery chain that processes a document through classification, extraction, scoring, review, and embedding. Each step is its own task so that failures in one step do not lose the work done in earlier steps, and so that the chain can be re-run from a specific point if the user corrects the classification.

```python
# wdms_ai_pipeline/tasks.py

"""
AI Pipeline Celery Tasks

These tasks form the pre-review chain that runs after a document is
promoted from an UploadAttempt. Each task reads the document, calls
an external AI service through an interface, and writes results back
to the document.

The service interfaces (OCRService, LLMService, EmbeddingService) live
in wdms_ai_pipeline/services/interfaces/. Real implementations live in
services/providers/ (VisionOCRService, GroqLLMService, OpenAIEmbeddingService).
Mock implementations for testing live in services/mocks/.

The tasks retrieve services through a ServiceRegistry, which reads
configuration to decide whether to use real or mock implementations.
"""

import logging
from celery import shared_task, chain
from django.dispatch import Signal
from wdms_documents.models import Document
from wdms_ai_pipeline.services.registry import get_service_registry

logger = logging.getLogger("wdms_logger")

# Signal fired when the full AI pre-review chain completes
document_ai_review_complete = Signal()


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def run_ocr(self, document_id: int) -> int:
    """
    Step 1: Run OCR on the document's file and store extracted text.

    Note: For UploadAttempt validation (Stage 0), OCR runs separately
    inside validate_upload. This task is for Stage 1 where we re-run
    or use the staged OCR result already attached to the document.

    Returns the document_id so the next task in the chain receives it.
    """
    try:
        document = Document.objects.get(pk=document_id)
        # If OCR text was already attached during Stage 0, skip
        if document.extracted_text:
            return document_id

        services = get_service_registry()
        result = services.ocr.extract_text(document.file.path)

        document.extracted_text = result.text
        document.ai_confidence_score = result.confidence
        document.save(update_fields=["extracted_text", "ai_confidence_score", "updated_date"])

        logger.info(f"OCR complete for document {document_id} (confidence={result.confidence:.2f})")
        return document_id

    except Exception as e:
        logger.error(f"OCR failed for document {document_id}: {e}")
        raise self.retry(exc=e)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def classify_document(self, document_id: int) -> int:
    """
    Step 2: Classify the document using the LLM.

    Compares the extracted text against the document types' classification
    hints and returns the predicted type_id with a confidence score.
    """
    try:
        document = Document.objects.get(pk=document_id)
        services = get_service_registry()

        from wdms_documents.fsm.types import get_all_document_types
        all_types = get_all_document_types()

        result = services.llm.classify(
            text=document.extracted_text,
            candidate_types=[
                {
                    "id": t.id,
                    "label": t.label,
                    "hints": t.classification_hints,
                }
                for t in all_types
            ],
        )

        document.ai_classification = result.type_id
        document.ai_confidence_score = result.confidence
        document.save(update_fields=["ai_classification", "ai_confidence_score", "updated_date"])

        logger.info(f"Classified document {document_id} as {result.type_id} (confidence={result.confidence:.2f})")
        return document_id

    except Exception as e:
        logger.error(f"Classification failed for document {document_id}: {e}")
        raise self.retry(exc=e)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def extract_structured_fields(self, document_id: int) -> int:
    """
    Step 3: Extract structured fields based on the classified type.

    Uses the document type configuration to know which fields to extract,
    then calls the LLM with a prompt tuned for structured JSON output.
    """
    try:
        document = Document.objects.get(pk=document_id)
        services = get_service_registry()

        from wdms_documents.fsm.types import get_document_type
        type_def = get_document_type(document.ai_classification or document.document_type_id)
        if not type_def:
            logger.warning(f"No type definition for {document.ai_classification}, skipping extraction")
            return document_id

        result = services.llm.extract_fields(
            text=document.extracted_text,
            required_fields=type_def.required_fields,
            optional_fields=type_def.optional_fields,
        )

        document.ai_extracted_fields = result.fields
        document.save(update_fields=["ai_extracted_fields", "updated_date"])

        logger.info(f"Extracted {len(result.fields)} fields for document {document_id}")
        return document_id

    except Exception as e:
        logger.error(f"Field extraction failed for document {document_id}: {e}")
        raise self.retry(exc=e)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_review(self, document_id: int) -> int:
    """
    Step 4: Generate a human-readable review for staff.

    Summarizes the document, flags potential issues, and provides
    recommendations. This is what the staff reads on the right-hand
    panel during review.
    """
    try:
        document = Document.objects.get(pk=document_id)
        services = get_service_registry()

        from wdms_documents.fsm.types import get_document_type
        type_def = get_document_type(document.ai_classification or document.document_type_id)

        result = services.llm.generate_review(
            text=document.extracted_text,
            extracted_fields=document.ai_extracted_fields,
            document_type_label=type_def.label if type_def else "Unknown",
        )

        document.ai_review_notes = result.review
        document.ai_summary = result.summary
        document.ai_keywords = result.keywords
        document.save(update_fields=[
            "ai_review_notes", "ai_summary", "ai_keywords", "updated_date"
        ])

        logger.info(f"Generated review for document {document_id}")
        return document_id

    except Exception as e:
        logger.error(f"Review generation failed for document {document_id}: {e}")
        raise self.retry(exc=e)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_embedding(self, document_id: int) -> int:
    """
    Step 5: Generate a vector embedding for semantic search.

    Stored in the document's pgvector `embedding` field.
    """
    try:
        document = Document.objects.get(pk=document_id)
        services = get_service_registry()

        # Combine extracted text with the summary for richer embedding
        embedding_input = f"{document.ai_summary}\n\n{document.extracted_text[:4000]}"
        vector = services.embedding.embed(embedding_input)

        document.embedding = vector
        document.save(update_fields=["embedding", "updated_date"])

        logger.info(f"Generated embedding for document {document_id}")
        return document_id

    except Exception as e:
        logger.error(f"Embedding generation failed for document {document_id}: {e}")
        raise self.retry(exc=e)


@shared_task
def signal_ai_review_complete(document_id: int) -> int:
    """
    Final step: Fire the signal that notifications listen to.

    This is a separate task rather than a callback so that if any step
    fails after extraction, the signal does not fire prematurely.
    """
    document = Document.objects.get(pk=document_id)
    document_ai_review_complete.send(sender=Document, document=document)
    logger.info(f"AI review complete signal fired for document {document_id}")
    return document_id


def trigger_ai_pre_review(document_id: int):
    """
    Convenience function: enqueue the full pre-review chain for a document.
    Called from the confirm endpoint after an UploadAttempt is promoted.
    """
    chain(
        run_ocr.s(document_id),
        classify_document.s(),
        extract_structured_fields.s(),
        generate_review.s(),
        generate_embedding.s(),
        signal_ai_review_complete.s(),
    ).apply_async()


def trigger_reclassification(document_id: int, new_type_id: str):
    """
    Called when staff corrects the classification during review.

    Updates the classification immediately, then re-runs extraction,
    review, and embedding with the new type. The old AI output is
    preserved in the WorkflowTransition.ai_corrections field by the
    caller.
    """
    document = Document.objects.get(pk=document_id)
    document.ai_classification = new_type_id
    document.save(update_fields=["ai_classification", "updated_date"])

    chain(
        extract_structured_fields.s(document_id),
        generate_review.s(),
        generate_embedding.s(),
    ).apply_async()
```

### The Server-Sent Event Stream for Pre-Submission Validation

The server-sent event stream is the user interface's real-time connection to the pre-submission validation process. It uses Django's `StreamingHttpResponse` combined with a Redis pub-sub subscription to push events from the Celery worker to the frontend.

```python
# wdms_ai_pipeline/sse.py

"""
Server-Sent Event Publishing and Streaming

The Celery worker publishes JSON events to a Redis channel named
after the upload attempt. The Django view subscribes to that channel
and forwards events to the frontend as SSE messages.

Event format:
    event: progress | error | complete
    data: {"stage": "ocr", "status": "done", "message": "...", "details": {...}}
"""

import json
import logging
from typing import Iterator, Dict, Any
import redis
from django.conf import settings
from django.http import StreamingHttpResponse

logger = logging.getLogger("wdms_logger")


def _redis_client():
    return redis.Redis.from_url(
        settings.CELERY_BROKER_URL, decode_responses=True
    )


def publish_progress(attempt_id: int, stage: str, status: str, message: str, **details):
    """Called by Celery workers to push progress to the SSE stream."""
    channel = f"upload:{attempt_id}"
    payload = {
        "stage": stage,
        "status": status,
        "message": message,
        "details": details,
    }
    try:
        _redis_client().publish(channel, json.dumps(payload))
    except Exception as e:
        logger.error(f"Failed to publish to {channel}: {e}")


def publish_complete(attempt_id: int, outcome: str, warnings: list = None):
    """Called at the end of validation to signal the final outcome."""
    channel = f"upload:{attempt_id}"
    payload = {
        "stage": "final",
        "status": "complete",
        "outcome": outcome,  # "HARD_REJECT" | "SOFT_WARNING" | "PASSED"
        "warnings": warnings or [],
    }
    _redis_client().publish(channel, json.dumps(payload))


def stream_upload_progress(attempt_id: int) -> StreamingHttpResponse:
    """
    Django view helper: subscribe to the attempt's Redis channel
    and stream events to the client as SSE.
    """

    def event_stream() -> Iterator[str]:
        client = _redis_client()
        pubsub = client.pubsub()
        channel = f"upload:{attempt_id}"
        pubsub.subscribe(channel)

        # Send an initial event so the client knows the stream is open
        yield "event: connected\ndata: {}\n\n"

        try:
            for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                payload = message["data"]
                try:
                    parsed = json.loads(payload)
                except Exception:
                    continue

                event_name = "complete" if parsed.get("status") == "complete" else "progress"
                yield f"event: {event_name}\ndata: {payload}\n\n"

                # Close the stream after the final event
                if parsed.get("status") == "complete":
                    break
        finally:
            pubsub.unsubscribe(channel)
            pubsub.close()

    response = StreamingHttpResponse(
        event_stream(),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"  # Disable nginx buffering
    return response
```

### The Tenant-Scoped Queryset Helper

The tenant-scoped queryset helper is a tiny but crucial utility that every view in the tenant-bound applications uses. Getting this right means multi-tenant isolation is automatic instead of manual.

```python
# wdms_tenants/querysets.py

"""
Tenant-Scoped QuerySets

Every queryset against a tenant-bound model (Document, Report, etc)
must be scoped to the current user's tenant. This helper makes that
automatic. Views call `get_tenant_queryset(Model, request)` instead
of `Model.objects.all()`.

Regulators use a different helper (`get_regulator_queryset`) that
scopes by jurisdiction instead of tenant.
"""

from typing import Type
from django.db.models import Model, QuerySet, Q
from django.http import HttpRequest


def get_user_tenant(request: HttpRequest):
    """Extract the tenant from the authenticated user's profile."""
    profile = getattr(request.user, "profile", None)
    if profile is None:
        return None
    return getattr(profile, "tenant", None)


def get_tenant_queryset(
    model: Type[Model],
    request: HttpRequest,
    tenant_path: str = "warehouse__tenant",
) -> QuerySet:
    """
    Return a queryset of `model` filtered to the current user's tenant.

    `tenant_path` is the Django ORM lookup that traverses from the model
    to the tenant. Defaults to `warehouse__tenant` which works for most
    tenant-bound models.

    Admins bypass this filter (they see everything).
    """
    qs = model.objects.all()

    # Admins see all tenants
    if request.user.is_superuser:
        return qs

    tenant = get_user_tenant(request)
    if tenant is None:
        return qs.none()

    return qs.filter(**{tenant_path: tenant})


def get_regulator_queryset(
    model: Type[Model],
    request: HttpRequest,
    region_path: str = "warehouse__region",
) -> QuerySet:
    """
    Return a queryset of `model` filtered to the regulator's jurisdiction.

    - National regulators see everything
    - Regional regulators see only their region's warehouses
    """
    from wdms_regulatory.models import RegulatorJurisdiction, JurisdictionScope

    qs = model.objects.all()

    jurisdictions = RegulatorJurisdiction.objects.filter(
        regulator=request.user, is_active=True
    )

    if not jurisdictions.exists():
        return qs.none()

    # If any jurisdiction is national, return everything
    if jurisdictions.filter(scope=JurisdictionScope.NATIONAL).exists():
        return qs

    # Otherwise, filter by the union of regional jurisdictions
    regions = jurisdictions.values_list("region_id", flat=True)
    return qs.filter(**{f"{region_path}__in": regions})
```

### The Notification Dispatcher with User Preferences

The notification dispatcher subscribes to the `document_transitioned` signal, resolves recipients, checks each recipient's preferences, and dispatches on the channels they have opted into.

```python
# wdms_notifications/dispatcher.py

"""
Notification Dispatcher

Subscribes to the document_transitioned signal (fired by the FSM engine)
and dispatches notifications to affected users according to their
per-channel preferences.

Dispatch is async: the actual email and SMS sending happen in Celery
tasks. This function creates the NotificationEvent record (which is
the dashboard feed) synchronously, then enqueues background tasks
for email and SMS.
"""

import logging
from typing import List
from django.contrib.auth.models import User
from django.dispatch import receiver

from wdms_documents.fsm.engine import document_transitioned
from wdms_notifications.models import (
    NotificationEvent,
    NotificationPreference,
    NotificationChannel,
    NotificationEventType,
)
from wdms_notifications.channels.email import send_email_task
from wdms_notifications.channels.sms import send_sms_task

logger = logging.getLogger("wdms_logger")


# Map of FSM (from_state, to_state, action) tuples to notification event types
TRANSITION_TO_EVENT = {
    ("PENDING_STAFF", "PENDING_MANAGER", "confirm"): NotificationEventType.DOCUMENT_CONFIRMED_BY_STAFF,
    ("PENDING_MANAGER", "PENDING_CEO", "approve"): NotificationEventType.DOCUMENT_APPROVED_BY_MANAGER,
    ("PENDING_CEO", "APPROVED", "final_approve"): NotificationEventType.DOCUMENT_APPROVED_FINAL,
    # send_back transitions
    ("PENDING_STAFF", "CORRECTION_NEEDED", "send_back"): NotificationEventType.DOCUMENT_SENT_BACK,
    ("PENDING_MANAGER", "CORRECTION_NEEDED", "send_back"): NotificationEventType.DOCUMENT_SENT_BACK,
    ("PENDING_CEO", "CORRECTION_NEEDED", "send_back"): NotificationEventType.DOCUMENT_SENT_BACK,
    # reject transitions
    ("PENDING_MANAGER", "REJECTED", "reject"): NotificationEventType.DOCUMENT_REJECTED,
    ("PENDING_CEO", "REJECTED", "reject"): NotificationEventType.DOCUMENT_REJECTED,
}


def _resolve_recipients(document, event_type: NotificationEventType) -> List[User]:
    """
    Determine which users should receive this notification.

    Rules:
    - The uploader always receives notifications about their own document
    - Staff receive notifications when a document is ready for their review
    - Managers receive notifications when a document needs their approval
    - CEOs receive notifications when a document needs final approval
    """
    recipients = {document.uploader}  # always notify the uploader

    from wdms_uaa.models import UsersWithRoles

    def users_with_role(role_name: str, warehouse=None, tenant=None):
        qs = UsersWithRoles.objects.filter(
            user_with_role_role__name=role_name, is_active=True
        ).select_related("user_with_role_user__profile")
        users = []
        for ur in qs:
            u = ur.user_with_role_user
            profile = getattr(u, "profile", None)
            if profile is None:
                continue
            if tenant and getattr(profile, "tenant_id", None) != tenant.pk:
                continue
            if warehouse and getattr(profile, "warehouse_id", None) != warehouse.pk:
                continue
            users.append(u)
        return users

    warehouse = document.warehouse
    tenant = warehouse.tenant

    if event_type == NotificationEventType.DOCUMENT_UPLOADED:
        recipients.update(users_with_role("STAFF", warehouse=warehouse))
    elif event_type == NotificationEventType.DOCUMENT_CONFIRMED_BY_STAFF:
        recipients.update(users_with_role("MANAGER", tenant=tenant))
    elif event_type == NotificationEventType.DOCUMENT_APPROVED_BY_MANAGER:
        recipients.update(users_with_role("CEO", tenant=tenant))

    return list(recipients)


def _user_channels(user: User, event_type: NotificationEventType) -> List[str]:
    """Return the list of channels this user has opted into for this event type."""
    prefs = NotificationPreference.objects.filter(
        user=user, event_type=event_type, enabled=True, is_active=True
    ).values_list("channel", flat=True)

    # Default: dashboard always on, email on, SMS off
    if not prefs.exists():
        return [NotificationChannel.DASHBOARD, NotificationChannel.EMAIL]

    return list(prefs)


def _build_message(document, event_type: NotificationEventType, reason: str):
    """Produce subject + body for a notification event."""
    doc_label = f"{document.document_type_id} #{document.pk}"

    if event_type == NotificationEventType.DOCUMENT_CONFIRMED_BY_STAFF:
        return (
            f"Document confirmed by staff: {doc_label}",
            f"Your document {doc_label} has passed staff review and is now awaiting manager approval.",
        )
    if event_type == NotificationEventType.DOCUMENT_APPROVED_BY_MANAGER:
        return (
            f"Document approved by manager: {doc_label}",
            f"Document {doc_label} has been approved by the manager and is awaiting final CEO approval.",
        )
    if event_type == NotificationEventType.DOCUMENT_APPROVED_FINAL:
        return (
            f"Document officially approved: {doc_label}",
            f"Document {doc_label} has received final approval and is now an official record.",
        )
    if event_type == NotificationEventType.DOCUMENT_SENT_BACK:
        return (
            f"Document needs correction: {doc_label}",
            f"Your document {doc_label} was sent back for correction.\n\nReason: {reason}",
        )
    if event_type == NotificationEventType.DOCUMENT_REJECTED:
        return (
            f"Document rejected: {doc_label}",
            f"Document {doc_label} has been rejected.\n\nReason: {reason}",
        )

    return (f"Update on document {doc_label}", f"Document {doc_label} status has changed.")


@receiver(document_transitioned)
def dispatch_transition_notifications(sender, **kwargs):
    """Signal handler: dispatch notifications for an FSM transition."""
    document = kwargs["document"]
    from_status = kwargs["from_status"]
    to_status = kwargs["to_status"]
    action = kwargs["action"]
    reason = kwargs.get("reason", "")

    event_type = TRANSITION_TO_EVENT.get((from_status, to_status, action))
    if event_type is None:
        # No notification configured for this transition
        return

    recipients = _resolve_recipients(document, event_type)
    subject, body = _build_message(document, event_type, reason)

    for recipient in recipients:
        channels = _user_channels(recipient, event_type)

        # Always create the NotificationEvent (it IS the dashboard feed)
        event = NotificationEvent.objects.create(
            recipient=recipient,
            event_type=event_type,
            subject=subject,
            body=body,
            related_document_id=document.pk,
            channels_sent=channels,
            created_by=kwargs.get("actor"),
        )

        # Enqueue email delivery if opted in
        if NotificationChannel.EMAIL in channels:
            send_email_task.delay(event.pk)

        # Enqueue SMS delivery if opted in
        if NotificationChannel.SMS in channels:
            send_sms_task.delay(event.pk)

    logger.info(
        f"Dispatched {event_type} for document {document.pk} to {len(recipients)} recipients"
    )
```

---

## Part Twelve: Deployment Path

The deployment path has three stages. The first stage is local development on a Linux or macOS workstation using Docker Compose. The second stage is on-premise or virtual private server deployment on government servers using the same Docker Compose setup but with production-grade settings and a reverse proxy. The third stage is Google Cloud Platform using managed services.

The local Docker Compose setup has six services. The `web` service runs Django using Gunicorn with Uvicorn workers for the server-sent event endpoints. The `worker` service runs Celery workers. The `beat` service runs Celery Beat for scheduled tasks like the nightly ranking computation. The `db` service runs PostgreSQL with the pgvector extension preinstalled. The `redis` service runs Redis. The `frontend` service runs the Vite development server, or in production builds serves the compiled React build through nginx. Files are stored on a mounted volume during local development.

The transition to Google Cloud Platform involves replacing `db` with Cloud Structured Query Language for PostgreSQL with pgvector enabled, replacing `redis` with Cloud Memorystore for Redis, replacing the `web` service with Cloud Run, replacing the `worker` and `beat` services with Cloud Run Jobs or Compute Engine virtual machines managed by a Kubernetes cluster, and replacing the mounted volume with Google Cloud Storage. The Django configuration changes are contained in the settings file through environment variable switches, with `django-storages` handling the file storage swap transparently.

The environment variables that drive these switches are `DATABASE_URL`, `REDIS_URL`, `DEFAULT_FILE_STORAGE`, `GOOGLE_VISION_CREDENTIALS`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `AFRICASTALKING_API_KEY`, `AFRICASTALKING_USERNAME`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and `FRONTEND_DOMAIN`. Local development uses a `.env` file matching the `dotenv_values(".env")` pattern from `secured_SRS`.

---

## Part Thirteen: Phased Build Plan

The build proceeds in five phases, each producing a working system that does less than the final product but does what it does correctly.

The first phase builds the skeleton. This means the project structure, the `BaseModel` and shared utilities ported from `secured_SRS`, the `Tenant`, `Region`, `Warehouse`, `UserProfile`, and extended role models, the authentication and authorization layer, the permission seeding, the admin user creation, and a single application programming interface endpoint that returns "hello warehouse" to prove the stack is wired up. This phase ends with a login page that works, a dashboard that shows the user's role and tenant, and administrators who can create warehouses and users. There is no document upload, no artificial intelligence, no workflow. The phase takes roughly two weeks.

The second phase builds the document workflow without artificial intelligence. This means the `UploadAttempt` and `Document` models without the artificial intelligence fields, the configurable finite state machine engine, the document type configuration file with at least three document types defined, the upload endpoint without validation, the confirm endpoint, the transition endpoint, the list and retrieve endpoints, the tenant-scoped queryset helpers, and the basic React dashboards for depositor, staff, manager, and chief executive officer. This phase ends with a document flowing from upload through all four approval stages purely through human action, with the audit trail recording every transition. There is no optical character recognition, no classification, no server-sent events, and no notifications. The phase takes roughly two weeks.

The third phase adds the notification system and the server-sent event infrastructure. This means the `NotificationPreference` and `NotificationEvent` models, the dispatcher subscribed to the `document_transitioned` signal, the email and short message service Celery tasks, the server-sent event publishing helpers, and the stream endpoint, plus the frontend components for the notification dropdown and the notification preferences page. This phase ends with every workflow transition producing visible notifications on the recipients' dashboards, with opted-in recipients receiving emails. The phase takes roughly one to two weeks.

The fourth phase adds artificial intelligence. This means the service interfaces and mock implementations, the Google Vision, Groq, and OpenAI provider implementations, the Celery artificial intelligence pipeline chain, the validation flow for pre-submission, the reclassification flow for staff corrections, the pgvector integration, and the semantic search endpoint. The user interface adds the split-screen review panel for staff, manager, and chief executive officer, the upload progress indicator using server-sent events, and the search interface. This phase ends with documents being automatically classified, extracted, reviewed, and embedded, with staff seeing the artificial intelligence review alongside the document and being able to correct it. The phase takes roughly three weeks.

The fifth phase adds reporting, ranking, and the regulatory layer. This means the `WarehouseRanking` model, the rule-based ranking computation, the artificial intelligence-based explanation, the nightly Celery Beat job, the on-demand recompute endpoint with rate limiting, the report generation endpoints for document counts and trends, the regulator jurisdiction model and queryset helpers, the regulator dashboard, and the regulatory application programming interface with key-based authentication. This phase ends with a complete system. The phase takes roughly two to three weeks.

The total build time is therefore in the range of ten to twelve weeks for a single developer working full-time, or shorter with a small team. The phases are ordered so that each one produces something demonstrable to the client, which matters for maintaining momentum and catching misunderstandings early.

---

## Part Fourteen: Decisions Log

This section records every architectural decision that has been made, when it was made, and why. The log exists so that future conversations with Copilot, Codex, or Claude Opus do not reopen settled questions and so that new developers joining the project understand the reasoning behind the current shape of the code.

The decision to use Django Ninja instead of Django Rest Framework for the application programming interface surface was made because the `secured_SRS` reference project uses Django Ninja and the developer wants to preserve the same patterns. Django Rest Framework's `rest_framework_simplejwt` is still used for token generation.

The decision to use pgvector instead of ChromaDB or a dedicated vector database was made because the system is already using PostgreSQL for everything else, because pgvector transactions are atomic with the rest of the database, because one fewer service to operate is one fewer thing that can break, and because pgvector's performance is sufficient for the scale this system will operate at.

The decision to use a three-outcome validation gate, a fully-configurable correction flow, user-preference-driven notifications, artificial intelligence re-extraction on reclassification, jurisdiction-scoped regulators, nightly-plus-on-demand ranking, and a configurable finite state machine engine was made jointly between the developer and Claude during the design phase, based on the full context of the client's specification, the developer's architectural instincts, and the realities of government document processing in Tanzania.

The decision to use a file-based document type configuration during early development and move to a database-backed configuration later was made because file-based configuration is easier to version control, easier to review, easier for Copilot and Codex to read as context, and because the scope of changes during the early build warrants the simplicity of a file.

The decision to make upload attempts a separate model from documents was made because it cleanly separates the pre-validation staging area from the committed workflow, because it allows a nightly cleanup job to remove abandoned attempts without affecting real documents, and because it makes the state transition from staging to committed explicit rather than implicit.

The decision to split the artificial intelligence pipeline into five separate Celery tasks rather than one large task was made because failures in one step should not lose the work of earlier steps, because the chain can be re-run from a specific point when the staff corrects the classification, and because each step has a clear single responsibility that is easier to test and evolve independently.

---

## Part Fifteen: Open Questions

This section records the questions that are still open and will need to be resolved as the build progresses. Each question includes enough context that it can be discussed productively without rereading the entire document.

The first open question concerns whether regulatory application programming interface keys should be tenant-scoped or jurisdiction-scoped. A tenant-scoped key means the regulatory body manages its own keys through its own tenant in the system. A jurisdiction-scoped key means each key is directly tied to a jurisdiction and is issued by an administrator. The decision depends on how the client wants to onboard regulatory bodies. This is not a pressing question because the regulatory application programming interface is not in the first three phases.

The second open question concerns the exact structure of the ranking rule-based components. The rules mentioned in the specification include document completeness score, inspection pass or fail, number of rejected documents, number of delayed submissions, certificate validity, number of compliance issues, and pending correction count. Each rule needs a specific computation algorithm and a weight in the final score. The weights matter because they determine whether the ranking reflects the regulator's priorities. This question needs to be resolved before the fifth phase, and it probably requires a conversation with the actual regulator to calibrate.

The third open question concerns whether the system should support document versioning when a depositor resubmits a document after correction. Two approaches are possible. The first approach is to overwrite the existing document and file, keeping only the workflow transition history as the record of change. The second approach is to create a new document version linked to the old one, preserving both files. The second approach is more rigorous but adds complexity. The decision can be deferred until the second phase reveals whether the simple approach is acceptable.

The fourth open question concerns internationalization. The system is being built for Tanzania, where Swahili and English are both common. The artificial intelligence prompts can handle both languages, but the user interface strings and the notification messages need explicit translation. This question can be deferred until the fifth phase but should be raised before deployment.

The fifth open question concerns audit export. The workflow transition table is the audit trail, but regulators or auditors may want to export it as a portable document format or comma-separated values file. The format and the filtering options for export need to be defined, probably during the fifth phase.

The sixth open question concerns fraudulent operational records. Handling of fraudulent operational records — inspection forms and warehouse receipts that should be marked invalid rather than corrected — is unsolved. Revisit if it comes up in testing or client conversations.

---

---

## Part Sixteen: Frontend Design System

### The Three-Experience Design Strategy

The system has one design language but three distinct experiences that compose the same design tokens differently for radically different users. Recognizing this up front prevents the common mistake of building one dashboard and then trying to shoehorn every role into it, which results in depositors wading through operational chrome they do not need and regulators drowning in transactional detail that is not their concern.

The first experience is the **operational experience**, used by staff, managers, and chief executive officers. It is desktop-first, information-dense, keyboard-friendly, and built around a list-plus-detail layout that Linear popularized. Staff will spend hours a day in this interface processing documents, so every design decision optimizes for speed of scanning, predictability of layout, and zero cognitive surprise. Managers and chief executive officers use the same shell but land on dashboard pages with metric cards and approval queues rather than raw document lists.

The second experience is the **depositor experience**, used by warehouse customers submitting documents. It is mobile-first, card-based, deliberately minimal, and built around a single primary action at a time. The mental model is closer to M-Pesa or a mobile banking app than to an operational dashboard. The depositor should never see a sidebar full of navigation options. They see a greeting, a clear upload button, a stack of their recent documents showing current status, and nothing else. The design language here leans on generous padding, larger tap targets, and a short vertical rhythm because the user is often on a phone with one thumb.

The third experience is the **regulator experience**, used by regulatory officers monitoring warehouses within their jurisdiction. It is desktop-first like the operational experience but structured like an executive dashboard rather than a task queue. The landing page is a ranked list of warehouses with key metrics and risk indicators, each drillable into a detail page. The design language borrows from multi-entity operational dashboards like Carta and Datadog, with metric cards at the top, sparklines for trend visualization, and strong typographic hierarchy separating headline numbers from supporting detail.

The three experiences share identical design tokens, identical typography, identical component atoms, and identical interaction grammar. What differs is composition. The depositor sees one card stacked under another with vertical breathing room; the staff sees forty rows in a table with tight vertical rhythm; the regulator sees a ranked list with embedded data visualization. The atoms are the same; the organisms are deliberately different.

### Design Tokens

#### Typography

The typographic system is IBM Plex, a typeface family designed by IBM for institutional applications. It is free, distinctive, well-supported in Swahili and other African languages through its Latin Extended coverage, and has excellent tabular numerals which matter enormously for the table-heavy operational screens.

The body and interface font is **IBM Plex Sans**. It is used for every piece of running text, every form label, every navigation item, and every table cell. Its tabular-figures feature is enabled globally so numbers align vertically in tables, which a non-tabular font would mangle. The serif companion **IBM Plex Serif** is reserved for one specific purpose: rendering the title and body of actual uploaded document content when it is shown in an ingested or previewed form inside the interface. The rationale is contextual rather than decorative. The documents this system processes are literal documents, and a serif visually signals "this is the document itself" as distinct from interface chrome. IBM Plex Serif appears nowhere else. **IBM Plex Mono** is used for document identifiers, reference numbers, and any monospace context such as audit log entries or JSON previews.

The type scale uses a minor-third ratio starting from a sixteen-pixel base, which gives a predictable progression of sizes without too many options. The scale is twelve pixels for captions and table metadata, fourteen pixels for table body and form hints, sixteen pixels for the interface body, nineteen pixels for emphasized body and card headings, twenty-three pixels for section headings, twenty-eight pixels for page titles, and thirty-six pixels for dashboard headline numbers such as the big metric at the top of a regulator dashboard. Line heights are one-point-five for running body text, one-point-four for smaller text, and one-point-two for display sizes. Letter spacing is slightly negative on display sizes for visual tightening and zero elsewhere.

Font weights used are regular at four hundred, medium at five hundred, and semibold at six hundred. Bold at seven hundred is used only for dashboard headline numbers. Italics are used only for placeholder text in form fields and for citations inside the document content preview.

#### Color System

The color system is built around one dominant brand color, a warm neutral palette, and a restrained set of muted semantic colors for status.

The primary brand color is a deep teal at hex value `#0F4C5C`. It is used for primary buttons, active navigation states, focus rings, link text, and the single prominent brand element in each experience. The hover and active states deepen slightly to `#0B3A47` on press and brighten to `#1C6E8C` on hover. The rationale for teal rather than navy blue is that every government system in the world defaults to navy blue, and we can differentiate without sacrificing institutional feel.

The accent color is a warm terracotta at `#B8734A`, used sparingly for emphasis where a second color is needed, such as a new-badge pill on an unread notification, a chart series differentiation, or a decorative divider on the regulator dashboard. It is never used for interactive elements. The rationale for terracotta is that it echoes the earth tones of Tanzania's landscape and soil without being literal, giving the system a faint sense of place without being nationalistic.

The neutral palette is warm rather than cool. The canvas background is `#FAFAF7`, a warm off-white that reads as paper rather than sterile white. Cards sit on pure white at `#FFFFFF`. Borders and dividers are `#E5E3DC`. Text is `#1A1A1A` for primary content, `#5C5A52` for secondary content, and `#8B897F` for tertiary content like timestamps and metadata. Disabled states use `#B8B6AC` against the canvas. The warm-grey choice matters because pure greys read as cold and clinical, which is the opposite of the institutional-but-human tone we want.

The semantic status colors are deliberately muted to avoid visual assault when a staff member is scanning dozens of documents. Success green is `#2F855A` on a `#E6F4EA` background. Warning amber is `#B7791F` on `#FEF3E2` background. Error red is `#9B2C2C` on `#FEE7E6` background. Information blue is `#2C5282` on `#E3F0FC` background. These colors are used for status badges, inline alerts, and nothing else. The strong saturated versions of these colors never appear in the interface.

#### Spacing and Rhythm

The spacing scale is a strict four-pixel grid with eight-pixel as the default step. The scale exposes four, eight, twelve, sixteen, twenty-four, thirty-two, forty-eight, sixty-four, and ninety-six pixels. Eight-pixel increments dominate; four-pixel increments are used only for tight spacing inside components like button padding. The operational screens use tight density with sixteen-pixel default gutters. The depositor screens use generous density with twenty-four to thirty-two-pixel gutters. The regulator screens use moderate density with twenty-pixel to twenty-four-pixel gutters.

Border radius is four pixels for inputs, buttons, and small elements, eight pixels for cards and panels, and never larger. Pill-shaped buttons and rounded-full avatars are the only exceptions. Sharp corners read as serious; overly rounded corners read as consumer-playful.

Shadow is used minimally. There is a small shadow for cards resting on the canvas, a medium shadow for dropdown menus and popovers, and a large shadow for modal dialogs. The small shadow is `0 1px 2px rgba(26, 26, 26, 0.04), 0 1px 1px rgba(26, 26, 26, 0.03)`. Shadows are never colored; they are always a low-alpha near-black.

#### Motion

Motion is almost absent and deliberately so. Transitions run at one hundred fifty milliseconds with an `ease-out` curve. Hover states transition color only. Panels that expand or collapse transition height smoothly but without bounce. Loading spinners are minimal and spin at a steady rate without any flourish. There are no parallax effects, no scroll animations, no entrance animations on page load, and no micro-interactions that reward the user for mousing over elements. The only deliberate motion is the one-time progressive reveal of the server-sent event stream during upload validation, where each stage of the pipeline appears with a short fade as it becomes relevant. That single moment is the only place motion carries meaning; everywhere else it would be noise.

### Component Library Foundation

The foundation for the React component library is **shadcn/ui** configured with our design tokens. The rationale is that shadcn/ui is not a dependency in the traditional sense; it is a set of components that get copied into the project and become part of the codebase, which means we have full control over every component without fighting a library's defaults. The components use Radix UI primitives underneath for accessibility, which saves weeks of work on keyboard navigation, screen reader support, and focus management that a government system must get right.

The components we customize heavily from shadcn/ui defaults are the Button, Badge, Input, Select, Dialog, Dropdown Menu, Table, Tabs, and Card. The Button has four variants — primary in brand teal, secondary in bordered neutral, ghost for tertiary actions, and destructive in muted red. The Badge has the four semantic variants plus a neutral variant for tags and keywords. The Table is the most important component; it uses IBM Plex Sans with tabular numerals enabled, sixteen-pixel body text, tight vertical rhythm, and sticky headers. Rows are hoverable with a subtle background shift and clickable where appropriate.

Custom components we build on top of the foundation include the **DocumentCard** for depositor view, the **DocumentRow** for operational tables, the **StatusTimeline** showing a document's transition history visually, the **AIReviewPanel** which renders the artificial intelligence's extracted fields as editable form inputs with confidence indicators, the **WarehouseRankCard** for the regulator dashboard, the **NotificationItem** for the notification dropdown, the **UploadDropzone** with server-sent event progress, and the **MetricCard** used at the top of manager, chief executive officer, and regulator dashboards.

### The Operational Shell

The operational shell is the layout that wraps every staff, manager, chief executive officer, and admin page. It consists of a fixed top bar, a fixed left sidebar, and a scrollable main content area. The top bar is forty-eight pixels tall and contains the organization logomark on the left, the global search input in the center that opens the command palette when clicked or activated with a keyboard shortcut, and the notification bell and user menu on the right. The sidebar is two hundred forty pixels wide by default and collapsible to sixty pixels showing icon-only navigation. The main content area has a maximum width of fourteen hundred pixels on very large screens to keep line lengths readable, and sits inside thirty-two pixel horizontal padding on standard desktops.

The sidebar navigation is role-filtered. A staff member sees Dashboard, Pending Review, My Warehouse Documents, Search, and Notifications. A manager sees Dashboard, Pending Approvals, All Warehouse Documents, Search, Reports, and Notifications. A chief executive officer sees Dashboard, Final Approvals, All Documents, Search, Reports, Analytics, and Notifications. An admin sees Users, Warehouses, Document Types, System Settings, Audit Log, and Notifications. The items the user sees are driven entirely by their role permissions, not hardcoded per role, so new permissions automatically show up in the right sidebars.

The landing page for each operational role is a dashboard composed of metric cards at the top, a primary work queue in the middle, and a recent activity feed at the bottom. For staff, the metric cards show Pending Review, Processed Today, Corrections Requested. For managers, they show Pending Approval, Approved This Week, Rejected This Week, Average Approval Time. The chief executive officer sees aggregated tenant-wide metrics. Below the metric cards, the primary work queue is the most pressing list for that role; for staff it is the documents awaiting their review, for managers it is the documents awaiting approval. The recent activity feed shows the last ten workflow transitions in the user's scope.

### The Document Review Screen

The document review screen is the single most important interface in the system because it is where humans and artificial intelligence actually collaborate. It is used by staff, managers, and chief executive officers with small variations. The screen is a split layout with the actual uploaded document on the left and the artificial intelligence review with actions on the right. The split is sixty percent document, forty percent review panel on typical monitors, adjustable via a drag handle.

The left panel renders the document using a portable document format viewer for portable document format files and a zoomable image viewer for images. Page navigation appears as thumbnails in a narrow strip at the bottom. Zoom controls, fit-to-width, and fit-to-page sit in a small toolbar at the top of the document panel. The document is never modified in this view; it is read-only.

The right panel has four vertically stacked sections. The first section is a header showing the document's title, type, current status as a badge, and the uploader's name. The second section is the artificial intelligence review, which begins with a one-paragraph summary in regular body text, followed by the extracted fields as a list of editable form inputs. Each field shows a label, the artificial intelligence's extracted value, and a confidence badge in one of four tiers — high confidence with a green badge, medium confidence with an amber badge, low confidence with a red badge, or not detected with a grey badge. Staff can click any field to edit it, and edited fields show a small dot indicator so the manager later sees at a glance which fields the human overrode. The third section is the history of prior workflow transitions shown as a vertical timeline with actor, action, timestamp, and any reason given. The fourth section is the action bar, sticky to the bottom of the panel, with the buttons available at this state for this role. For staff reviewing, the buttons are Confirm and Send Back. For managers, they are Approve, Reject, and Send Back. For chief executive officers, they are Final Approve, Reject, and Send Back. The Send Back button opens a dialog asking for the target role and a reason.

The artificial intelligence review panel has one special behavior that matters. When staff changes the document's classification to a different type from a dropdown at the top of the extracted fields section, the system immediately calls the reclassification endpoint in the background, which triggers the partial re-run of the pre-review chain for extraction and review. While that runs, the extracted fields section shows a subtle loading state, and when the new extraction completes the fields repopulate with the new type's required fields. This keeps staff in a reviewing posture throughout the process.

### The Depositor Experience

The depositor experience is intentionally small. There is no sidebar. The top bar is simplified to the logomark, a notification bell, and the user menu. The body of every page is a centered column with a maximum width of five hundred twenty pixels on desktop and the full viewport minus sixteen-pixel gutters on mobile. The pages are kept few — a home page, an upload page, a document detail page, a downloads page, and a profile page.

The home page greets the depositor by name, shows a prominent upload button, and lists the depositor's last five documents as stacked cards. Each card shows the document title, type, current status as a badge, and the date of the last status change. Tapping a card opens the document detail page. Tapping the upload button opens the upload flow.

The upload flow is the one place where the depositor experience needs to shine. The user picks a document type from a short list rendered as selectable cards with icons representing each type, uploads the file using a tap-friendly dropzone that is also a button, and then watches the real-time validation progress as a vertical list of stages that light up one after another. If the validation passes, the user sees a success screen with a confirmation message and a button to return home. If the validation soft-warns, the user sees the warnings listed clearly and two options — fix and re-upload, or submit anyway with the known issues. If the validation hard-rejects, the user sees the reason and a single retry button.

The document detail page for a depositor shows the document title, the current status, a vertical timeline of every transition the document has been through, and if the status is CORRECTION_NEEDED a prominent panel explaining why the document was sent back and what needs to be corrected, with a button to upload a corrected version. The depositor can also download their document from this page if it has been approved.

The downloads page is a simple list of every approved document the depositor has, filterable by date and type, each row with a download button that fetches the file.

### The Regulator Experience

The regulator experience is built around monitoring and drilling. The top bar and sidebar follow the operational shell structure but the sidebar items are Dashboard, Warehouse Rankings, Approved Documents, Inspection Reports, Analytics, and Notifications.

The dashboard landing page is the single most important regulator screen. At the top it shows four metric cards: warehouses in jurisdiction, high-risk warehouses, average compliance score, and inspections this quarter. Below the metric cards is the warehouse rankings section, which is a sortable list of every warehouse in the regulator's jurisdiction ranked by compliance score, each row showing the warehouse name, region, score, risk category as a colored badge, and a small sparkline showing the score trend over the last six months. Clicking any row drills into the warehouse detail page, which shows the full breakdown of contributing factors, the artificial intelligence-generated explanation of why the warehouse scored where it did, a list of the warehouse's recent documents, and a list of inspection reports. Below the rankings section on the dashboard, a trend chart shows aggregate compliance scores across the jurisdiction over time.

The regulator has a prominent button to trigger on-demand ranking recomputation, rate-limited to once per hour, which kicks off a recomputation task and shows a loading state until the new scores are ready.

### Accessibility

The system targets Web Content Accessibility Guidelines two-point-one level double-A compliance. This is a government system and accessibility is both a legal consideration and a correctness consideration. All interactive elements are reachable by keyboard with visible focus rings in the brand teal at three-pixel thickness. Color alone never conveys state — every status badge has both a color and a textual label, and every error state has both color and an icon. Contrast ratios meet four-point-five-to-one for body text and three-to-one for large text and interface elements. Form labels are always visible and associated with their inputs via the `for` attribute. Dynamic updates such as the server-sent event progress stream announce themselves to screen readers via `aria-live` regions. The portable document format viewer falls back to a downloadable link when the embedded view is not accessible.

### Internationalization

The system must support both English and Swahili from day one of deployment, even though phase-one development can proceed in English only. Every user-facing string is wrapped in a translation function from the start, even before Swahili translations exist, so retrofitting later is a translation exercise and not a code-rewriting exercise. The translation library is `react-i18next` on the frontend and Django's built-in internationalization on the backend. The user's language preference is stored on their `UserProfile` and respected globally, including in email and short message service notification content. Date, number, and currency formatting use the `Intl` family of browser APIs with locale set from the user's preference.

### Dark Mode Policy

The system does not support dark mode in the first release. This is a deliberate decision rather than a deferred one. Dark mode done well doubles the design work for every component, and dark mode done poorly harms readability in a system where document content must render with maximum legibility. We revisit the decision only after the full light-mode system is deployed and stable. When we revisit, we either commit to a full, polished dark mode or we do not; we do not ship half a dark mode.

### The Visual Reference Board

A companion artifact to this document is `warehouse_dms_visual_reference.html`, a single self-contained page that renders the design tokens, component examples, and miniature screen layouts described in this section. The reference board is the concrete embodiment of every decision made above. When a developer or coding assistant is uncertain about a visual detail, the reference board shows the answer directly rather than requiring the reader to interpret prose. The file is meant to be opened in a browser during development, kept as a living artifact alongside the code, and updated whenever the design system evolves.

---

## Appendix A: How to Use This Document with Coding Assistants

When working with Copilot or Codex, open this document alongside the code file you are editing. The assistants read the open documents as context and use them to produce code that matches the conventions established here. For complex tasks, paste the relevant section of this document directly into the chat before asking for code.

When working with Claude Opus in a fresh conversation, paste the entire document into the first message along with the specific task you want help with. The document is long enough that it consumes significant context space, but the consistency it produces is worth the cost. For smaller tasks, paste only the relevant sections, such as just the data models section when asking for migrations.

When updating this document, keep the structure and the prose style. The prose is not decoration; it is the teaching layer that makes the document usable by humans and assistants alike. Bullet lists work for quick references but they strip the reasoning that makes the document survive over months of building.

When in doubt about a decision, search this document first. If the decision is here, follow it. If the decision is not here, open a conversation to resolve it, then update the document with the outcome before writing code. This discipline is what keeps the project coherent.

---

## Appendix B: Glossary

**Artificial Intelligence Pre-Review** refers to the Celery chain that runs after a document is committed to the workflow, producing classification, extraction, scoring, review, and embedding results.

**BaseModel** refers to the abstract Django model that provides `primary_key`, `unique_id`, `created_date`, `updated_date`, `is_active`, and `created_by` to every concrete model. Defined in `wdms_utils/BaseModel.py`.

**Depositor** refers to the role that uploads documents to the warehouse system. Typically a customer of the warehouse rather than an employee.

**Document Type Configuration** refers to the JSON file at `wdms_documents/config/document_types.json` that defines every document type, its allowed transitions, its required fields, and its validation rules.

**Finite State Machine Engine** refers to the engine at `wdms_documents/fsm/engine.py` that validates and executes document state transitions.

**Hard Reject, Soft Warning, and Pass** are the three outcomes of the pre-submission validation gate.

**Human-in-the-Loop** refers to the pattern where artificial intelligence produces output and a human reviews, corrects, and confirms it before the output becomes an official action.

**Jurisdiction** refers to a regulator's scope of authority, either a specific region or the national scope.

**Pre-Submission Validation** refers to the synchronous-from-the-user-perspective validation that runs before a document is committed to the workflow.

**Regulator** refers to the role that represents a regulatory body user, scoped by jurisdiction rather than by tenant.

**Server-Sent Events** refers to the one-way streaming protocol used to push real-time validation progress from the Celery worker to the frontend during upload.

**Soft Warning Override** refers to the depositor's choice to submit a document despite the artificial intelligence flagging soft warnings, which causes the document to enter the workflow with a flag for extra staff attention.

**Tenant** refers to an institution or organization that owns one or more warehouses. Every non-regulator user belongs to exactly one tenant.

**Upload Attempt** refers to a record of a file that has been uploaded but has not yet passed pre-submission validation. Either promoted to a Document or cleaned up.

**Warehouse** refers to a single physical warehouse facility. Belongs to a tenant and a region.

**Workflow Transition** refers to a state change on a document, recorded as an audit log entry with the actor, action, reason, and any edits.
