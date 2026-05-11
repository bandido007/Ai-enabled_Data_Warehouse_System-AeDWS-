from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import model_validator

from wdms_utils.SharedSerializer import (
    BaseInputSerializer,
    BaseNonPagedResponseData,
    BasePagedFilteringSerializer,
    BasePagedResponseList,
    BaseSchema,
    BaseSerializer,
)


class UserProfileTableSerializer(BaseSerializer):
    username: str = ""
    email: str = ""
    first_name: str = ""
    last_name: str = ""
    account_type: str = ""
    phone_number: str = ""
    has_been_verified: bool = False
    preferred_language: str = "en"
    tenant_id: Optional[int] = None
    tenant_unique_id: Optional[UUID] = None
    tenant_name: Optional[str] = None
    warehouse_id: Optional[int] = None
    warehouse_unique_id: Optional[UUID] = None
    warehouse_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def extract_fields(cls, data):
        if hasattr(data, "profile_user"):
            prefetched_roles = []
            prefetched_cache = getattr(data.profile_user, "_prefetched_objects_cache", {})
            if isinstance(prefetched_cache, dict):
                prefetched_roles = prefetched_cache.get("role_user", []) or []

            active_assignment = next(
                (
                    assignment
                    for assignment in prefetched_roles
                    if getattr(assignment, "is_active", False)
                    and getattr(getattr(assignment, "user_with_role_role", None), "is_active", False)
                ),
                None,
            )

            if active_assignment is None:
                active_assignment = (
                    data.profile_user.role_user.filter(
                        is_active=True,
                        user_with_role_role__is_active=True,
                    )
                    .select_related("user_with_role_role")
                    .first()
                )

            effective_role = (
                active_assignment.user_with_role_role.name
                if active_assignment and active_assignment.user_with_role_role
                else data.account_type
            )

            return {
                "id": data.pk,
                "unique_id": data.unique_id,
                "created_date": data.created_date,
                "updated_date": data.updated_date,
                "is_active": data.is_active,
                "created_by": (
                    {
                        "username": data.created_by.username,
                        "first_name": data.created_by.first_name,
                        "last_name": data.created_by.last_name,
                    }
                    if data.created_by
                    else None
                ),
                "username": data.profile_user.username,
                "email": data.profile_user.email,
                "first_name": data.profile_user.first_name,
                "last_name": data.profile_user.last_name,
                "account_type": effective_role,
                "phone_number": data.phone_number,
                "has_been_verified": data.has_been_verified,
                "preferred_language": data.preferred_language,
                "tenant_id": data.tenant_id,
                "tenant_unique_id": data.tenant.unique_id if data.tenant else None,
                "tenant_name": data.tenant.name if data.tenant else None,
                "warehouse_id": data.warehouse_id,
                "warehouse_unique_id": data.warehouse.unique_id if data.warehouse else None,
                "warehouse_name": data.warehouse.name if data.warehouse else None,
            }
        return data


class UserProfileInputSerializer(BaseInputSerializer):
    username: str
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""
    phone_number: str = ""
    preferred_language: str = "en"
    account_type: Optional[str] = None


class UserProfileUpdateSerializer(BaseSchema):
    unique_id: str
    first_name: str = ""
    last_name: str = ""
    phone_number: str = ""
    preferred_language: str = "en"


class UserProfileFilteringSerializer(BasePagedFilteringSerializer):
    account_type: Optional[str] = None
    has_been_verified: Optional[bool] = None
    tenant_id: Optional[int] = None
    warehouse_id: Optional[int] = None


class UserProfilePagedResponseSerializer(BasePagedResponseList):
    data: list[UserProfileTableSerializer] | None = None


class UserProfileNonPagedResponseSerializer(BaseNonPagedResponseData):
    data: Optional[UserProfileTableSerializer] = None


class RegisterInputSerializer(BaseSchema):
    username: str
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""
    phone_number: str = ""
    preferred_language: str = "en"


class VerifyAccountInputSerializer(BaseSchema):
    token: str


class ForgotPasswordInputSerializer(BaseSchema):
    email: str


class ChangePasswordInputSerializer(BaseSchema):
    token: str
    new_password: str


class AuthenticatedChangePasswordInputSerializer(BaseSchema):
    current_password: str
    new_password: str


class AdminCreateUserInputSerializer(BaseSchema):
    username: str
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""
    phone_number: str = ""
    account_type: str = "DEPOSITOR"
    role_name: str = "DEPOSITOR"
    has_been_verified: bool = True
    tenant_unique_id: Optional[str] = None
    warehouse_unique_id: Optional[str] = None


class AdminUpdateUserInputSerializer(BaseSchema):
    username: str
    email: str
    first_name: str = ""
    last_name: str = ""
    phone_number: str = ""
    account_type: str = "DEPOSITOR"
    role_name: str = "DEPOSITOR"
    has_been_verified: bool = True
    tenant_unique_id: Optional[str] = None
    warehouse_unique_id: Optional[str] = None


class AdminResetPasswordInputSerializer(BaseSchema):
    new_password: str
