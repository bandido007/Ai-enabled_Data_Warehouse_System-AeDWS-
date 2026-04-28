import logging

from django.contrib.auth.models import User
from django.db import transaction
from django.http import HttpRequest
from ninja import Query, Router

from wdms_accounts.models import ActivateAccountTokenUser, ForgotPasswordRequestUser, UserProfile
from wdms_accounts.serializers import (
    AdminCreateUserInputSerializer,
    ChangePasswordInputSerializer,
    ForgotPasswordInputSerializer,
    RegisterInputSerializer,
    UserProfileFilteringSerializer,
    UserProfileNonPagedResponseSerializer,
    UserProfilePagedResponseSerializer,
    UserProfileUpdateSerializer,
    VerifyAccountInputSerializer,
)
from wdms_uaa.authentication.user_management import UserManagementService
from wdms_uaa.authorization import PermissionAuth
from wdms_utils.response import ResponseObject, get_paginated_and_non_paginated_data
from wdms_utils.SharedSerializer import BaseNonPagedResponseData
from wdms_utils.tokens import get_activation_token, get_forgot_password_token

logger = logging.getLogger("wdms_logger")

accounts_router = Router()


# ── Registration ──────────────────────────────────────────────────────────────

@accounts_router.post("/register", response=BaseNonPagedResponseData, auth=None)
def register(request: HttpRequest, input: RegisterInputSerializer):
    try:
        if User.objects.filter(username=input.username).exists():
            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(0, "Username already taken")
            )
        if User.objects.filter(email=input.email).exists():
            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(0, "Email already registered")
            )

        with transaction.atomic():
            mgmt = UserManagementService()
            user = mgmt.create_user(
                username=input.username,
                email=input.email,
                password=input.password,
                first_name=input.first_name,
                last_name=input.last_name,
            )
            if not user:
                return BaseNonPagedResponseData(
                    response=ResponseObject.get_response(0, "Registration failed")
                )

            profile = UserProfile.objects.filter(profile_user=user).first()
            if profile:
                profile.phone_number = input.phone_number
                profile.preferred_language = input.preferred_language
                profile.save()

            token = get_activation_token()
            ActivateAccountTokenUser.objects.create(
                user=user, token=token, created_by=user
            )

        logger.info(f"New user registered: {user.username}")
        # TODO Phase 3: dispatch verification email here
        return BaseNonPagedResponseData(
            response=ResponseObject.get_response(
                1, "Registration successful. Check your email to verify your account."
            )
        )
    except Exception as e:
        logger.error(f"Registration error: {e}")
        return BaseNonPagedResponseData(response=ResponseObject.get_response(2, str(e)))


@accounts_router.post("/verify", response=BaseNonPagedResponseData, auth=None)
def verify_account(request: HttpRequest, input: VerifyAccountInputSerializer):
    try:
        token_obj = ActivateAccountTokenUser.objects.filter(
            token=input.token, has_been_used=False, is_active=True
        ).select_related("user").first()

        if not token_obj:
            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(3, "Invalid or expired verification token")
            )

        with transaction.atomic():
            token_obj.has_been_used = True
            token_obj.save()

            profile = UserProfile.objects.filter(profile_user=token_obj.user).first()
            if profile:
                profile.has_been_verified = True
                profile.save()

        logger.info(f"Account verified: {token_obj.user.username}")
        return BaseNonPagedResponseData(
            response=ResponseObject.get_response(1, "Account verified successfully")
        )
    except Exception as e:
        logger.error(f"Account verification error: {e}")
        return BaseNonPagedResponseData(response=ResponseObject.get_response(2, str(e)))


# ── Password management ───────────────────────────────────────────────────────

@accounts_router.post("/forgot-password", response=BaseNonPagedResponseData, auth=None)
def forgot_password(request: HttpRequest, input: ForgotPasswordInputSerializer):
    try:
        user = User.objects.filter(email=input.email).first()
        if not user:
            # Return success to prevent email enumeration
            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(
                    1, "If that email is registered you will receive a reset link"
                )
            )

        token = get_forgot_password_token()
        ForgotPasswordRequestUser.objects.create(
            user=user, token=token, created_by=user
        )

        logger.info(f"Password reset requested for: {user.email}")
        # TODO Phase 3: dispatch reset email here
        return BaseNonPagedResponseData(
            response=ResponseObject.get_response(
                1, "If that email is registered you will receive a reset link"
            )
        )
    except Exception as e:
        logger.error(f"Forgot password error: {e}")
        return BaseNonPagedResponseData(response=ResponseObject.get_response(2, str(e)))


