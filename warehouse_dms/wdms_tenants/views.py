import logging

from django.http import HttpRequest
from ninja import Query, Router

from wdms_tenants.models import Region, Tenant, Warehouse
from wdms_tenants.querysets import get_regulator_queryset, get_tenant_queryset
from wdms_tenants.serializers import (
    RegionFilteringSerializer,
    RegionInputSerializer,
    RegionNonPagedResponseSerializer,
    RegionPagedResponseSerializer,
    RegionTableSerializer,
    TenantFilteringSerializer,
    TenantInputSerializer,
    TenantNonPagedResponseSerializer,
    TenantPagedResponseSerializer,
    TenantTableSerializer,
    WarehouseFilteringSerializer,
    WarehouseInputSerializer,
    WarehouseNonPagedResponseSerializer,
    WarehousePagedResponseSerializer,
    WarehouseTableSerializer,
)
from wdms_uaa.authorization import PermissionAuth
from wdms_uaa.models import UsersWithRoles
from wdms_utils.response import ResponseObject, get_paginated_and_non_paginated_data
from wdms_utils.SharedSerializer import BaseNonPagedResponseData

logger = logging.getLogger("wdms_logger")

tenants_router = Router()

_admin_auth = PermissionAuth(required_permissions=["manage_tenants"])
_auth = PermissionAuth()


def _get_user_role(user) -> str | None:
    user_role = (
        UsersWithRoles.objects.filter(user_with_role_user=user, is_active=True)
        .select_related("user_with_role_role")
        .first()
    )
    return user_role.user_with_role_role.name if user_role else None


# ── Regions ───────────────────────────────────────────────────────────────────

@tenants_router.get("/regions", response=RegionPagedResponseSerializer, auth=_auth)
def list_regions(
    request: HttpRequest,
    filtering: Query[RegionFilteringSerializer] = None,
):
    try:
        queryset = Region.objects.all()
        return get_paginated_and_non_paginated_data(
            queryset, filtering, RegionPagedResponseSerializer
        )
    except Exception as e:
        logger.error(f"List regions error: {e}")
        return RegionPagedResponseSerializer(response=ResponseObject.get_response(2, str(e)))


@tenants_router.post(
    "/regions",
    response=RegionNonPagedResponseSerializer,
    auth=_admin_auth,
)
def create_region(request: HttpRequest, input: RegionInputSerializer):
    try:
        region = Region.objects.create(
            name=input.name,
            code=input.code,
            description=input.description,
            created_by=request.user,
        )
        return RegionNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, "Region created"),
            data=RegionTableSerializer.model_validate(region),
        )
    except Exception as e:
        logger.error(f"Create region error: {e}")
        return RegionNonPagedResponseSerializer(response=ResponseObject.get_response(2, str(e)))


@tenants_router.put(
    "/regions/{unique_id}",
    response=RegionNonPagedResponseSerializer,
    auth=_admin_auth,
)
def update_region(request: HttpRequest, unique_id: str, input: RegionInputSerializer):
    try:
        region = Region.objects.filter(unique_id=unique_id, is_active=True).first()
        if not region:
            return RegionNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Region not found")
            )
        region.name = input.name
        region.code = input.code
        region.description = input.description
        region.save()
        return RegionNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, "Region updated"),
            data=RegionTableSerializer.model_validate(region),
        )
    except Exception as e:
        logger.error(f"Update region error: {e}")
        return RegionNonPagedResponseSerializer(response=ResponseObject.get_response(2, str(e)))


@tenants_router.delete(
    "/regions/{unique_id}",
    response=BaseNonPagedResponseData,
    auth=_admin_auth,
)
def delete_region(request: HttpRequest, unique_id: str):
    try:
        region = Region.objects.filter(unique_id=unique_id, is_active=True).first()
        if not region:
            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(3, "Region not found")
            )
        region.is_active = False
        region.save()
        return BaseNonPagedResponseData(response=ResponseObject.get_response(1, "Region deleted"))
    except Exception as e:
        logger.error(f"Delete region error: {e}")
        return BaseNonPagedResponseData(response=ResponseObject.get_response(2, str(e)))


