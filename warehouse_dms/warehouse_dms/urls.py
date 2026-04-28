from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenVerifyView

from ninja import NinjaAPI

from warehouse_dms.wdms_api_v1 import api_v1
from wdms_documents.views import upload_stream_view


def set_all_by_alias(api: NinjaAPI):
    """Patch every operation so response schemas serialise with camelCase aliases."""
    for _pth, router in api._routers:
        for view in router.path_operations.values():
            for op in view.operations:
                op.by_alias = True


set_all_by_alias(api_v1)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", api_v1.urls),
    # SSE upload stream — plain Django view (StreamingHttpResponse, not Ninja)
    path(
        "api/v1/documents/upload/<int:attempt_id>/stream/",
        upload_stream_view,
        name="upload_stream",
    ),
    # SimpleJWT raw token endpoints (useful for server-to-server tooling)
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/token/verify/", TokenVerifyView.as_view(), name="token_verify"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
