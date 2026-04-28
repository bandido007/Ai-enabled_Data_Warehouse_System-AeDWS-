from django.contrib.auth.models import User
from django.db import models

from wdms_utils.BaseModel import BaseModel


class UserPermissionsGroup(BaseModel):
    name = models.CharField(max_length=9000)
    is_global = models.BooleanField(default=False)
    description = models.CharField(default="", max_length=600, null=True)

    @property
    def permissions(self):
        return self.permission_group.all()

    class Meta:
        db_table = "user_permissions_group"
        ordering = ["-primary_key"]
        verbose_name_plural = "PERMISSIONS GROUP"

    def __str__(self):
        return self.name


class UserPermissions(BaseModel):
    name = models.CharField(default="", max_length=9000)
    code = models.CharField(default="", max_length=9000)
    group = models.ForeignKey(
        UserPermissionsGroup,
        related_name="permission_group",
        on_delete=models.CASCADE,
        null=True,
    )
    permission_is_seeded = models.BooleanField(default=False)

    class Meta:
        db_table = "user_permissions"
        ordering = ["-primary_key"]
        verbose_name_plural = "USER PERMISSIONS"

    def __str__(self):
        return self.code


class UserRoles(BaseModel):
    name = models.CharField(max_length=9000)
    description = models.CharField(default="", max_length=9000)
    is_seeded = models.BooleanField(default=False)

    @property
    def permissions(self):
        return self.get_user_permissions_list()

    def get_permissions(self):
        return self.user_role_with_permission_role.all()

    def get_user_permissions_list(self):
        return [perm.role_with_permission_permission for perm in self.get_permissions()]

    def get_serializable_permissions(self):
        """Returns a flat list of permission codes (strings)."""
        return [
            perm.role_with_permission_permission.code
            for perm in self.user_role_with_permission_role.all()
        ]

    class Meta:
        db_table = "user_roles"
        ordering = ["-primary_key"]
        verbose_name_plural = "USER ROLES"

    def __str__(self):
        return self.name


class UserRolesWithPermissions(BaseModel):
    role_with_permission_role = models.ForeignKey(
        UserRoles,
        related_name="user_role_with_permission_role",
        on_delete=models.CASCADE,
    )
    role_with_permission_permission = models.ForeignKey(
        UserPermissions,
        related_name="user_role_with_permission_permission",
        on_delete=models.CASCADE,
        null=True,
    )
    permission_read_only = models.BooleanField(default=True)

    class Meta:
        db_table = "user_role_with_permissions"
        ordering = ["-primary_key"]
        verbose_name_plural = "ROLES WITH PERMISSIONS"


class UsersWithRoles(BaseModel):
    user_with_role_role = models.ForeignKey(
        UserRoles,
        related_name="user_role_name",
        on_delete=models.CASCADE,
    )
    user_with_role_user = models.ForeignKey(
        User,
        related_name="role_user",
        on_delete=models.CASCADE,
    )

    class Meta:
        db_table = "user_with_roles"
        ordering = ["-primary_key"]
        verbose_name_plural = "USERS WITH ROLES"


class LoginAttempt(BaseModel):
    username = models.CharField(max_length=255, db_index=True)
    ip_address = models.CharField(null=True, max_length=10000)
    attempts = models.IntegerField(default=0)
    first_attempt_time = models.DateTimeField(auto_now_add=True)
    blocked_time = models.DateTimeField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, db_index=True, null=True)
    http_accept = models.CharField(max_length=1025, null=True)
    path_info = models.CharField(max_length=255, null=True)

    class Meta:
        db_table = "login_attempts"
        ordering = ["-first_attempt_time"]
        verbose_name_plural = "LOGIN ATTEMPTS"
