# secured_SRS — Reference Patterns for the Warehouse DMS

**Purpose:** This document captures the architectural patterns of the `secured_SRS` project so that Copilot, Codex, and Claude Opus can reproduce them faithfully when building the warehouse DMS. Attach this file to every backend-phase session alongside `WAREHOUSE_DMS_FOUNDATION.md` and `warehouse_dms_visual_reference.html`.

**What this document is:** the architectural fingerprint of the reference project — app layout, import conventions, the exact shape of every reusable utility, the layering between authentication/authorization/user-management, the Ninja router pattern, and enough representative view code for an assistant to generate new views in the same voice.

**What this document is not:** a line-by-line reproduction of every file. Migrations, admin registrations, and boilerplate are omitted because they add noise without adding signal. Assistants can generate those mechanically once they know the patterns.

---

## Part 1 — Project Layout

The reference project is structured as a Django 5 project with Django Ninja as the API framework. Each app is prefixed with `srs_` and owns one clear responsibility.

```
secured_SRS/
├── manage.py
├── .env
├── response.json                      # ResponseObject code definitions (see §3)
├── requirements.txt
│
├── secured_SRS/                       # Project package
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py                        # Ninja + DRF SimpleJWT wiring
│   ├── srs_api_v1.py                  # NinjaAPI aggregator — all routers mount here
│   ├── asgi.py
│   └── wsgi.py
│
├── srs_utils/                         # Shared utilities — the foundation layer
│   ├── BaseModel.py                   # Abstract base for every domain model
│   ├── SharedSerializer.py            # Schema envelopes, camelCase, pagination shapes
│   ├── response.py                    # ResponseObject + get_paginated_and_non_paginated_data
│   ├── permissions.py                 # Declarative permission + role definitions
│   ├── CreateUserAddSeedPermissions.py  # Runtime seeder
│   ├── encryption.py                  # AESCipher for JWT token encryption
│   ├── tokens.py                      # secrets-based token generation
│   ├── email.py                       # SMTP + Jinja2 email sender
│   ├── general.py                     # Small date helpers
│   └── management/commands/
│       └── seed_permissions.py        # Manual re-seed command
│
├── srs_uaa/                           # User Authentication & Authorization
│   ├── models.py                      # UserPermissionsGroup, UserPermissions,
│   │                                  # UserRoles, UserRolesWithPermissions,
│   │                                  # UsersWithRoles, LoginAttempt
│   ├── serializers.py                 # Login, role, and permission schemas
│   ├── views.py                       # auth_router — login + role management
│   │
│   ├── authentication/                # "Who are you?" layer
│   │   ├── services.py                # AuthenticationService (token validation + login)
│   │   ├── user_management.py         # UserManagementService (account provisioning)
│   │   ├── google_auth.py             # GoogleAuth token verifier
│   │   └── middleware.py              # LoginAttemptsMiddleware (rate limiting)
│   │
│   └── authorization/                 # "What can you do?" layer
│       ├── __init__.py                # exposes PermissionAuth + AuthorizationService
│       ├── services.py                # AuthorizationService (permission checks)
│       └── auth_permission.py         # PermissionAuth (Ninja HttpBearer handler)
│
├── srs_accounts/                      # User profiles + account lifecycle
│   ├── models.py                      # UserProfile, ForgotPasswordRequestUser,
│   │                                  # ActivateAccountTokenUser
│   ├── serializers.py
│   └── views.py                       # accounts_router — register, verify, profile
│
└── srs_domain/                        # The actual business domain
    ├── models.py                      # Student, Lecturer, Course, Enrollment,
    │                                  # CourseResults, AcademicTranscript, etc.
    ├── serializers.py                 # Table / Input / Filtering / Paged / NonPaged per entity
    ├── views.py                       # domain_router — CRUD + business operations
    ├── services/                      # Domain services (see §8 for the pattern)
    │   ├── academic_record_service.py
    │   ├── interfaces/                # Abstract service contracts
    │   │   ├── cryptography_service.py
    │   │   ├── blockchain_service.py
    │   │   └── storage_service.py
    │   └── mocks/                     # Mock implementations for dev/test
    │       ├── mock_crypto.py
    │       ├── mock_blockchain.py
    │       └── mock_storage.py
    └── management/commands/           # Ad-hoc maintenance scripts
```

**Key layering principle:** `srs_utils` knows nothing about the domain. `srs_uaa` imports from `srs_utils`. `srs_accounts` imports from `srs_utils` and `srs_uaa`. `srs_domain` imports from all three. Dependencies flow in one direction. An assistant generating new code should preserve this flow — utilities never import from domain apps.

**For the warehouse DMS**, the equivalent app tree (per the foundation document) is:

```
wdms_utils → wdms_uaa → wdms_accounts → wdms_tenants → wdms_documents → wdms_ai_pipeline
                                                                       → wdms_notifications
                                                                       → wdms_reports
                                                                       → wdms_regulatory
```

---

## Part 2 — BaseModel (Every Domain Model Inherits This)

**File:** `srs_utils/BaseModel.py`

```python
import uuid
from django.db import models
from django.contrib.auth.models import User


class BaseModel(models.Model):
    primary_key = models.AutoField(primary_key=True)
    unique_id = models.UUIDField(editable=False, default=uuid.uuid4, unique=True)
    created_date = models.DateField(auto_now_add=True)
    updated_date = models.DateField(auto_now=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, null=True)

    @property
    def id(self):
        return self.primary_key

    class Meta:
        abstract = True
```

**Usage rules for new models:**

- Every concrete model inherits from `BaseModel`. No exceptions.
- The primary key is `primary_key`, not `id`. Django's default `id` is overridden by the property that aliases to `primary_key`. When writing queries, use `pk=<id>` or `primary_key=<id>`. Serializers call `data.pk`, not `data.id`.
- `unique_id` is a UUIDv4 used as the external-facing identifier. It never appears in URLs as the integer pk; it appears in PUT/update payloads so the client can say "update the record with this UUID."
- `created_date` and `updated_date` are `DateField`, not `DateTimeField`. Date-granularity, not second-granularity. For models that need precise timestamps (like `submitted_at` on `CourseResults`), add a separate `DateTimeField` field.
- `is_active = False` is the soft-delete pattern. Every list endpoint filters by `is_active=True` by default through `get_paginated_and_non_paginated_data`.
- `created_by` is the user who created the record. Every view that creates a record sets `created_by=request.user`.

**Always set** `class Meta: db_table`, `ordering`, `verbose_name_plural` in concrete models. The convention is lowercase `db_table` names, ordering by `-primary_key` (newest first) or a domain-meaningful field, and `verbose_name_plural` in ALL CAPS. Example from the reference project:

```python
class Meta:
    db_table = "user_profiles"
    ordering = ["-primary_key"]
    verbose_name_plural = "USER PROFILES"
```

---

## Part 3 — Response Envelope and Pagination

### The Response Envelope

Every API endpoint returns one of two shapes wrapped in a `response` object that indicates success, status, a numeric code, and a message. Success is NOT implied by HTTP 200 — it is communicated by the `response.status` boolean inside the body.

**File:** `srs_utils/response.py`

