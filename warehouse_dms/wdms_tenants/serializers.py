from typing import List, Optional

from wdms_utils.SharedSerializer import (
    BaseInputSerializer,
    BaseNonPagedResponseData,
    BasePagedFilteringSerializer,
    BasePagedResponseList,
    BaseSchema,
    BaseSerializer,
)


# ── Region ────────────────────────────────────────────────────────────────────

class RegionTableSerializer(BaseSerializer):
    name: str = ""
    code: str = ""
    description: str = ""


class RegionInputSerializer(BaseInputSerializer):
    name: str
    code: str = ""
    description: str = ""


class RegionFilteringSerializer(BasePagedFilteringSerializer):
    pass


class RegionPagedResponseSerializer(BasePagedResponseList):
    data: Optional[List[RegionTableSerializer]] = None


class RegionNonPagedResponseSerializer(BaseNonPagedResponseData):
    data: Optional[RegionTableSerializer] = None


# ── Tenant ────────────────────────────────────────────────────────────────────

class TenantTableSerializer(BaseSerializer):
    name: str = ""
    registration_number: str = ""
    phone_number: str = ""
    email: str = ""
    address: str = ""
    region_id: Optional[int] = None
    region_name: Optional[str] = None
    logo_url: str = ""


class TenantInputSerializer(BaseInputSerializer):
    name: str
    registration_number: str = ""
    phone_number: str = ""
    email: str = ""
    address: str = ""
    region_unique_id: Optional[str] = None
    logo_url: str = ""


class TenantFilteringSerializer(BasePagedFilteringSerializer):
    region_id: Optional[int] = None


class TenantPagedResponseSerializer(BasePagedResponseList):
    data: Optional[List[TenantTableSerializer]] = None


class TenantNonPagedResponseSerializer(BaseNonPagedResponseData):
    data: Optional[TenantTableSerializer] = None


# ── Warehouse ─────────────────────────────────────────────────────────────────

class WarehouseTableSerializer(BaseSerializer):
    name: str = ""
    tenant_id: Optional[int] = None
    tenant_name: Optional[str] = None
    region_id: Optional[int] = None
    region_name: Optional[str] = None
    address: str = ""
    phone_number: str = ""
    email: str = ""
    capacity: float = 0
    capacity_unit: str = "MT"
    registration_number: str = ""
    is_verified: bool = False


class WarehouseInputSerializer(BaseInputSerializer):
    name: str
    tenant_unique_id: str
    region_unique_id: Optional[str] = None
    address: str = ""
    phone_number: str = ""
    email: str = ""
    capacity: float = 0
    capacity_unit: str = "MT"
    registration_number: str = ""


class WarehouseFilteringSerializer(BasePagedFilteringSerializer):
    tenant_id: Optional[int] = None
    region_id: Optional[int] = None
    is_verified: Optional[bool] = None


class WarehousePagedResponseSerializer(BasePagedResponseList):
    data: Optional[List[WarehouseTableSerializer]] = None


class WarehouseNonPagedResponseSerializer(BaseNonPagedResponseData):
    data: Optional[WarehouseTableSerializer] = None
