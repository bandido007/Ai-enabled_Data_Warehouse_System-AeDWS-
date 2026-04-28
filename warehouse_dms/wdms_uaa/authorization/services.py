import logging
from typing import List

from wdms_uaa.models import UsersWithRoles

logger = logging.getLogger("wdms_logger")


class AuthorizationService:
    """Layer 2 — What can you do?

    Checks what permissions an already-authenticated user has.
    Does NOT authenticate tokens — that is AuthenticationService's concern.

    Note on has_all_permissions: the secured_SRS reference has a known bug
    where this method returns True on the FIRST permission match (i.e. it
    behaves as "has_any_permission"). This port fixes that bug — the method
    now returns True only when the user has EVERY permission in the list.
    """

    def has_permission(self, user_id: int, permission_code: str) -> bool:
        try:
            user_roles = UsersWithRoles.objects.filter(
                user_with_role_user_id=user_id,
                user_with_role_role__is_active=True,
                is_active=True,
            ).select_related("user_with_role_role")

            for user_role in user_roles:
                permissions = user_role.user_with_role_role.get_serializable_permissions()
                if permission_code in permissions:
                    return True
            return False
        except Exception as e:
            logger.error(f"Permission check failed: {e}")
            return False

    def has_all_permissions(self, user_id: int, permission_codes: List[str]) -> bool:
        """Return True only when the user has every permission in the list."""
        if not permission_codes:
            return True
        return all(self.has_permission(user_id, code) for code in permission_codes)

    def has_any_permission(self, user_id: int, permission_codes: List[str]) -> bool:
        """Return True when the user has at least one of the listed permissions."""
        return any(self.has_permission(user_id, code) for code in permission_codes)

    def get_user_permissions(self, user_id: int) -> List[str]:
        try:
            user_roles = UsersWithRoles.objects.filter(
                user_with_role_user_id=user_id,
                is_active=True,
            ).select_related("user_with_role_role")
            permissions: set = set()
            for user_role in user_roles:
                permissions.update(
                    user_role.user_with_role_role.get_serializable_permissions()
                )
            return list(permissions)
        except Exception as e:
            logger.error(f"Failed to get permissions: {e}")
            return []

    def get_user_roles(self, user_id: int) -> List[dict]:
        try:
            user_roles = UsersWithRoles.objects.filter(
                user_with_role_user_id=user_id,
                is_active=True,
            ).select_related("user_with_role_role")
            return [
                {
                    "roleName": ur.user_with_role_role.name,
                    "permissions": ur.user_with_role_role.get_serializable_permissions(),
                }
                for ur in user_roles
            ]
        except Exception as e:
            logger.error(f"Failed to get user roles: {e}")
            return []