```python
class ResponseObject:
    id: int = 0
    status: bool = False
    code: int = 9000
    message: str = ""

    def __init__(self, id=id, status=status, code=code, message=message):
        self.id = id
        self.status = status
        self.code = code
        self.message = message

    @staticmethod
    def __read_code_file(code_id):
        file = open("response.json", "r")
        response_codes = json.loads(file.read())
        return next(code for code in response_codes if code["id"] == code_id)

    @staticmethod
    def get_response(id: int, message: str | None = None):
        response_code = ResponseObject._ResponseObject__read_code_file(id)
        return ResponseObject(
            response_code["id"],
            response_code["status"],
            response_code["code"],
            message if message else response_code["message"],
        )
```

**Companion file:** `response.json` at the project root. This is a list of response code definitions keyed by `id`. The values a project uses are:

```json
[
  { "id": 0, "status": false, "code": 4000, "message": "Operation failed" },
  { "id": 1, "status": true,  "code": 2000, "message": "Operation successful" },
  { "id": 2, "status": false, "code": 5000, "message": "Server error" },
  { "id": 3, "status": false, "code": 4040, "message": "Not found" }
]
```

**Usage convention:**

- `ResponseObject.get_response(1)` — success, default message.
- `ResponseObject.get_response(1, "Student created successfully")` — success, custom message.
- `ResponseObject.get_response(0, "Student ID already exists")` — business-rule failure.
- `ResponseObject.get_response(2, str(e))` — server-side exception.
- `ResponseObject.get_response(3, "Student not found")` — lookup miss.

This pattern carries directly into the warehouse DMS. Do not replace it with HTTP status codes. The client parses `response.status` and `response.message`.

### The Pagination Helper

**Same file:** `get_paginated_and_non_paginated_data`. This function is the spine of every list endpoint in the reference project.

```python
def get_paginated_and_non_paginated_data(
    model: Type[T],
    filtering_object: dict | None,
    serializer: schema,
    additional_filters: Q | None = None,
    exclude_filtering_object: Q | None = None,
    custom_look_up_filter: dict | None = None,
    is_paged: bool = True,
    additional_computed_values: dict = None,
    custom_date_field_name: str = "created_date",
    is_custom_date_field_date_time: bool = False,
    **kwargs,
) -> schema:
    # ... full implementation in srs_utils/response.py
```

**What it does:**

1. Accepts either a Model class or an already-filtered QuerySet as the first argument.
2. Reads filtering values from the `filtering_object` (a Pydantic schema from the request).
3. Drops pagination fields (`page_number`, `items_per_page`) and special keys (`search_term`, `start_date`, `end_date`, `time_range`) from the main filter dict.
4. Passes remaining filters straight to `.filter(**filter_dictionary)` as kwargs — this means filter field names must match model field names, OR you pass a `custom_look_up_filter` dict to translate them.
5. Applies `additional_filters: Q` on top if provided.
6. Applies global search across every `CharField` and `TextField` in the model and its direct foreign-key fields (via `apply_search_filter`).
7. Applies date filtering (via `apply_date_filters`) using either explicit start/end dates or a `TimeRangeEnum` (`TODAY`, `THIS_WEEK`, `THIS_MONTH`, `THIS_YEAR`).
8. Forces `is_active=True` unless the caller explicitly sets `is_active` to something else in the filter dict.
9. Paginates with Django's `Paginator` if `is_paged=True`, and wraps the result in a `PageObject` with `currentPageNumber`, `totalElements`, `numberOfPages`, and a full `pagesNumberArray` for the frontend to render a pager.
10. Returns the serializer instance populated with `response=ResponseObject.get_response(1)`, `page=<PageObject>`, and `data=<paginated queryset>`.

**Convention for new views:** pass a pre-filtered queryset instead of the raw Model when you need role-scoping or tenant-scoping. Example from `srs_domain/views.py`:

```python
queryset = Student.objects.select_related('user').all()

if filtering.program:
    queryset = queryset.filter(program__icontains=filtering.program)
if filtering.year_of_study:
    queryset = queryset.filter(year_of_study=filtering.year_of_study)

return get_paginated_and_non_paginated_data(
    queryset,
    filtering,
    StudentPagedResponseSerializer
)
```

In the warehouse DMS, the same pattern applies with `get_tenant_queryset(Document, request)` replacing `Model.objects.all()`.

---

## Part 4 — SharedSerializer (The Schema Foundation)

**File:** `srs_utils/SharedSerializer.py`

Every schema in the project extends one of these bases. They are built on `ninja.Schema` (which is Pydantic under the hood).

### The camelCase Convention

```python
def to_camel(string: str) -> str:
    return "".join(
        word.capitalize() if index > 0 else word
        for (index, word) in enumerate(string.split("_"))
    )
```

Every `Config` subclass sets `alias_generator = to_camel` and `populate_by_name = True`. This means the Python code uses `snake_case` but the JSON surface is `camelCase`. A field named `submitted_at` in Python becomes `submittedAt` in JSON. This is non-negotiable — the frontend expects camelCase.

### The Envelope Schemas

```python
class TimeRangeEnum(str, enum.Enum):
    TODAY = "TODAY"
    THIS_WEEK = "THIS_WEEK"
    THIS_MONTH = "THIS_MONTH"
    THIS_YEAR = "THIS_YEAR"


class UserResponse(Schema):
    username: str = None
    first_name: str = None
    last_name: str = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class ResponseSerializer(Schema):
    id: int
    status: bool
    message: str
    code: int


class PaginationResponseSerializer(Schema):
    number: int = None
    has_next_page: bool = None
    has_previous_page: bool = None
    current_page_number: int = None
    next_page_number: int = None
    previous_page_number: int = None
    number_of_pages: int = None
    total_elements: int = None
    pages_number_array: List[int] | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BasePagedFilteringSerializer(Schema):
    page_number: int | None = None
    items_per_page: int | None = None
    search_term: str | None = None
    unique_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    time_range: TimeRangeEnum | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BaseNonPagedFilteringSerializer(Schema):
    search_term: str | None = None
    unique_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    time_range: TimeRangeEnum | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BaseSerializer(Schema):
    id: int
    unique_id: UUID
    created_date: date
    updated_date: date
    is_active: bool
    created_by: UserResponse | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BaseInputSerializer(Schema):
    unique_id: str | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BasePagedResponseList(Schema):
    response: ResponseSerializer
    page: PaginationResponseSerializer | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BaseNonPagedResponseData(Schema):
    response: ResponseSerializer

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BaseSchema(Schema):
    """Extend this to get the camelCase feature on any bespoke schema."""

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True
```

### The Per-Entity Serializer Pattern

For every domain model, the reference project defines **five serializers**:

1. **`<Entity>TableSerializer(BaseSerializer)`** — what the list/detail endpoints return. Extends `BaseSerializer` so it includes `id`, `uniqueId`, `createdDate`, `updatedDate`, `isActive`, `createdBy`. Uses a Pydantic `@model_validator(mode='before')` to extract fields from the ORM instance into a dict. This pattern is how the reference project handles nested relationships cleanly. See the Student example in §7.

