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
    tenant_name: Optional[str] = None
    warehouse_id: Optional[int] = None
    warehouse_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def extract_fields(cls, data):
        if hasattr(data, "profile_user"):
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
                "account_type": data.account_type,
                "phone_number": data.phone_number,
                "has_been_verified": data.has_been_verified,
                "preferred_language": data.preferred_language,
                "tenant_id": data.tenant_id,
                "tenant_name": data.tenant.name if data.tenant else None,
                "warehouse_id": data.warehouse_id,
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


class AdminCreateUserInputSerializer(BaseSchema):
    username: str
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""
    phone_number: str = ""
    account_type: str = "DEPOSITOR"
    role_name: str = "DEPOSITOR"
    tenant_unique_id: Optional[str] = None
    warehouse_unique_id: Optional[str] = None
