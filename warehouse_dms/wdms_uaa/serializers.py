from typing import List, Optional

from wdms_utils.SharedSerializer import BaseNonPagedResponseData, BaseSchema


class LoginInputSerializer(BaseSchema):
    username: str
    password: str


class GoogleLoginInputSerializer(BaseSchema):
    jwt_token: str


class UserInfoSerializer(BaseSchema):
    id: str
    user_name: str
    email: str
    first_name: str = ""
    last_name: str = ""


class RolePermissionSerializer(BaseSchema):
    role_name: str
    permissions: List[str] = []


class LoginResponseSerializer(BaseSchema):
    detail: str = ""
    access: str = ""
    refresh: str = ""
    expires: int = 0
    user: Optional[UserInfoSerializer] = None
    roles: List[RolePermissionSerializer] = []


class PermissionItemSerializer(BaseSchema):
    id: int
    code: str
    name: str


class PermissionGroupSerializer(BaseSchema):
    id: int
    name: str
    permissions: List[PermissionItemSerializer] = []


class PermissionGroupListResponseSerializer(BaseNonPagedResponseData):
    data: List[PermissionGroupSerializer] = []


class RoleItemSerializer(BaseSchema):
    id: int
    unique_id: str
    name: str
    description: str = ""
    is_seeded: bool


class RoleListResponseSerializer(BaseNonPagedResponseData):
    data: List[RoleItemSerializer] = []


class AssignRoleInputSerializer(BaseSchema):
    user_unique_id: str
    role_name: str