2. **`<Entity>InputSerializer(BaseInputSerializer)`** — the POST/PUT payload. Includes `unique_id: str | None = None` from the base. When `unique_id` is provided and the method is PUT, it's an update; otherwise it's a create.

3. **`<Entity>FilteringSerializer(BasePagedFilteringSerializer)`** — the query-params schema for list endpoints. Adds entity-specific filters on top of the pagination base.

4. **`<Entity>PagedResponseSerializer(BasePagedResponseList)`** — the paginated list response. `data: List[<Entity>TableSerializer] | None = None`.

5. **`<Entity>NonPagedResponseSerializer(BaseNonPagedResponseData)`** — the single-object response. `data: <Entity>TableSerializer | None = None`.

The consistency of this five-serializer pattern is what makes the codebase navigable. Every new entity added to the warehouse DMS follows the same recipe.

---

## Part 5 — Django Ninja API Wiring

### The Aggregator

**File:** `secured_SRS/srs_api_v1.py`

```python
from ninja import NinjaAPI
from django.conf import settings
from scalar_django_ninja import ScalarViewer

from srs_accounts.views import accounts_router
from srs_uaa.views import auth_router
from srs_domain.views import domain_router


api_title = "Secured SRS API"
version = "1.0.0"
description = "Student Record System with layered architecture"

api_v1 = NinjaAPI()
api_v1.docs_url = "docs"
api_v1.docs = ScalarViewer()
api_v1.title = api_title
api_v1.version = version

api_v1.add_router("/accounts/", accounts_router)
api_v1.add_router("/auth/", auth_router)
api_v1.add_router("/domain/", domain_router)
```

**File:** `secured_SRS/urls.py`

```python
from django.contrib import admin
from django.urls import path, include
from ninja import NinjaAPI
from django.conf import settings
from django.conf.urls.static import static
from srs_utils.CreateUserAddSeedPermissions import CreateRolesAddPermissions

from .srs_api_v1 import api_v1

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)


# Force camelCase on every endpoint globally
def set_all_by_alias(api: NinjaAPI):
    for _pth, router in api._routers:
        for view in router.path_operations.values():
            for op in view.operations:
                op.by_alias = True


set_all_by_alias(api_v1)

urlpatterns = [
    path('admin/', admin.site.urls),
    path("api-auth/", include("rest_framework.urls")),
    path("token/access", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("token/verify/", TokenVerifyView.as_view(), name="token_verify"),
    path("api/", api_v1.urls, name="api_v1"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Runtime seeding: re-runs every server start, idempotent
CreateRolesAddPermissions()
```

**Key points:**

- Scalar is used for OpenAPI docs instead of Swagger. Cleaner UI.
- `set_all_by_alias` forces every operation to emit camelCase, which is what makes the `to_camel` alias generator actually take effect on the wire.
- `CreateRolesAddPermissions()` runs on every server boot. It is idempotent — it only creates roles and permissions that don't already exist. This is convenient for development but not ideal for production (where you'd call it once via a management command).
- DRF's `SimpleJWT` views are mounted at `/token/*` and generate raw JWTs. The Ninja `auth_router` `/api/auth/login/` endpoint wraps those tokens with an AES encryption layer (see §6).

### Router Definition Convention

Every app exposes a single router:

```python
# In srs_<app>/views.py
from ninja import Router

<thing>_router = Router()

@<thing>_router.get("/path", response=<ResponseSerializer>)
def handler(request, ...):
    ...
```

The router is imported by `srs_api_v1.py` and mounted at a path prefix.

---

## Part 6 — Authentication, Authorization, and User Management (The Three Layers)

This is the most important architectural decision in the reference project, and it must carry into the warehouse DMS. Three distinct concerns, three distinct services, no mixing.

### Layer 1 — Authentication ("Who are you?")

**File:** `srs_uaa/authentication/services.py`

Responsibility: verify identity, validate JWT tokens, generate new tokens on login. Does NOT know about roles or permissions.

```python
import jwt
import logging
from typing import Optional, Dict, Any
from django.conf import settings
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken

from srs_utils.encryption import AESCipher
from srs_uaa.models import LoginAttempt
from srs_uaa.authentication.google_auth import GoogleAuth
from srs_uaa.authentication.user_management import UserManagementService

logger = logging.getLogger("srs_logger")
encryption = AESCipher(key=settings.SECRET_KEY)


class AuthenticationService:
    def validate_token(self, token: str) -> Optional[int]:
        """Verify an encrypted JWT and return user_id if valid."""
        try:
            decrypted_token = encryption.decrypt(token)
            user_data = jwt.decode(
                decrypted_token,
                options={"verify_signature": True, "verify_exp": True},
                algorithms=settings.SIMPLE_JWT["ALGORITHM"],
                key=settings.SIMPLE_JWT["SIGNING_KEY"],
            )
            if user_data.get("token_type") != "access":
                return None
            return user_data.get("user_id")
        except Exception as e:
            logger.error(f"Token validation failed: {e}")
            return None

    def get_user_from_token(self, token: str) -> Optional[User]:
        user_id = self.validate_token(token)
        if not user_id:
            return None
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    def check_login_attempts(self, username: str, ip_address: str) -> Dict[str, Any]:
        """Rate limiting: returns {'allowed': bool, 'seconds_remaining': int, 'message': str}."""
        # ... see full implementation in the reference project

    def authenticate_with_credentials(
        self, username: str, password: str, ip_address: str = None
    ) -> Optional[Dict[str, Any]]:
        """Returns token dict if valid, None otherwise. Does NOT include roles."""
        try:
            if ip_address:
                attempt_check = self.check_login_attempts(username, ip_address)
                if not attempt_check["allowed"]:
                    return {"error": "user_blocked", "detail": attempt_check["message"]}

            user = User.objects.filter(username=username).first()
            if not user:
                user = User.objects.filter(email=username).first()
            if not user or not user.check_password(password):
                return None

            refresh = RefreshToken.for_user(user)
            return {
                "refresh": encryption.encrypt(str(refresh)),
                "access": encryption.encrypt(str(refresh.access_token)),
                "expires": getattr(settings, 'ACCESS_TOKEN_LIFETIME_SECONDS', 3600),
                "user": {
                    "id": str(user.id),
                    "userName": user.username,
                    "email": user.email
                }
            }
        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            return None

    def authenticate_with_google(self, jwt_token: str) -> Optional[Dict[str, Any]]:
        """Orchestrates: verify Google token → provision user → generate our tokens."""
        # ... full implementation delegates to GoogleAuth and UserManagementService
```

**Key pattern:** tokens are double-wrapped. SimpleJWT generates a standard JWT, then `AESCipher` encrypts that JWT string with the project's `SECRET_KEY` and base64-encodes it. The client receives the encrypted blob. Every incoming request's `Authorization: Bearer <token>` header contains the encrypted form. `validate_token` decrypts first, then verifies the JWT signature. This is an extra layer on top of standard JWT — do not remove it when porting.

### Layer 2 — Authorization ("What can you do?")

**File:** `srs_uaa/authorization/services.py`

Responsibility: check what permissions an already-authenticated user has.