# ── Tenants ───────────────────────────────────────────────────────────────────

@tenants_router.get("/", response=TenantPagedResponseSerializer, auth=_admin_auth)
def list_tenants(
    request: HttpRequest,
    filtering: Query[TenantFilteringSerializer] = None,
):
    try:
        queryset = Tenant.objects.select_related("region", "created_by").all()
        return get_paginated_and_non_paginated_data(
            queryset, filtering, TenantPagedResponseSerializer
        )
    except Exception as e:
        logger.error(f"List tenants error: {e}")
        return TenantPagedResponseSerializer(response=ResponseObject.get_response(2, str(e)))


@tenants_router.post("/", response=TenantNonPagedResponseSerializer, auth=_admin_auth)
def create_tenant(request: HttpRequest, input: TenantInputSerializer):
    try:
        region = None
        if input.region_unique_id:
            region = Region.objects.filter(unique_id=input.region_unique_id).first()

        tenant = Tenant.objects.create(
            name=input.name,
            registration_number=input.registration_number,
            phone_number=input.phone_number,
            email=input.email,
            address=input.address,
            region=region,
            logo_url=input.logo_url,
            created_by=request.user,
        )
        return TenantNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, "Tenant created"),
            data=TenantTableSerializer.model_validate(tenant),
        )
    except Exception as e:
        logger.error(f"Create tenant error: {e}")
        return TenantNonPagedResponseSerializer(response=ResponseObject.get_response(2, str(e)))


# ── Warehouses — declared BEFORE /{unique_id} to avoid route shadowing ────────

@tenants_router.get(
    "/warehouses",
    response=WarehousePagedResponseSerializer,
    auth=_auth,
)
def list_warehouses(
    request: HttpRequest,
    filtering: Query[WarehouseFilteringSerializer] = None,
):
    try:
        if getattr(request.user, "is_superuser", False):
            queryset = Warehouse.objects.filter(is_active=True)
        elif _get_user_role(request.user) == "REGULATOR":
            queryset = get_regulator_queryset(request.user)
        else:
            queryset = get_tenant_queryset(request.user)
        return get_paginated_and_non_paginated_data(
            queryset, filtering, WarehousePagedResponseSerializer
        )
    except Exception as e:
        logger.error(f"List warehouses error: {e}")
        return WarehousePagedResponseSerializer(response=ResponseObject.get_response(2, str(e)))


@tenants_router.post(
    "/warehouses",
    response=WarehouseNonPagedResponseSerializer,
    auth=_admin_auth,
)
def create_warehouse(request: HttpRequest, input: WarehouseInputSerializer):
    try:
        tenant = Tenant.objects.filter(
            unique_id=input.tenant_unique_id, is_active=True
        ).first()
        if not tenant:
            return WarehouseNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Tenant not found")
            )

        region = None
        if input.region_unique_id:
            region = Region.objects.filter(unique_id=input.region_unique_id).first()

        warehouse = Warehouse.objects.create(
            name=input.name,
            tenant=tenant,
            region=region,
            address=input.address,
            phone_number=input.phone_number,
            email=input.email,
            capacity=input.capacity,
            capacity_unit=input.capacity_unit,
            registration_number=input.registration_number,
            created_by=request.user,
        )
        return WarehouseNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, "Warehouse created"),
            data=WarehouseTableSerializer.model_validate(warehouse),
        )
    except Exception as e:
        logger.error(f"Create warehouse error: {e}")
        return WarehouseNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


@tenants_router.put(
    "/warehouses/{unique_id}",
    response=WarehouseNonPagedResponseSerializer,
    auth=_admin_auth,
)
def update_warehouse(request: HttpRequest, unique_id: str, input: WarehouseInputSerializer):
    try:
        warehouse = Warehouse.objects.filter(unique_id=unique_id, is_active=True).first()
        if not warehouse:
            return WarehouseNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Warehouse not found")
            )

        if input.region_unique_id:
            region = Region.objects.filter(unique_id=input.region_unique_id).first()
            if region:
                warehouse.region = region

        warehouse.name = input.name or warehouse.name
        warehouse.address = input.address or warehouse.address
        warehouse.phone_number = input.phone_number or warehouse.phone_number
        warehouse.email = input.email or warehouse.email
        warehouse.capacity = input.capacity or warehouse.capacity
        warehouse.capacity_unit = input.capacity_unit or warehouse.capacity_unit
        warehouse.registration_number = (
            input.registration_number or warehouse.registration_number
        )
        warehouse.save()
        return WarehouseNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, "Warehouse updated"),
            data=WarehouseTableSerializer.model_validate(warehouse),
        )
    except Exception as e:
        logger.error(f"Update warehouse error: {e}")
        return WarehouseNonPagedResponseSerializer(
            response=ResponseObject.get_response(2, str(e))
        )


@tenants_router.delete(
    "/warehouses/{unique_id}",
    response=BaseNonPagedResponseData,
    auth=_admin_auth,
)
def delete_warehouse(request: HttpRequest, unique_id: str):
    try:
        warehouse = Warehouse.objects.filter(unique_id=unique_id, is_active=True).first()
        if not warehouse:
            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(3, "Warehouse not found")
            )
        warehouse.is_active = False
        warehouse.save()
        return BaseNonPagedResponseData(
            response=ResponseObject.get_response(1, "Warehouse deleted")
        )
    except Exception as e:
        logger.error(f"Delete warehouse error: {e}")
        return BaseNonPagedResponseData(response=ResponseObject.get_response(2, str(e)))


# ── Tenant detail mutation (PUT/DELETE /{unique_id} — kept AFTER /warehouses) ─

@tenants_router.put(
    "/{unique_id}",
    response=TenantNonPagedResponseSerializer,
    auth=_admin_auth,
)
def update_tenant(request: HttpRequest, unique_id: str, input: TenantInputSerializer):
    try:
        tenant = Tenant.objects.filter(unique_id=unique_id, is_active=True).first()
        if not tenant:
            return TenantNonPagedResponseSerializer(
                response=ResponseObject.get_response(3, "Tenant not found")
            )
        if input.region_unique_id:
            region = Region.objects.filter(unique_id=input.region_unique_id).first()
            if region:
                tenant.region = region

        tenant.name = input.name or tenant.name
        tenant.registration_number = input.registration_number or tenant.registration_number
        tenant.phone_number = input.phone_number or tenant.phone_number
        tenant.email = input.email or tenant.email
        tenant.address = input.address or tenant.address
        tenant.logo_url = input.logo_url or tenant.logo_url
        tenant.save()
        return TenantNonPagedResponseSerializer(
            response=ResponseObject.get_response(1, "Tenant updated"),
            data=TenantTableSerializer.model_validate(tenant),
        )
    except Exception as e:
        logger.error(f"Update tenant error: {e}")
        return TenantNonPagedResponseSerializer(response=ResponseObject.get_response(2, str(e)))


@tenants_router.delete(
    "/{unique_id}",
    response=BaseNonPagedResponseData,
    auth=_admin_auth,
)
def delete_tenant(request: HttpRequest, unique_id: str):
    try:
        tenant = Tenant.objects.filter(unique_id=unique_id, is_active=True).first()
        if not tenant:
            return BaseNonPagedResponseData(
                response=ResponseObject.get_response(3, "Tenant not found")
            )
        tenant.is_active = False
        tenant.save()
        return BaseNonPagedResponseData(response=ResponseObject.get_response(1, "Tenant deleted"))
    except Exception as e:
        logger.error(f"Delete tenant error: {e}")
        return BaseNonPagedResponseData(response=ResponseObject.get_response(2, str(e)))
