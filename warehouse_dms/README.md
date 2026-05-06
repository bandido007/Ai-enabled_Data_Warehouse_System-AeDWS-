# Warehouse Document Management System — Backend

AI-enabled warehouse document management system built with Django 5 + Django Ninja + PostgreSQL/pgvector.

---

## Quick start (Docker Compose)

### Prerequisites
- Docker Desktop ≥ 4.x
- Docker Compose plugin (bundled with Docker Desktop)

### 1. Clone and enter the project

```bash
git clone <repo-url>
cd warehouse_dms
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

| Variable | Description |
|---|---|
| `SECRET_KEY` | Random Django secret key |
| `SIGNING_KEY` | JWT signing key |
| `DEFAULT_SUPER_PASS` | Admin account password |
| `DATABASE_URL` | Keep as-is for Docker Compose |
| `REDIS_URL` | Keep as-is for Docker Compose |

### 3. Build and start all services

```bash
docker compose up --build
```

Services started:
- **web** — Django/Uvicorn on host port 8001
- **db** — PostgreSQL 16 with pgvector on host port 5433
- **redis** — Redis 7 on host port 6380

If these defaults do not suit your machine, set `WEB_HOST_PORT`, `POSTGRES_HOST_PORT`,
and `REDIS_HOST_PORT` in `.env` before starting Compose.

### 4. Run database migrations

In a second terminal while `docker compose up` is running:

```bash
docker compose exec web python manage.py migrate
```

The migration for `wdms_tenants` automatically seeds 10 Tanzania administrative regions.

### 5. Seed roles and permissions

```bash
docker compose exec web python manage.py seed_permissions
```

This creates:
- 6 default roles: `ADMIN`, `DEPOSITOR`, `STAFF`, `MANAGER`, `CEO`, `REGULATOR`
- All declared permission codes, grouped by category
- The superuser admin account (credentials from `.env`)

### 6. Verify the API is up

Open your browser at:

- **API docs (Scalar):** http://localhost:8001/api/v1/docs
- **Django admin:** http://localhost:8001/admin

---

## Local development (without Docker)

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt

# Create a local .env pointing to a local Postgres instance
cp .env.example .env
# Edit DATABASE_URL and REDIS_URL to point to local services

python manage.py migrate
python manage.py seed_permissions
python manage.py runserver
```

---

## API overview

All endpoints live under `/api/v1/`. Authentication uses AES-wrapped JWT tokens.

| Router prefix | Description |
|---|---|
| `/api/v1/auth/` | Login, Google login, role management |
| `/api/v1/accounts/` | Registration, verification, profile management |
| `/api/v1/tenants/` | Tenants, regions, warehouses |

### Authentication flow

1. `POST /api/v1/auth/login` → returns `access` + `refresh` tokens (AES-encrypted)
2. Send subsequent requests with `Authorization: Bearer <access_token>`

---

## Management commands

| Command | Description |
|---|---|
| `manage.py migrate` | Apply all schema migrations |
| `manage.py seed_permissions` | Create roles, permissions, and admin user |
| `manage.py createsuperuser` | Create an additional Django admin user |
| `manage.py reprocess_document <id>` | Re-run the AI pre-review chain for a document (use `--reset` to clear AI fields first, `--sync` to run inline) |

---

## Phase 4 — AI services configuration

The AI pipeline runs through three abstract interfaces (`OCRServiceInterface`,
`LLMServiceInterface`, `EmbeddingServiceInterface`) wired by
`wdms_ai_pipeline/services/registry.py`. The registry returns either the
real Google Cloud providers or offline mocks based on `USE_MOCK_AI_SERVICES`.

### Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Absolute path to the service-account JSON. Used by both Vision and Vertex AI. |
| `GOOGLE_CLOUD_PROJECT` | — | The GCP project ID. Required when `USE_MOCK_AI_SERVICES=false`. |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | Vertex AI region (e.g. `us-central1`, `europe-west4`). |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model used for classification, extraction, validation, review, ranking explanations. |
| `VERTEX_EMBEDDING_MODEL` | `text-embedding-004` | Embedding model. Produces 768-dimensional vectors — pgvector column dimension must match. |
| `USE_MOCK_AI_SERVICES` | `false` | Set to `true` to run the full pipeline end-to-end without any GCP credentials. |

### Service-account roles

Create a service account in your GCP project and grant it:

- `roles/aiplatform.user` — Vertex AI Gemini and embedding model access
- `roles/cloudvision.user` — Google Cloud Vision OCR

Download a JSON key for the service account and point
`GOOGLE_APPLICATION_CREDENTIALS` at it. Both `google-cloud-vision` and
`google-cloud-aiplatform` automatically pick up this variable.

### Running with mocks (no credentials needed)

Set `USE_MOCK_AI_SERVICES=true` in `.env` and the registry returns
deterministic, offline mocks for OCR, LLM, and embeddings. Mock embeddings
are 768-dim normalised vectors so semantic search returns sensible orderings
without ever hitting Vertex AI. This is the default in the local `.env`.

### Embedding dimension change

`Document.embedding` is `vector(768)` to match `text-embedding-004`. The
migration `0002_resize_embedding_768_and_index.py` drops the old 1536-dim
column and re-adds it at 768 with an IVFFlat cosine-ops index. Any
embeddings stored under the old column are erased — run
`manage.py reprocess_document <id>` to backfill.

---

## Project structure

```
warehouse_dms/          ← Django project root
├── warehouse_dms/      ← Project package (settings, urls, celery)
├── wdms_utils/         ← Shared utilities, BaseModel, ResponseObject
├── wdms_uaa/           ← Auth & authorisation (JWT, RBAC)
├── wdms_accounts/      ← User profiles, registration, password reset
├── wdms_tenants/       ← Tenants, regions, warehouses
├── wdms_documents/     ← Phase 2: document lifecycle
├── wdms_ai_pipeline/   ← Phase 4: AI extraction pipeline
├── wdms_notifications/ ← Phase 3: notification preferences
├── wdms_reports/       ← Phase 5: reporting
├── wdms_regulatory/    ← Phase 5: regulatory dashboard
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── .env.example
```

---

## Phase roadmap

| Phase | Scope |
|---|---|
| **1 (current)** | Skeleton: auth, RBAC, accounts, tenants |
| **2** | Document upload lifecycle, UploadAttempt |
| **3** | Celery tasks, email notifications |
| **4** | AI extraction pipeline (pgvector, semantic search) |
| **5** | Reporting, regulatory dashboard, ranking |