```python
import logging
from typing import List
from srs_uaa.models import UsersWithRoles, UserRoles

logger = logging.getLogger("srs_logger")


class AuthorizationService:
    def has_permission(self, user_id: int, permission_code: str) -> bool:
        try:
            user_roles = UsersWithRoles.objects.filter(
                user_with_role_user_id=user_id,
                user_with_role_role__is_active=True,
                is_active=True
            ).select_related('user_with_role_role')

            for user_role in user_roles:
                permissions = user_role.user_with_role_role.get_serializable_permissions()
                if permission_code in permissions:
                    return True
            return False
        except Exception as e:
            logger.error(f"Permission check failed: {e}")
            return False

    def has_all_permissions(self, user_id: int, permission_codes: List[str]) -> bool:
        """
        WARNING: despite the name, the reference implementation returns True
        if ANY of the permissions match. This is a known quirk. Preserve the
        behavior when porting unless you intentionally fix it — but be aware
        the name is misleading.
        """
        for permission_code in permission_codes:
            if self.has_permission(user_id, permission_code):
                return True
        return False

    def get_user_permissions(self, user_id: int) -> List[str]:
        try:
            user_roles = UsersWithRoles.objects.filter(
                user_with_role_user_id=user_id,
                is_active=True
            ).select_related('user_with_role_role')
            permissions = set()
            for user_role in user_roles:
                permissions.update(user_role.user_with_role_role.get_serializable_permissions())
            return list(permissions)
        except Exception as e:
            logger.error(f"Failed to get permissions: {e}")
            return []

    def get_user_roles(self, user_id: int) -> List[dict]:
        try:
            user_roles = UsersWithRoles.objects.filter(
                user_with_role_user_id=user_id,
                is_active=True
            ).select_related('user_with_role_role')
            return [
                {
                    "roleName": ur.user_with_role_role.name,
                    "permissions": ur.user_with_role_role.get_serializable_permissions()
                }
                for ur in user_roles
            ]
        except Exception as e:
            logger.error(f"Failed to get user roles: {e}")
            return []
```

**File:** `srs_uaa/authorization/auth_permission.py`

The Ninja auth handler. This is what endpoints use via `auth=[PermissionAuth(required_permissions=[...])]`.

```python
import logging
from typing import List, Optional
from ninja.security import HttpBearer
from django.http import HttpRequest
from django.contrib.auth.models import User

from srs_uaa.authentication.services import AuthenticationService
from srs_uaa.authorization.services import AuthorizationService

logger = logging.getLogger("srs_logger")


class PermissionAuth(HttpBearer):
    def __init__(self, required_permissions: List[str] = None):
        super().__init__()
        self.required_permissions = required_permissions or []
        self.auth_service = AuthenticationService()
        self.authz_service = AuthorizationService()

    def authenticate(self, request: HttpRequest, token: str) -> Optional[User]:
        try:
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            user_id = self.auth_service.validate_token(token)
            if not user_id:
                return None

            if self.required_permissions:
                if not self.authz_service.has_all_permissions(user_id, self.required_permissions):
                    logger.warning(f"User {user_id} lacks permissions: {self.required_permissions}")
                    return None

            user = User.objects.get(id=user_id)
            request.user = user
            return user
        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            return None
```

**Endpoint usage:**

```python
@domain_router.post(
    "/course-results",
    response=BaseNonPagedResponseData,
    auth=[PermissionAuth(required_permissions=["submit_grades"])]
)
def submit_course_result(request: HttpRequest, input: CourseResultsInputSerializer):
    # request.user is now populated
    ...
```

### Layer 3 — User Management ("Account lifecycle")

**File:** `srs_uaa/authentication/user_management.py`

Responsibility: create, update, and assign roles to user accounts. Runs during registration, Google-login-on-first-visit, and admin user creation. Does NOT authenticate — it only provisions.

```python
import logging
from typing import Optional
from django.conf import settings
from django.contrib.auth.models import User
from srs_uaa.models import UsersWithRoles, UserRoles
from srs_accounts.models import UserProfile

logger = logging.getLogger("srs_logger")


class UserManagementService:
    def create_or_update_user_from_google(
        self, email: str, given_name: str = "", family_name: str = ""
    ) -> Optional[User]:
        try:
            user, created = User.objects.update_or_create(
                username=email,
                email=email,
                defaults={"first_name": given_name, "last_name": family_name}
            )
            user.set_password(settings.DEFAULT_USER_PASSWORD)
            user.save()

            UserProfile.objects.update_or_create(
                profile_user=user,
                defaults={"has_been_verified": True}
            )

            if created:
                self.assign_default_role(user)
            return user
        except Exception as e:
            logger.error(f"Failed to create/update user: {e}")
            return None

    def assign_default_role(self, user: User) -> bool:
        try:
            default_role = UserRoles.objects.filter(name=settings.DEFAULT_NORMAL_USER_ROLE).first()
            if not default_role:
                return False
            UsersWithRoles.objects.get_or_create(
                user_with_role_role=default_role,
                user_with_role_user=user
            )
            return True
        except Exception as e:
            logger.error(f"Failed to assign default role: {e}")
            return False

    def create_user(self, username, email, password, first_name="", last_name="") -> Optional[User]:
        try:
            user = User.objects.create_user(
                username=username, email=email, password=password,
                first_name=first_name, last_name=last_name
            )
            UserProfile.objects.create(profile_user=user, has_been_verified=False)
            self.assign_default_role(user)
            return user
        except Exception as e:
            logger.error(f"Failed to create user: {e}")
            return None

    def assign_role_to_user(self, user: User, role_name: str) -> bool:
        """Remove all existing role assignments, then attach the new one."""
        try:
            valid_roles = [
                settings.DEFAULT_SUPER_ADMIN_ROLE_NAME,
                settings.STUDENT_ROLE_NAME,
                settings.LECTURER_ROLE_NAME,
            ]
            if role_name not in valid_roles:
                return False

            role = UserRoles.objects.filter(name=role_name).first()
            if not role:
                return False

            UsersWithRoles.objects.filter(user_with_role_user=user).delete()
            UsersWithRoles.objects.create(user_with_role_user=user, user_with_role_role=role)

            profile = UserProfile.objects.filter(profile_user=user).first()
            if profile:
                profile.account_type = role_name
                profile.save()
            return True
        except Exception as e:
            logger.error(f"Failed to assign role: {e}")
            return False

    def get_user_role(self, user: User) -> str:
        try:
            ur = UsersWithRoles.objects.filter(user_with_role_user=user).first()
            return ur.user_with_role_role.name if ur else None
        except Exception:
            return None
```

**The three-layer principle:** a login endpoint is the orchestrator that uses all three:

```python
@auth_router.post("/login", response=LoginResponseSerializer)
def login(request: HttpRequest, input: LoginInputSerializer):
    auth_service = AuthenticationService()
    authz_service = AuthorizationService()
    ip_address = request.META.get('REMOTE_ADDR', 'unknown')

    # Step 1: Authenticate (who are you?)
    auth_result = auth_service.authenticate_with_credentials(
        username=input.username, password=input.password, ip_address=ip_address
    )
    if not auth_result:
        return LoginResponseSerializer(detail="Invalid credentials")
    if "error" in auth_result:
        return LoginResponseSerializer(detail=auth_result.get("detail"))

    # Step 2: Get authorization data (what can you do?)
    user_id = int(auth_result["user"]["id"])
    roles_data = authz_service.get_user_roles(user_id)

    # Step 3: Combine
    auth_result["user"]["roles"] = roles_data
    return LoginResponseSerializer(**auth_result)
```

