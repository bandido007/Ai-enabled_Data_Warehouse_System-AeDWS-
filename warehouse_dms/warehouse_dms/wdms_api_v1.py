from ninja import NinjaAPI
from scalar_django_ninja import ScalarViewer

from wdms_accounts.views import accounts_router
from wdms_documents.views import documents_router
from wdms_notifications.views import notifications_router
from wdms_tenants.views import tenants_router
from wdms_uaa.views import auth_router

api_v1 = NinjaAPI(
    title="Warehouse DMS API",
    version="1.0.0",
    docs_url="/docs",
    docs=ScalarViewer(openapi_url="/api/v1/openapi.json"),
)

api_v1.add_router("/auth/", auth_router)
api_v1.add_router("/accounts/", accounts_router)
api_v1.add_router("/tenants/", tenants_router)
api_v1.add_router("/documents/", documents_router)
api_v1.add_router("/notifications/", notifications_router)
