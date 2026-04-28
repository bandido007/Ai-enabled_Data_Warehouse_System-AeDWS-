import logging
from typing import Optional

from django.conf import settings
from django.contrib.auth.models import User

logger = logging.getLogger("wdms_logger")


class UserManagementService:
    """Layer 3 — Account lifecycle.

    Creates, updates, and assigns roles to user accounts. Does NOT
    authenticate — it only provisions.
    """

    def create_or_update_user_from_google(
        self,
        email: str,
        given_name: str = "",
        family_name: str = "",
    ) -> Optional[User]:
        try:
            user, created = User.objects.update_or_create(
                username=email,
                defaults={
                    "email": email,
                    "first_name": given_name,
                    "last_name": family_name,
                },
            )
            if created:
                user.set_password(settings.DEFAULT_USER_PASSWORD)
                user.save()

            from wdms_accounts.models import UserProfile

            UserProfile.objects.get_or_create(
                profile_user=user,
                defaults={
                    "has_been_verified": True,
                    "account_type": settings.DEPOSITOR_ROLE_NAME,
                    "created_by": user,
                },
            )

            if created:
                self.assign_default_role(user)
            return user
        except Exception as e:
            logger.error(f"Failed to create/update Google user: {e}")
            return None

    def assign_default_role(self, user: User) -> bool:
        """Assign DEPOSITOR as the default role for self-registered users."""
        try:
            from wdms_uaa.models import UserRoles, UsersWithRoles

            default_role = UserRoles.objects.filter(
                name=settings.DEFAULT_NORMAL_USER_ROLE
            ).first()
            if not default_role:
                logger.warning("Default role not found — has seed_permissions been run?")
                return False
            UsersWithRoles.objects.get_or_create(
                user_with_role_role=default_role,
                user_with_role_user=user,
                defaults={"created_by": user},
            )
            return True
        except Exception as e:
            logger.error(f"Failed to assign default role: {e}")
            return False

    def create_user(
        self,
        username: str,
        email: str,
        password: str,
        first_name: str = "",
        last_name: str = "",
    ) -> Optional[User]:
        try:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
            )
            from wdms_accounts.models import UserProfile

            UserProfile.objects.create(
                profile_user=user,
                has_been_verified=False,
                account_type=settings.DEPOSITOR_ROLE_NAME,
                created_by=user,
            )
            self.assign_default_role(user)
            return user
        except Exception as e:
            logger.error(f"Failed to create user: {e}")
            return None

    def assign_role_to_user(self, user: User, role_name: str) -> bool:
        """Replace all existing role assignments with the new one."""
        try:
            valid_roles = [
                settings.DEFAULT_SUPER_ADMIN_ROLE_NAME,
                settings.DEPOSITOR_ROLE_NAME,
                settings.STAFF_ROLE_NAME,
                settings.MANAGER_ROLE_NAME,
                settings.CEO_ROLE_NAME,
                settings.REGULATOR_ROLE_NAME,
            ]
            if role_name not in valid_roles:
                logger.warning(f"Role '{role_name}' is not a recognised WDMS role")
                return False

            from wdms_uaa.models import UserRoles, UsersWithRoles

            role = UserRoles.objects.filter(name=role_name).first()
            if not role:
                return False

            UsersWithRoles.objects.filter(user_with_role_user=user).delete()
            UsersWithRoles.objects.create(
                user_with_role_user=user,
                user_with_role_role=role,
                created_by=user,
            )

            from wdms_accounts.models import UserProfile

            profile = UserProfile.objects.filter(profile_user=user).first()
            if profile:
                profile.account_type = role_name
                profile.save()
            return True
        except Exception as e:
            logger.error(f"Failed to assign role: {e}")
            return False

    def get_user_role(self, user: User) -> Optional[str]:
        try:
            from wdms_uaa.models import UsersWithRoles

            ur = UsersWithRoles.objects.filter(
                user_with_role_user=user, is_active=True
            ).first()
            return ur.user_with_role_role.name if ur else None
        except Exception:
            return None
