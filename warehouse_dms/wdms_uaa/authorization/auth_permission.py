import logging
from typing import List, Optional

from django.contrib.auth.models import User
from django.http import HttpRequest
from ninja.security import HttpBearer

from wdms_uaa.authentication.services import AuthenticationService
from wdms_uaa.authorization.services import AuthorizationService

logger = logging.getLogger("wdms_logger")


class PermissionAuth(HttpBearer):
    """Ninja HttpBearer auth handler.

    Usage on endpoints:
        @router.get("/path", auth=PermissionAuth(required_permissions=["some_code"]))
        def handler(request): ...

    When required_permissions is empty the handler only requires a valid token
    (any authenticated user may call it).
    """

    def __init__(self, required_permissions: List[str] = None):
        super().__init__()
        self.required_permissions = required_permissions or []
        self.auth_service = AuthenticationService()
        self.authz_service = AuthorizationService()

    def authenticate(self, request: HttpRequest, token: str) -> Optional[User]:
        try:
            raw_token = (
                request.headers.get("Authorization", "")
                .replace("Bearer ", "")
                .strip()
            )
            user_id = self.auth_service.validate_token(raw_token)
            if not user_id:
                return None

            if self.required_permissions:
                if not self.authz_service.has_all_permissions(
                    user_id, self.required_permissions
                ):
                    logger.warning(
                        f"User {user_id} lacks permissions: {self.required_permissions}"
                    )
                    return None

            user = User.objects.get(id=user_id)
            request.user = user
            return user
        except Exception as e:
            logger.error(f"PermissionAuth failed: {e}")
            return None