---

## Part 7 — The RBAC Data Model

**File:** `srs_uaa/models.py` (the roles/permissions tables)

Five tables form the RBAC graph:

```
UserPermissionsGroup  (high-level category: "GRADE MANAGEMENT", "USER MANAGEMENT", etc.)
        │
        ▼ (1-to-many)
UserPermissions       (individual codes: "submit_grades", "view_own_records")
        │
        ▼ (many-to-many via UserRolesWithPermissions)
UserRoles             (named roles: "ADMIN", "STUDENT", "LECTURER")
        │
        ▼ (many-to-many via UsersWithRoles)
User (Django auth)    (the actual account)
```

```python
from django.contrib.auth.models import User
from django.db import models
from srs_utils.BaseModel import BaseModel


class UserPermissionsGroup(BaseModel):
    name = models.CharField(max_length=9000)
    is_global = models.BooleanField(default=False)
    description = models.CharField(default="", max_length=600, null=True)

    @property
    def permissions(self):
        return self.permission_group.all()

    class Meta:
        db_table = "user_permissions_group"
        ordering = ["-primary_key"]
        verbose_name_plural = "PERMISSIONS GROUP"


class UserPermissions(BaseModel):
    name = models.CharField(default="", max_length=9000)
    code = models.CharField(default="", max_length=9000)
    group = models.ForeignKey(
        UserPermissionsGroup, related_name="permission_group",
        on_delete=models.CASCADE, null=True
    )
    permission_is_seeded = models.BooleanField(default=False)

    class Meta:
        db_table = "user_permissions"
        ordering = ["-primary_key"]
        verbose_name_plural = "USER PERMISSIONS"


class UserRoles(BaseModel):
    name = models.CharField(max_length=9000)
    description = models.CharField(default="", max_length=9000)
    is_seeded = models.BooleanField(default=False)

    @property
    def permissions(self):
        return self.get_user_permissions_list()

    def get_permissions(self):
        return self.user_role_with_permission_role.all()

    def get_user_permissions_list(self):
        return [perm.role_with_permission_permission for perm in self.get_permissions()]

    def get_serializable_permissions(self):
        """Returns a flat list of permission codes (strings)."""
        return [
            perm.role_with_permission_permission.code
            for perm in self.user_role_with_permission_role.all()
        ]

    class Meta:
        db_table = "user_roles"
        ordering = ["-primary_key"]
        verbose_name_plural = "USER ROLES"


class UserRolesWithPermissions(BaseModel):
    role_with_permission_role = models.ForeignKey(
        UserRoles, related_name="user_role_with_permission_role", on_delete=models.CASCADE
    )
    role_with_permission_permission = models.ForeignKey(
        UserPermissions, related_name="user_role_with_permission_permission",
        on_delete=models.CASCADE, null=True
    )
    permission_read_only = models.BooleanField(default=True)

    class Meta:
        db_table = "user_role_with_permissions"
        ordering = ["-primary_key"]
        verbose_name_plural = "ROLES WITH PERMISSIONS"


class UsersWithRoles(BaseModel):
    user_with_role_role = models.ForeignKey(
        UserRoles, related_name="user_role_name", on_delete=models.CASCADE
    )
    user_with_role_user = models.ForeignKey(
        User, related_name="role_user", on_delete=models.CASCADE
    )

    class Meta:
        db_table = "user_with_roles"
        ordering = ["-primary_key"]
        verbose_name_plural = "USERS WITH ROLES"


class LoginAttempt(BaseModel):
    username = models.CharField(max_length=255, db_index=True)
    ip_address = models.CharField(null=True, max_length=10000)
    attempts = models.IntegerField(default=0)
    first_attempt_time = models.DateTimeField(auto_now_add=True)
    blocked_time = models.DateTimeField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, db_index=True, null=True)
    http_accept = models.CharField(max_length=1025, null=True)
    path_info = models.CharField(max_length=255, null=True)

    class Meta:
        db_table = 'login_attempts'
        ordering = ['-first_attempt_time']
        verbose_name_plural = "LOGIN ATTEMPTS"
```

### The Permissions Definition File

**File:** `srs_utils/permissions.py`

This is the declarative source of all roles and permissions. The seeder reads from here.

```python
permissions = [
    {
        "permission_group": "STUDENT RECORDS",
        "permissions": [
            "view_own_records",
            "submit_personal_information",
            "verify_record_integrity",
            # ...
        ],
    },
    {
        "permission_group": "GRADE MANAGEMENT",
        "permissions": [
            "submit_grades",
            "view_own_grade_submissions",
            # ...
        ],
    },
    # ... other groups
]

role_permission_mappings = {
    "STUDENT": [
        "view_own_records",
        "submit_personal_information",
        # ...
    ],
    "LECTURER": [
        "submit_grades",
        "view_own_grade_submissions",
        # ...
    ],
    "ADMIN": [
        # empty — ADMIN gets ALL permissions via the seeder
    ]
}
```

### The Seeder

**File:** `srs_utils/CreateUserAddSeedPermissions.py`

Runs on every server start (idempotent) and can also be triggered via a management command. What it does:

1. Creates every role in `all_default_roles_added` if missing.
2. For the ADMIN role, also creates a superuser account (`settings.DEFAULT_SUPER_USERNAME`) with password `settings.DEFAULT_SUPER_PASS`, attaches a `UserProfile`, and links it to the ADMIN role.
3. For every permission in `permissions`, creates the `UserPermissionsGroup` if missing, then the `UserPermissions` entries with `permission_is_seeded=True`.
4. Deletes permissions that are seeded but no longer in the declared list. This keeps the database in sync with the code.
5. For each non-ADMIN role in `role_permission_mappings`, creates `UserRolesWithPermissions` links.
6. For ADMIN, links every `UserPermissions` in the database to the ADMIN role. ADMIN always has everything.

The warehouse DMS seeder is a structural copy of this file with the warehouse permissions and role names substituted.

---

## Part 8 — Domain Service Pattern (Interfaces + Mocks)

**File:** `srs_domain/services/academic_record_service.py`

The domain service is called from views to encapsulate business logic. It takes external dependencies as constructor arguments with sensible mock defaults. This is the pattern that makes it trivial to swap mocks for real providers without touching views.

