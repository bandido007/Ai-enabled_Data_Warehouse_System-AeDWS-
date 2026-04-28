import logging

from django.contrib.auth.models import User
from django.http import HttpRequest
from ninja import Router

from wdms_uaa.authentication.services import AuthenticationService
from wdms_uaa.authentication.user_management import UserManagementService
from wdms_uaa.authorization import AuthorizationService, PermissionAuth
from wdms_uaa.models import UserPermissionsGroup, UserRoles
from wdms_uaa.serializers import (
    AssignRoleInputSerializer,
    GoogleLoginInputSerializer,
    LoginInputSerializer,
    LoginResponseSerializer,
    PermissionGroupListResponseSerializer,
    PermissionGroupSerializer,
    PermissionItemSerializer,
    RoleItemSerializer,
    RoleListResponseSerializer,
)
from wdms_utils.response import ResponseObject
from wdms_utils.SharedSerializer import BaseNonPagedResponseData

logger = logging.getLogger("wdms_logger")

auth_router = Router()


# ── Login ─────────────────────────────────────────────────────────────────────

@auth_router.post("/login", response=LoginResponseSerializer, auth=None)
def login(request: HttpRequest, input: LoginInputSerializer):
    try:
        auth_service = AuthenticationService()
        authz_service = AuthorizationService()
        ip_address = getattr(request, "client_ip", request.META.get("REMOTE_ADDR", "unknown"))

        auth_result = auth_service.authenticate_with_credentials(
            username=input.username,
            password=input.password,
            ip_address=ip_address,
        )

        if not auth_result:
            return LoginResponseSerializer(detail="Invalid credentials")
        if "error" in auth_result:
            return LoginResponseSerializer(detail=auth_result.get("detail", "Blocked"))

        user_id = int(auth_result["user"]["id"])
        roles_data = authz_service.get_user_roles(user_id)
        auth_result["roles"] = roles_data

        logger.info(f"Successful login: {auth_result['user']['userName']} from {ip_address}")

        user_info = auth_result.pop("user")
        return LoginResponseSerializer(
            access=auth_result["access"],
            refresh=auth_result["refresh"],
            expires=auth_result["expires"],
            user={
                "id": user_info["id"],
                "user_name": user_info["userName"],
                "email": user_info["email"],
                "first_name": user_info.get("firstName", ""),
                "last_name": user_info.get("lastName", ""),
            },
            roles=roles_data,
        )
    except Exception as e:
        logger.error(f"Login error: {e}")
        return LoginResponseSerializer(detail=str(e))


@auth_router.post("/login/google", response=LoginResponseSerializer, auth=None)
def login_with_google(request: HttpRequest, input: GoogleLoginInputSerializer):
    try:
        auth_service = AuthenticationService()
        authz_service = AuthorizationService()

        auth_result = auth_service.authenticate_with_google(input.jwt_token)
        if not auth_result:
            return LoginResponseSerializer(detail="Google authentication failed")

        user_id = int(auth_result["user"]["id"])
        roles_data = authz_service.get_user_roles(user_id)

        user_info = auth_result.pop("user")
        return LoginResponseSerializer(
            access=auth_result["access"],
            refresh=auth_result["refresh"],
            expires=auth_result["expires"],
            user={
                "id": user_info["id"],
                "user_name": user_info["userName"],
                "email": user_info["email"],
                "first_name": user_info.get("firstName", ""),
                "last_name": user_info.get("lastName", ""),
            },
            roles=roles_data,
        )
    except Exception as e:
        logger.error(f"Google login error: {e}")
        return LoginResponseSerializer(detail=str(e))


# ── Roles ─────────────────────────────────────────────────────────────────────

@auth_router.get(
    "/roles",
    response=RoleListResponseSerializer,
    auth=PermissionAuth(required_permissions=["manage_users"]),
)
def list_roles(request: HttpRequest):
    try:
        roles = UserRoles.objects.filter(is_active=True)
        data = [
            RoleItemSerializer(
                id=r.pk,
                unique_id=str(r.unique_id),
                name=r.name,
                description=r.description,
                is_seeded=r.is_seeded,
            )
            for r in roles
        ]
        return RoleListResponseSerializer(
            response=ResponseObject.get_response(1),
            data=data,
        )
    except Exception as e:
        logger.error(f"Error listing roles: {e}")
        return RoleListResponseSerializer(response=ResponseObject.get_response(2, str(e)))


@auth_router.post(
    "/roles/assign",
    response=BaseNonPagedResponseData,
    auth=PermissionAuth(required_permissions=["manage_users"]),
)
def assign_role(request: HttpRequest, input: AssignRoleInputSerializer):
    try:
        user = User.objects.filter(
            role_user__user_with_role_user__unique_id=input.user_unique_id
        ).first()
        if not user:
            # Fall back to looking up via UserProfile unique_id
            from wdms_accounts.models import UserProfile
            profile = UserProfile.objects.filter(unique_id=input.user_unique_id).first()
            if not profile:
                return BaseNonPagedResponseData(
                    response=ResponseObject.get_response(3, "User not found")
                )
            user = profile.profile_user

        mgmt = UserManagementService()
        success = mgmt.assign_role_to_user(user, input.role_name)
        if not success:
            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(0, "Role assignment failed — check role name")
            )

        logger.info(
            f"Role '{input.role_name}' assigned to {user.username} by {request.user.username}"
        )
        return BaseNonPagedResponseData(
            response=ResponseObject.get_response(1, f"Role '{input.role_name}' assigned")
        )
    except Exception as e:
        logger.error(f"Role assignment error: {e}")
        return BaseNonPagedResponseData(response=ResponseObject.get_response(2, str(e)))


# ── Permission groups ─────────────────────────────────────────────────────────

@auth_router.get(
    "/permissions/grouped",
    response=PermissionGroupListResponseSerializer,
    auth=PermissionAuth(required_permissions=["manage_users"]),
)
def grouped_permissions(request: HttpRequest):
    try:
        groups = UserPermissionsGroup.objects.filter(is_active=True).prefetch_related(
            "permission_group"
        )
        data = [
            PermissionGroupSerializer(
                id=g.pk,
                name=g.name,
                permissions=[
                    PermissionItemSerializer(id=p.pk, code=p.code, name=p.name)
                    for p in g.permissions
                    if p.is_active
                ],
            )
            for g in groups
        ]
        return PermissionGroupListResponseSerializer(
            response=ResponseObject.get_response(1),
            data=data,
        )
    except Exception as e:
        logger.error(f"Error fetching permissions: {e}")
        return PermissionGroupListResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )
