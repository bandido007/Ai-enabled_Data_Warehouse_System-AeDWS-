from django.contrib import admin

from .models import Region, Tenant, Warehouse


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active", "created_date")
    list_filter = ("is_active",)
    search_fields = ("name", "code", "description")


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "registration_number",
        "region_name",
        "email",
        "phone_number",
        "is_active",
        "created_date",
    )
    list_filter = ("region", "is_active")
    search_fields = ("name", "registration_number", "email", "phone_number", "address")
    autocomplete_fields = ("region",)


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "tenant_name",
        "region_name",
        "registration_number",
        "capacity",
        "capacity_unit",
        "is_verified",
        "is_active",
        "created_date",
    )
    list_filter = ("tenant", "region", "is_verified", "is_active")
    search_fields = (
        "name",
        "registration_number",
        "tenant__name",
        "region__name",
        "address",
    )
    autocomplete_fields = ("tenant", "region")