```python
from typing import Optional
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.contrib.auth.models import User
import logging

from srs_domain.models import Student, Lecturer, Enrollment, CourseResults, RecordTransaction, StorageReference
from .interfaces import CryptographyServiceInterface, BlockchainServiceInterface, StorageServiceInterface
from .mocks import MockCryptographyService, MockBlockchainService, MockStorageService

logger = logging.getLogger("srs_logger")


class GradeSubmissionResult:
    def __init__(self, success: bool, message: str, grade_id: Optional[int] = None):
        self.success = success
        self.message = message
        self.grade_id = grade_id


class AcademicRecordService:
    def __init__(
        self,
        crypto_service: Optional[CryptographyServiceInterface] = None,
        blockchain_service: Optional[BlockchainServiceInterface] = None,
        storage_service: Optional[StorageServiceInterface] = None
    ):
        self.crypto = crypto_service or MockCryptographyService()
        self.blockchain = blockchain_service or MockBlockchainService()
        self.storage = storage_service or MockStorageService()

    def submit_grade(self, enrollment_id, grade_type, numeric_grade, letter_grade,
                     course_work_grade, exam_grade, remarks, comments, submitted_by_user) -> GradeSubmissionResult:
        try:
            with transaction.atomic():
                # 1. Validate lecturer
                # 2. Validate enrollment
                # 3. Check duplicates
                # 4. Validate grade values
                # 5. Create record
                # 6. Compute hash via self.crypto
                # 7. Store on blockchain via self.blockchain
                # 8. Store in IPFS via self.storage
                # 9. Update grade with references
                # 10. Create audit trail
                return GradeSubmissionResult(success=True, message="...", grade_id=grade.id)
        except Exception as e:
            logger.error(f"Error submitting grade: {e}")
            return GradeSubmissionResult(success=False, message=f"Failed: {str(e)}")
```

**The interface pattern:**

```python
# srs_domain/services/interfaces/cryptography_service.py
from abc import ABC, abstractmethod
from typing import Dict, Any


class CryptographyServiceInterface(ABC):
    @abstractmethod
    def compute_hash(self, data: Dict[str, Any]) -> str: pass

    @abstractmethod
    def verify_hash(self, data: Dict[str, Any], claimed_hash: str) -> bool: pass
```

```python
# srs_domain/services/mocks/mock_crypto.py
import hashlib
import json
from ..interfaces.cryptography_service import CryptographyServiceInterface


class MockCryptographyService(CryptographyServiceInterface):
    def compute_hash(self, data):
        json_str = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(json_str.encode('utf-8')).hexdigest()

    def verify_hash(self, data, claimed_hash):
        return self.compute_hash(data) == claimed_hash
```

**Why this matters for the warehouse DMS:** the AI pipeline is structured the same way. `OCRServiceInterface`, `LLMServiceInterface`, `EmbeddingServiceInterface`, with mocks for development and real providers (Vision, Groq, OpenAI) for production. The Celery tasks instantiate a `ServiceRegistry` that returns mocks or real implementations based on `USE_MOCK_AI_SERVICES` env var. The pattern is a direct carryover.

**Service-to-view pattern:**

```python
@domain_router.post("/course-results", ...)
def submit_course_result(request, input):
    service = AcademicRecordService()  # default mocks
    result = service.submit_grade(
        enrollment_id=input.enrollment_id,
        ...
        submitted_by_user=request.user
    )
    if result.success:
        return BaseNonPagedResponseData(
            response=ResponseObject.get_response(1, result.message)
        )
    return BaseNonPagedResponseData(
        response=ResponseObject.get_response(0, result.message)
    )
```

Views are thin. They translate HTTP to service calls and back. Business logic lives in services.

---

## Part 9 — Representative View Shapes

### Shape A — Simple List Endpoint

```python
@domain_router.get(
    "/students",
    response=StudentPagedResponseSerializer,
    by_alias=True
)
def get_students(request: HttpRequest, filtering: Query[StudentFilteringSerializer] = None):
    try:
        queryset = Student.objects.select_related('user').all()

        if filtering:
            if filtering.program:
                queryset = queryset.filter(program__icontains=filtering.program)
            if filtering.year_of_study:
                queryset = queryset.filter(year_of_study=filtering.year_of_study)

        return get_paginated_and_non_paginated_data(
            queryset, filtering, StudentPagedResponseSerializer
        )
    except Exception as e:
        logger.error(f"Error fetching students: {e}")
        return StudentPagedResponseSerializer(
            response=ResponseObject.get_response(2, message=str(e))
        )
```

### Shape B — Detail Endpoint with Ownership Check

```python
@domain_router.get(
    "/students/{student_id}",
    response=StudentNonPagedResponseSerializer,
    by_alias=True
)
def get_student(request: HttpRequest, student_id: int):
    try:
        student = get_object_or_404(Student, pk=student_id, is_active=True)

        from srs_uaa.authorization.services import AuthorizationService
        authz_service = AuthorizationService()

        is_own_record = student.user.id == request.user.id
        has_admin_permission = authz_service.has_permission(
            request.user.id, "view_all_students"
        )

        if not is_own_record and not has_admin_permission:
            return StudentNonPagedResponseSerializer(
                response=ResponseObject.get_response(0, "Permission denied")
            )

        data = {
            "id": student.id,
            "unique_id": student.unique_id,
            "created_date": student.created_date,
            "updated_date": student.updated_date,
            "is_active": student.is_active,
            "student_id": student.student_id,
            "user_id": student.user.id,
            "username": student.user.username,
            "email": student.user.email,
            "program": student.program,
            "year_of_study": student.year_of_study,
            "enrollment_date": student.enrollment_date,
            "enrollment_status": student.enrollment_status,
            "phone_number": student.phone_number,
            "date_of_birth": student.date_of_birth
        }

        return StudentNonPagedResponseSerializer(
            response=ResponseObject.get_response(1),
            data=data
        )
    except Exception as e:
        logger.error(f"Error fetching student: {e}")
        return StudentNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, message=str(e))
        )
```

### Shape C — Create Endpoint with Business Rules

```python
@domain_router.post("/students", response=BaseNonPagedResponseData)
def create_student(request: HttpRequest, input: StudentInputSerializer):
    try:
        with transaction.atomic():
            if Student.objects.filter(student_id=input.student_id).exists():
                return BaseNonPagedResponseData(
                    response=ResponseObject.get_response(0, "Student ID already exists")
                )

            if not User.objects.filter(id=input.user_id).exists():
                return BaseNonPagedResponseData(
                    response=ResponseObject.get_response(0, "User does not exist")
                )

            user = User.objects.get(id=input.user_id)
            if Student.objects.filter(user=user).exists():
                return BaseNonPagedResponseData(
                    response=ResponseObject.get_response(0, "User is already a student")
                )

            user_mgmt = UserManagementService()
            user_mgmt.assign_role_to_user(user, "STUDENT")

            student = Student.objects.create(
                user=user,
                student_id=input.student_id,
                enrollment_date=input.enrollment_date,
                program=input.program,
                year_of_study=input.year_of_study,
                enrollment_status=input.enrollment_status,
                phone_number=input.phone_number,
                date_of_birth=input.date_of_birth,
                created_by=request.user
            )

            logger.info(f"Student created: {student.student_id} by {request.user.username}")

            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(1, "Student created successfully")
            )
    except Exception as e:
        logger.error(f"Error creating student: {e}")
        return BaseNonPagedResponseData(
            response=ResponseObject.get_response(0, message=str(e))
        )
```

### Shape D — Combined Create-or-Update Endpoint (The `api_operation` Pattern)

Ninja allows a single handler to serve multiple HTTP methods. The reference project uses this for "save" endpoints that create-or-update based on whether `unique_id` is in the payload.