@accounts_router.post("/change-password", response=BaseNonPagedResponseData, auth=None)
def change_password(request: HttpRequest, input: ChangePasswordInputSerializer):
    try:
        token_obj = ForgotPasswordRequestUser.objects.filter(
            token=input.token, has_been_used=False, is_active=True
        ).select_related("user").first()

        if not token_obj:
            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(3, "Invalid or expired reset token")
            )

        with transaction.atomic():
            token_obj.user.set_password(input.new_password)
            token_obj.user.save()
            token_obj.has_been_used = True
            token_obj.save()

        logger.info(f"Password changed for: {token_obj.user.username}")
        return BaseNonPagedResponseData(
            response=ResponseObject.get_response(1, "Password changed successfully")
        )
    except Exception as e:
        logger.error(f"Change password error: {e}")
        return BaseNonPagedResponseData(response=ResponseObject.get_response(2, str(e)))


# ── My profile ────────────────────────────────────────────────────────────────

@accounts_router.get(
    "/me",
    response=UserProfileNonPagedResponseSerializer,
    auth=PermissionAuth(),
)
def get_my_profile(request: HttpRequest):
    try:
        profile = (
            UserProfile.objects.select_related("profile_user", "tenant", "warehouse")
            .filter(profile_user=request.user, is_active=True)
            .first()
        )
        if not profile:
            return UserProfileNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Profile not found")
            )
        return UserProfileNonPagedResponseSerializer(
            response=ResponseObject.get_response(1),
            data=profile,
        )
    except Exception as e:
        logger.error(f"Get profile error: {e}")
        return UserProfileNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


@accounts_router.put(
    "/me",
    response=UserProfileNonPagedResponseSerializer,
    auth=PermissionAuth(),
)
def update_my_profile(request: HttpRequest, input: UserProfileUpdateSerializer):
    try:
        profile = UserProfile.objects.filter(
            profile_user=request.user, is_active=True
        ).first()
        if not profile:
            return UserProfileNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Profile not found")
            )

        user = profile.profile_user
        user.first_name = input.first_name or user.first_name
        user.last_name = input.last_name or user.last_name
        user.save()

        profile.phone_number = input.phone_number or profile.phone_number
        profile.preferred_language = input.preferred_language
        profile.save()

        logger.info(f"Profile updated: {user.username}")
        return UserProfileNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, "Profile updated"),
            data=profile,
        )
    except Exception as e:
        logger.error(f"Update profile error: {e}")
        return UserProfileNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


# ── Admin user management ─────────────────────────────────────────────────────

@accounts_router.get(
    "/users",
    response=UserProfilePagedResponseSerializer,
    auth=PermissionAuth(required_permissions=["manage_users"]),
)
def list_users(
    request: HttpRequest,
    filtering: Query[UserProfileFilteringSerializer] = None,
):
    try:
        queryset = UserProfile.objects.select_related(
            "profile_user", "tenant", "warehouse", "created_by"
        ).all()
        return get_paginated_and_non_paginated_data(
            queryset, filtering, UserProfilePagedResponseSerializer
        )
    except Exception as e:
        logger.error(f"List users error: {e}")
        return UserProfilePagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


@accounts_router.post(
    "/users/create",
    response=BaseNonPagedResponseData,
    auth=PermissionAuth(required_permissions=["manage_users"]),
)
def admin_create_user(request: HttpRequest, input: AdminCreateUserInputSerializer):
    try:
        if User.objects.filter(username=input.username).exists():
            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(0, "Username already taken")
            )
        if User.objects.filter(email=input.email).exists():
            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(0, "Email already registered")
            )

        with transaction.atomic():
            mgmt = UserManagementService()
            user = mgmt.create_user(
                username=input.username,
                email=input.email,
                password=input.password,
                first_name=input.first_name,
                last_name=input.last_name,
            )
            if not user:
                return BaseNonPagedResponseData(
                    response=ResponseObject.get_response(0, "User creation failed")
                )

            mgmt.assign_role_to_user(user, input.role_name)

            profile = UserProfile.objects.filter(profile_user=user).first()
            if profile:
                profile.phone_number = input.phone_number
                profile.account_type = input.account_type
                profile.has_been_verified = True
                profile.created_by = request.user

                if input.tenant_unique_id:
                    from wdms_tenants.models import Tenant
                    tenant = Tenant.objects.filter(unique_id=input.tenant_unique_id).first()
                    if tenant:
                        profile.tenant = tenant

                if input.warehouse_unique_id:
                    from wdms_tenants.models import Warehouse
                    warehouse = Warehouse.objects.filter(
                        unique_id=input.warehouse_unique_id
                    ).first()
                    if warehouse:
                        profile.warehouse = warehouse

                profile.save()

        logger.info(
            f"Admin created user: {user.username} with role {input.role_name} "
            f"by {request.user.username}"
        )
        return BaseNonPagedResponseData(
            response=ResponseObject.get_response(1, f"User '{input.username}' created")
        )
    except Exception as e:
        logger.error(f"Admin create user error: {e}")
        return BaseNonPagedResponseData(response=ResponseObject.get_response(2, str(e)))
