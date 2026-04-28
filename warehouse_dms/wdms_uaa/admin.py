from django.contrib import admin

from .models import (
    LoginAttempt,
    UserPermissions,
    UserPermissionsGroup,
    UserRoles,
    UserRolesWithPermissions,
    UsersWithRoles,
)

admin.site.register(UserPermissionsGroup)
admin.site.register(UserPermissions)
admin.site.register(UserRoles)
admin.site.register(UserRolesWithPermissions)
admin.site.register(UsersWithRoles)
admin.site.register(LoginAttempt)