```python
@accounts_router.api_operation(
    ["POST", "PUT"],
    "/create_update_user_profile",
    response=UserAccountResponseSerializer,
)
def create_user_profile(request: HttpRequest, input: UserAcountInputSerializer):
    try:
        if request.method == "PUT":
            if input.unique_id is None:
                return UserAccountResponseSerializer(
                    response=ResponseObject.get_response(3)
                )
            user_profile = UserProfile.objects.filter(unique_id=input.unique_id).first()
            if not user_profile:
                return UserAccountResponseSerializer(
                    response=ResponseObject.get_response(3, "user profile Not Found")
                )
            # ... update logic

        if request.method == "POST":
            # ... create logic

        return UserAccountResponseSerializer(
            data=user_profile,
            response=ResponseObject.get_response(1)
        )
    except Exception as e:
        logger.error(f"error occurred {e}")
        return UserAccountResponseSerializer(
            response=ResponseObject.get_response(2, message=str(e)),
        )
```

### Shape E — Soft Delete Endpoint

```python
@domain_router.delete("/students/{student_id}", response=BaseNonPagedResponseData)
def deactivate_student(request: HttpRequest, student_id: int):
    try:
        student = get_object_or_404(Student, pk=student_id, is_active=True)
        student.is_active = False
        student.enrollment_status = 'WITHDRAWN'  # domain-specific deactivation side-effect
        student.save()

        logger.info(f"Student deactivated: {student.student_id} by {request.user.username}")

        return BaseNonPagedResponseData(
            response=ResponseObject.get_response(1, "Student deactivated successfully")
        )
    except Exception as e:
        logger.error(f"Error deactivating student: {e}")
        return BaseNonPagedResponseData(
            response=ResponseObject.get_response(0, message=str(e))
        )
```

**Key view conventions:**

- Every view wraps its body in `try/except` with `logger.error` and returns a response envelope in all paths.
- Logger names are `srs_logger` for domain code and `gateway_logger` for the pagination helper. The warehouse DMS uses `wdms_logger` consistently for everything.
- On success: log at INFO with enough context to trace the action.
- On business-rule failure: return `ResponseObject.get_response(0, "<message>")`.
- On exception: return `ResponseObject.get_response(2, str(e))`.
- On lookup miss: return `ResponseObject.get_response(3, "<X> not found")` when using get-or-404 semantics.
- Permission checks happen in one of two places: as `auth=[PermissionAuth(...)]` on the decorator for simple gating, or inline via `AuthorizationService` for ownership-plus-permission rules.
- File-system operations, external API calls, and multi-table writes always happen inside `with transaction.atomic():`.

---

## Part 10 — Shape of the Serializer Model Validator

The reference project uses a specific pattern to flatten ORM objects into the serializer's expected dict shape. This is the key pattern that makes nested relationships clean.

```python
from pydantic import model_validator


class StudentTableSerializer(BaseSerializer):
    student_id: str
    user_id: int
    username: str
    email: str
    program: str
    year_of_study: int
    enrollment_date: date
    enrollment_status: str
    phone_number: Optional[str] = None
    date_of_birth: Optional[date] = None

    @model_validator(mode='before')
    @classmethod
    def extract_user_fields(cls, data):
        if hasattr(data, 'user'):
            return {
                'id': data.pk,
                'unique_id': data.unique_id,
                'created_date': data.created_date,
                'updated_date': data.updated_date,
                'is_active': data.is_active,
                'student_id': data.student_id,
                'program': data.program,
                'year_of_study': data.year_of_study,
                'enrollment_date': data.enrollment_date,
                'enrollment_status': data.enrollment_status,
                'phone_number': data.phone_number,
                'date_of_birth': data.date_of_birth,
                'user_id': data.user.id,
                'username': data.user.username,
                'email': data.user.email
            }
        return data
```

The `@model_validator(mode='before')` runs before Pydantic's field validators and receives the raw ORM instance. It checks whether the input is an ORM object (by looking for a related field like `user`) and returns a dict with all the needed fields pulled out. If the input is already a dict, it passes through unchanged.

This pattern is how the reference project avoids the "Pydantic can't serialize Django objects directly" problem without heavy library glue. Every nested-field serializer in the warehouse DMS should follow the same shape.

---

## Part 11 — Settings File Skeleton

**File:** `secured_SRS/settings.py`

The parts that matter for the warehouse DMS port:

```python
from pathlib import Path
from datetime import timedelta
import os
from dotenv import dotenv_values

BASE_DIR = Path(__file__).resolve().parent.parent
config = dotenv_values(".env")

SECRET_KEY = 'your-secret-key'  # override in .env for production
DEBUG = config.get("DEBUG", "True") == "True"
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'srs_uaa',
    'srs_utils',
    'srs_accounts',
    'srs_domain',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'secured_SRS.urls'
WSGI_APPLICATION = 'secured_SRS.wsgi.application'

# SQLite in the reference project — swap to PostgreSQL for the warehouse DMS
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

STATIC_URL = '/static/'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# JWT
ACCESS_TOKEN_LIFETIME_SECONDS = 86400  # 24h
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(seconds=ACCESS_TOKEN_LIFETIME_SECONDS),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ALGORITHM": "HS256",
    "SIGNING_KEY": config.get("SIGNING_KEY", SECRET_KEY),
    "VERIFYING_KEY": config.get("VERIFYING_KEY", SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "UPDATE_LAST_LOGIN": True,
    # ...
}

# RBAC role name constants
DEFAULT_USER_PASSWORD = 'default_password_for_oauth_users'
DEFAULT_SUPER_ADMIN_ROLE_NAME = 'ADMIN'
STUDENT_ROLE_NAME = 'STUDENT'
LECTURER_ROLE_NAME = 'LECTURER'
DEFAULT_NORMAL_USER_ROLE = STUDENT_ROLE_NAME

DEFAULT_SUPER_USERNAME = 'admin'
DEFAULT_SUPER_EMAIL = 'admin@example.com'
DEFAULT_SUPER_PASS = 'admin123'

# Rate limiting
MAX_ATTEMPTS_FAILURE = 5
MAX_TIME_BLOCKED = 300

LOGIN_URL = '/api/auth/login'
ADMIN_SITE_URL = '/admin/login/'

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'verbose'},
        'file': {
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'srs.log',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'srs_logger': {'handlers': ['console', 'file'], 'level': 'INFO', 'propagate': False},
        'gateway_logger': {'handlers': ['console', 'file'], 'level': 'INFO', 'propagate': False},
        'django': {'handlers': ['console', 'file'], 'level': 'INFO', 'propagate': False},
    },
}

LOGS_DIR = BASE_DIR / 'logs'
if not os.path.exists(LOGS_DIR):
    os.makedirs(LOGS_DIR)
```

---

## Part 12 — Support Utilities (Encryption, Tokens, Email)

### Encryption

**File:** `srs_utils/encryption.py`

