from django.contrib.auth.models import User
from django.db import models

from wdms_utils.BaseModel import BaseModel


class AccountType(models.TextChoices):
    DEPOSITOR = "DEPOSITOR", "Depositor"
    STAFF = "STAFF", "Staff"
    MANAGER = "MANAGER", "Manager"
    CEO = "CEO", "Chief Executive Officer"
    REGULATOR = "REGULATOR", "Regulator"
    ADMIN = "ADMIN", "Administrator"


class PreferredLanguage(models.TextChoices):
    ENGLISH = "en", "English"
    SWAHILI = "sw", "Swahili"


class UserProfile(BaseModel):
    profile_user = models.OneToOneField(
        User, related_name="user_profile", on_delete=models.CASCADE
    )
    account_type = models.CharField(
        max_length=20,
        choices=AccountType.choices,
        default=AccountType.DEPOSITOR,
    )
    phone_number = models.CharField(max_length=50, blank=True)
    has_been_verified = models.BooleanField(default=False)
    preferred_language = models.CharField(
        max_length=2,
        choices=PreferredLanguage.choices,
        default=PreferredLanguage.ENGLISH,
    )
    # Tenant linkage — null for ADMIN accounts
    tenant = models.ForeignKey(
        "wdms_tenants.Tenant",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="user_profiles",
    )
    # Warehouse linkage — null for ADMIN, REGULATOR, and tenant-level managers
    warehouse = models.ForeignKey(
        "wdms_tenants.Warehouse",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="user_profiles",
    )

    class Meta:
        db_table = "user_profiles"
        ordering = ["-primary_key"]
        verbose_name_plural = "USER PROFILES"

    def __str__(self):
        return f"{self.profile_user.username} ({self.account_type})"


class ForgotPasswordRequestUser(BaseModel):
    user = models.ForeignKey(
        User, related_name="forgot_password_requests", on_delete=models.CASCADE
    )
    token = models.CharField(max_length=200)
    has_been_used = models.BooleanField(default=False)

    class Meta:
        db_table = "forgot_password_requests"
        ordering = ["-primary_key"]
        verbose_name_plural = "FORGOT PASSWORD REQUESTS"


class ActivateAccountTokenUser(BaseModel):
    user = models.ForeignKey(
        User, related_name="activation_tokens", on_delete=models.CASCADE
    )
    token = models.CharField(max_length=200)
    has_been_used = models.BooleanField(default=False)

    class Meta:
        db_table = "activate_account_tokens"
        ordering = ["-primary_key"]
        verbose_name_plural = "ACTIVATE ACCOUNT TOKENS"
