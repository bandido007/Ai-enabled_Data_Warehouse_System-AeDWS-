import os
from pathlib import Path
from datetime import timedelta

import dj_database_url
from dotenv import dotenv_values

BASE_DIR = Path(__file__).resolve().parent.parent
config = dotenv_values(BASE_DIR / ".env")

SECRET_KEY = config.get("SECRET_KEY", "change-me-in-production")
DEBUG = config.get("DEBUG", "True") == "True"
ALLOWED_HOSTS = config.get("ALLOWED_HOSTS", "*").split(",")

# ── Application definition ────────────────────────────────────────────────────

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "ninja",
    "pgvector",
    "django_celery_beat",
    # Project apps
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

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Whitenoise serves /static/ from disk so gunicorn doesn't need a proxy
    # in front for the admin CSS/JS to render. Must sit immediately after
    # SecurityMiddleware per the Whitenoise docs.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Rate-limiting: attaches client_ip to every request
    "wdms_uaa.authentication.middleware.LoginAttemptsMiddleware",
]

ROOT_URLCONF = "warehouse_dms.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "warehouse_dms.wsgi.application"

# ── Database ──────────────────────────────────────────────────────────────────

DATABASE_URL = config.get(
    "DATABASE_URL",
    "postgres://wdms_user:wdms_pass@db:5432/wdms_db",
)
DATABASES = {
    "default": dj_database_url.parse(
        DATABASE_URL,
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# ── Password validation ───────────────────────────────────────────────────────

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ── Internationalisation ──────────────────────────────────────────────────────

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Dar_es_Salaam"
USE_I18N = True
USE_TZ = True

# ── Static and media files ────────────────────────────────────────────────────

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Lets Whitenoise serve files from each app's static/ directory without
# needing collectstatic during local dev. Production should still run
# collectstatic so the manifest storage hashes filenames.
WHITENOISE_USE_FINDERS = True
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── JWT (mirrors secured_SRS) ─────────────────────────────────────────────────

ACCESS_TOKEN_LIFETIME_SECONDS = int(
    config.get("ACCESS_TOKEN_LIFETIME_SECONDS", 86400)
)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(seconds=ACCESS_TOKEN_LIFETIME_SECONDS),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ALGORITHM": "HS256",
    "SIGNING_KEY": config.get("SIGNING_KEY", SECRET_KEY),
    "VERIFYING_KEY": config.get("VERIFYING_KEY", SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "UPDATE_LAST_LOGIN": True,
}

# ── RBAC role name constants ──────────────────────────────────────────────────

DEFAULT_USER_PASSWORD = config.get("DEFAULT_USER_PASSWORD", "Wdms@Default2026!")
DEFAULT_SUPER_ADMIN_ROLE_NAME = "ADMIN"
DEPOSITOR_ROLE_NAME = "DEPOSITOR"
STAFF_ROLE_NAME = "STAFF"
MANAGER_ROLE_NAME = "MANAGER"
CEO_ROLE_NAME = "CEO"
REGULATOR_ROLE_NAME = "REGULATOR"
DEFAULT_NORMAL_USER_ROLE = DEPOSITOR_ROLE_NAME

DEFAULT_SUPER_USERNAME = config.get("DEFAULT_SUPER_USERNAME", "admin")
DEFAULT_SUPER_EMAIL = config.get("DEFAULT_SUPER_EMAIL", "admin@warehousedms.tz")
DEFAULT_SUPER_PASS = config.get("DEFAULT_SUPER_PASS", "Admin@Wdms2026!")

# ── Rate limiting ─────────────────────────────────────────────────────────────

MAX_ATTEMPTS_FAILURE = int(config.get("MAX_ATTEMPTS_FAILURE", 5))
MAX_TIME_BLOCKED = int(config.get("MAX_TIME_BLOCKED", 300))

LOGIN_URL = "/api/v1/auth/login"
ADMIN_SITE_URL = "/admin/login/"

# ── Celery ────────────────────────────────────────────────────────────────────

CELERY_BROKER_URL = config.get("REDIS_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = config.get("REDIS_URL", "redis://redis:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

# ── Email (SMTP) ──────────────────────────────────────────────────────────────

EMAIL_BACKEND = config.get(
    "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend"
)
EMAIL_HOST = config.get("EMAIL_HOST", "localhost")
EMAIL_PORT = int(config.get("EMAIL_PORT", 1025))
EMAIL_USE_TLS = config.get("EMAIL_USE_TLS", "False") == "True"
EMAIL_HOST_USER = config.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = config.get("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = config.get("DEFAULT_FROM_EMAIL", "noreply@warehousedms.tz")

# ── Africa's Talking (SMS) ────────────────────────────────────────────────────

AFRICASTALKING_USERNAME = config.get("AFRICASTALKING_USERNAME", "sandbox")
AFRICASTALKING_API_KEY = config.get("AFRICASTALKING_API_KEY", "")
AFRICASTALKING_SENDER_ID = config.get("AFRICASTALKING_SENDER_ID", "")

# ── Frontend domain (used in notification links) ──────────────────────────────

FRONTEND_DOMAIN = config.get("FRONTEND_DOMAIN", "http://localhost:5173")

# ── pgvector ──────────────────────────────────────────────────────────────────
# The pgvector extension is enabled via the 0001_initial migration in
# wdms_tenants (or wdms_documents in Phase 2). No extra Django setting needed;
# pgvector's Django integration registers vector field types automatically.

# ── AI services (Phase 4) ─────────────────────────────────────────────────────
# Provider modules read these via os.environ, so we push the .env values into
# the process environment here. This way Vision / Vertex / the registry all
# see the same config the developer set in .env, both inside Django and inside
# the Celery worker (which inherits Django's environment).
for _key in (
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_LOCATION",
    "GEMINI_MODEL",
    "VERTEX_EMBEDDING_MODEL",
    "USE_MOCK_AI_SERVICES",
):
    _val = config.get(_key)
    if _val and not os.environ.get(_key):
        os.environ[_key] = _val

# ── Logging ───────────────────────────────────────────────────────────────────

LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        "file": {
            "class": "logging.FileHandler",
            "filename": BASE_DIR / "logs" / "wdms.log",
            "formatter": "verbose",
        },
    },
    "loggers": {
        "wdms_logger": {
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": False,
        },
        "django": {
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