```python
import base64
import hashlib
from Crypto import Random
from Crypto.Cipher import AES


class AESCipher(object):
    def __init__(self, key):
        self.bs = AES.block_size
        self.key = hashlib.sha256(key.encode()).digest()

    def encrypt(self, raw):
        raw = self._pad(raw)
        iv = Random.new().read(AES.block_size)
        cipher = AES.new(self.key, AES.MODE_CBC, iv)
        return base64.b64encode(iv + cipher.encrypt(raw.encode())).decode('utf-8')

    def decrypt(self, enc):
        enc = base64.b64decode(enc)
        iv = enc[:AES.block_size]
        cipher = AES.new(self.key, AES.MODE_CBC, iv)
        return AESCipher._unpad(cipher.decrypt(enc[AES.block_size:])).decode('utf-8')

    def _pad(self, s):
        return s + (self.bs - len(s) % self.bs) * chr(self.bs - len(s) % self.bs)

    @staticmethod
    def _unpad(s):
        return s[:-ord(s[len(s) - 1:])]
```

Uses `pycryptodome`. The key is the Django `SECRET_KEY`, hashed to 32 bytes.

### Tokens

**File:** `srs_utils/tokens.py`

```python
import secrets
import string


def get_forgot_password_token(length: int = 64) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def get_activation_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)
```

### Email

**File:** `srs_utils/email.py`

```python
import os
from django.template.loader import render_to_string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from jinja2 import Environment, FileSystemLoader
from dotenv import dotenv_values

config = dotenv_values(".env")


class EmailNotifications:
    @staticmethod
    def send_email_notification(emailBody, html_template, user):
        EMAIL_HOST = config.get('EMAIL_HOST', os.environ.get('EMAIL_HOST'))
        EMAIL_PASSWORD = config.get('EMAIL_HOST_PASSWORD', os.environ.get('EMAIL_HOST_PASSWORD'))
        EMAIL_USER = config.get('EMAIL_HOST_USER', os.environ.get('EMAIL_HOST_USER'))
        EMAIL_PORT = config.get('EMAIL_PORT')
        DEFAULT_FROM_EMAIL = config.get('DEFAULT_FROM_EMAIL')

        html_content = render_to_string(html_template, {'data': emailBody})
        env = Environment(loader=FileSystemLoader(html_template))
        template = env.from_string(html_content)
        rendered_template = template.render({'data': emailBody})

        msg = MIMEMultipart()
        msg['From'] = DEFAULT_FROM_EMAIL
        msg['To'] = emailBody['receiver_details']
        msg['Subject'] = emailBody['subject']
        msg.attach(MIMEText(rendered_template, 'html'))

        server = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASSWORD)
        server.sendmail(DEFAULT_FROM_EMAIL, emailBody['receiver_details'], msg.as_string())
        server.quit()
```

**Usage in views:**

```python
body = {
    "receiver_details": user.email,
    "user": user,
    "url": url,
    "subject": "Activate Account"
}
EmailNotifications.send_email_notification(body, "email/verify_account.html", user=user)
```

HTML templates live in `templates/email/*.html` and are rendered with Django's template engine.

---

## Part 13 — Known Quirks to Preserve or Fix

A few patterns in the reference code are worth calling out explicitly, because they're either deliberate-but-surprising or bugs the port should fix.

**Preserve:** `primary_key` instead of `id`. Every model has this. The `id` property aliases to it. This is intentional across the codebase.

**Preserve:** `DateField` for `created_date` / `updated_date`. Day-granularity is sufficient for most auditing, and it keeps the JSON smaller. For fields that need second-precision (status transitions, timestamps of critical actions), add a separate `DateTimeField`.

**Preserve:** double-wrapped tokens (JWT inside AES). The extra layer makes stolen tokens useless without the `SECRET_KEY`.

**Preserve:** Ninja + DRF SimpleJWT coexistence. DRF provides the JWT machinery, Ninja provides the API surface. They do not conflict.

**Fix in the port:** `has_all_permissions` in `AuthorizationService` actually implements "has any permission" (returns True on the first match). Either rename the method to `has_any_permission`, or fix the logic to use `all(...)`. The foundation document for the warehouse DMS assumes the fixed version.

**Fix in the port:** `create_user_profile` in `srs_accounts/views.py` has a validation check that uses `or` where it should use `and`. Preserve the intent (reject requests missing required fields) but fix the logic.

**Fix in the port:** `CreateRolesAddPermissions()` is called at import time in `urls.py`. This makes the Django server do blocking I/O during startup on every boot. The warehouse DMS should move this into a migration's `RunPython` or a dedicated management command that the deployment pipeline invokes once. The reference project's seeder is idempotent so this is safe, but it's slow.

**Fix in the port:** the `TOKEN_OBTAIN_SERIALIZER` path in SIMPLE_JWT settings refers to `sentiment_utils.custom_authentication.*` — a stale path from a previous project. The warehouse DMS should either remove these three lines (the defaults work fine) or point them to real classes.

---

## Part 14 — Quick Cheat Sheet for Copilot / Codex

When generating new backend code for the warehouse DMS, a coding assistant reading this document should follow these rules:

**For a new model:**
1. Inherit from `BaseModel`.
2. Use `primary_key` as the internal pk, `unique_id` as the external identifier.
3. Define `db_table`, `ordering`, `verbose_name_plural` in `Meta`.
4. Add indexes in `Meta.indexes` for every field used in hot filters.

**For a new entity's serializers:**
1. Produce all five: `TableSerializer`, `InputSerializer`, `FilteringSerializer`, `PagedResponseSerializer`, `NonPagedResponseSerializer`.
2. Use `@model_validator(mode='before')` on `TableSerializer` to flatten ORM objects.
3. Extend the correct base: `BaseSerializer` for output, `BaseInputSerializer` for input, `BasePagedFilteringSerializer` for list filters.
4. Let the camelCase alias generator do its job — write `snake_case` in Python.

**For a new view:**
1. Wrap every handler in `try/except` with `logger.error` on failure.
2. Return response envelopes (`BasePagedResponseList` or `BaseNonPagedResponseData`) in all paths.
3. Use `ResponseObject.get_response(id, message)` for every response.
4. Use `get_paginated_and_non_paginated_data` for every list endpoint.
5. Scope the queryset by tenant (in the warehouse DMS) via `get_tenant_queryset`.
6. Permission-gate with `auth=[PermissionAuth(required_permissions=[...])]` or inline `AuthorizationService`.
7. Wrap multi-step writes in `transaction.atomic`.
8. Log success at INFO with enough context to trace later.

**For a new service:**
1. Put it in `<app>/services/`.
2. If it has external dependencies, define an interface in `services/interfaces/` and a mock in `services/mocks/`.
3. Make the constructor accept the interfaces with mock defaults.
4. Return structured result objects, not bare booleans or exceptions.

**For a new permission:**
1. Add it to `wdms_utils/permissions.py` in the appropriate group.
2. Add the permission code to the relevant roles in `role_permission_mappings`.
3. Re-run `python manage.py seed_permissions`.

**For a new role:**
1. Add the role name as a settings constant.
2. Add it to `all_default_roles_added` in the seeder.
3. Add its permission list to `role_permission_mappings`.
4. Re-run the seeder.

---

*Companion documents: WAREHOUSE_DMS_FOUNDATION.md, warehouse_dms_visual_reference.html, CODING_ASSISTANT_PROMPTS.md*
*Last updated: 2026-04-23*
