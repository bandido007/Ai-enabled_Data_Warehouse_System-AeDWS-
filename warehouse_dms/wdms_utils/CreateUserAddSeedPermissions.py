"""
CreateUserAddSeedPermissions
============================
Idempotent seeder for roles, permissions, and the ADMIN superuser.

Run via the management command:
    python manage.py seed_permissions

Structure mirrors the secured_SRS CreateRolesAddPermissions pattern,
adapted for the Warehouse DMS permission groups and role names.

What this seeder does (in order):
1. Create every role listed in all_default_roles_added (skip if already exists).
2. For the ADMIN role, create the superuser account if it does not exist,
   attach a UserProfile, and link it to the ADMIN role.
3. For every permission group and code in wdms_utils.permissions:
   - Create the UserPermissionsGroup if missing.
   - Create each UserPermissions entry with permission_is_seeded=True.
4. Delete permissions that are seeded but no longer in the declared list
   (keeps the database in sync with code).
5. For each non-ADMIN role in role_permission_mappings, create the
   UserRolesWithPermissions links (skip if already linked).
6. Grant every UserPermissions row to the ADMIN role.
"""

import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction

from wdms_utils.permissions import permissions, role_permission_mappings

logger = logging.getLogger("wdms_logger")

# All roles that must exist in the database
all_default_roles_added = [
    settings.DEFAULT_SUPER_ADMIN_ROLE_NAME,  # ADMIN
    settings.DEPOSITOR_ROLE_NAME,
    settings.STAFF_ROLE_NAME,
    settings.MANAGER_ROLE_NAME,
    settings.CEO_ROLE_NAME,
    settings.REGULATOR_ROLE_NAME,
]


def CreateRolesAddPermissions():
    """
    Entry point — call this from the seed_permissions management command.
    The function is idempotent and safe to run multiple times.
    """
    try:
        # Late import so the seeder works before migrations have run app-by-app
        from wdms_uaa.models import (
            UserPermissions,
            UserPermissionsGroup,
            UserRoles,
            UserRolesWithPermissions,
        )
        from wdms_accounts.models import UserProfile

        with transaction.atomic():
            # ── Step 1: Create roles ──────────────────────────────────────────
            role_objects = {}
            for role_name in all_default_roles_added:
                role, created = UserRoles.objects.get_or_create(
                    name=role_name,
                    defaults={"description": f"{role_name} role", "is_seeded": True},
                )
                role_objects[role_name] = role
                if created:
                    logger.info(f"[seeder] Created role: {role_name}")

            # ── Step 2: Create ADMIN superuser ────────────────────────────────
            admin_role = role_objects[settings.DEFAULT_SUPER_ADMIN_ROLE_NAME]
            admin_user, admin_created = User.objects.get_or_create(
                username=settings.DEFAULT_SUPER_USERNAME,
                defaults={
                    "email": settings.DEFAULT_SUPER_EMAIL,
                    "is_staff": True,
                    "is_superuser": True,
                },
            )
            if admin_created:
                admin_user.set_password(settings.DEFAULT_SUPER_PASS)
                admin_user.save()
                logger.info(
                    f"[seeder] Created superuser: {settings.DEFAULT_SUPER_USERNAME}"
                )

            UserProfile.objects.get_or_create(
                profile_user=admin_user,
                defaults={
                    "account_type": settings.DEFAULT_SUPER_ADMIN_ROLE_NAME,
                    "has_been_verified": True,
                    "created_by": admin_user,
                },
            )

            from wdms_uaa.models import UsersWithRoles
            UsersWithRoles.objects.get_or_create(
                user_with_role_user=admin_user,
                user_with_role_role=admin_role,
                defaults={"created_by": admin_user},
            )

            # ── Step 3: Create permission groups and permissions ───────────────
            declared_codes = set()
            permission_objects = {}  # code → UserPermissions instance

            for group_def in permissions:
                group, _ = UserPermissionsGroup.objects.get_or_create(
                    name=group_def["permission_group"],
                    defaults={"is_global": True},
                )

                for code in group_def["permissions"]:
                    declared_codes.add(code)
                    perm, created = UserPermissions.objects.get_or_create(
                        code=code,
                        defaults={
                            "name": code.replace("_", " ").title(),
                            "group": group,
                            "permission_is_seeded": True,
                        },
                    )
                    permission_objects[code] = perm
                    if created:
                        logger.info(f"[seeder] Created permission: {code}")

            # ── Step 4: Remove stale seeded permissions ────────────────────────
            stale_permissions = UserPermissions.objects.filter(
                permission_is_seeded=True
            ).exclude(code__in=declared_codes)
            stale_count = stale_permissions.count()
            if stale_count:
                stale_permissions.delete()
                logger.info(f"[seeder] Deleted {stale_count} stale permissions")

            # ── Step 5: Link permissions to non-ADMIN roles ───────────────────
            for role_name, perm_codes in role_permission_mappings.items():
                role = role_objects.get(role_name)
                if not role:
                    continue
                for code in perm_codes:
                    perm = permission_objects.get(code)
                    if not perm:
                        continue
                    UserRolesWithPermissions.objects.get_or_create(
                        role_with_permission_role=role,
                        role_with_permission_permission=perm,
                        defaults={"permission_read_only": False, "created_by": admin_user},
                    )

            # ── Step 6: Grant every permission to ADMIN ───────────────────────
            for perm in UserPermissions.objects.all():
                UserRolesWithPermissions.objects.get_or_create(
                    role_with_permission_role=admin_role,
                    role_with_permission_permission=perm,
                    defaults={"permission_read_only": False, "created_by": admin_user},
                )

            logger.info("[seeder] Seed complete.")

    except Exception as e:
        logger.error(f"[seeder] Seed failed: {e}")
        raise
