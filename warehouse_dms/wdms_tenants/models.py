from django.contrib.auth.models import User
from django.db import models

from wdms_utils.BaseModel import BaseModel


class Region(BaseModel):
    """Administrative region (e.g. a Tanzania region)."""

    name = models.CharField(max_length=255)
    code = models.CharField(max_length=10, unique=True, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        db_table = "regions"
        ordering = ["name"]
        verbose_name_plural = "REGIONS"

    def __str__(self):
        return self.name


class Tenant(BaseModel):
    """A tenant organisation that owns one or more warehouses."""

    name = models.CharField(max_length=255)
    registration_number = models.CharField(max_length=100, blank=True)
    phone_number = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    region = models.ForeignKey(
        Region,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="tenants",
    )
    logo_url = models.URLField(blank=True)

    class Meta:
        db_table = "tenants"
        ordering = ["-primary_key"]
        verbose_name_plural = "TENANTS"

    def __str__(self):
        return self.name


class Warehouse(BaseModel):
    """A physical warehouse belonging to a tenant."""

    name = models.CharField(max_length=255)
    tenant = models.ForeignKey(
        Tenant, related_name="warehouses", on_delete=models.CASCADE
    )
    region = models.ForeignKey(
        Region,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="warehouses",
    )
    address = models.TextField(blank=True)
    phone_number = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    capacity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    capacity_unit = models.CharField(max_length=20, default="MT")  # metric tonnes
    registration_number = models.CharField(max_length=100, blank=True)
    is_verified = models.BooleanField(default=False)

    class Meta:
        db_table = "warehouses"
        ordering = ["-primary_key"]
        verbose_name_plural = "WAREHOUSES"

    def __str__(self):
        return f"{self.name} ({self.tenant.name})"
