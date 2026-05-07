from typing import List, Optional

from pydantic import model_validator

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

    @model_validator(mode="before")
    @classmethod
    def extract_related_fields(cls, data):
        if hasattr(data, "region"):
            return {
                "id": data.pk,
                "unique_id": data.unique_id,
                "created_date": data.created_date,
                "updated_date": data.updated_date,
                "is_active": data.is_active,
                "created_by": data.created_by,
                "name": data.name,
                "registration_number": data.registration_number,
                "phone_number": data.phone_number,
                "email": data.email,
                "address": data.address,
                "region_id": data.region_id,
                "region_name": data.region.name if data.region else None,
                "logo_url": data.logo_url,
            }
        return data


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

    @model_validator(mode="before")
    @classmethod
    def extract_related_fields(cls, data):
        if hasattr(data, "tenant"):
            return {
                "id": data.pk,
                "unique_id": data.unique_id,
                "created_date": data.created_date,
                "updated_date": data.updated_date,
                "is_active": data.is_active,
                "created_by": data.created_by,
                "name": data.name,
                "tenant_id": data.tenant_id,
                "tenant_name": data.tenant.name if data.tenant else None,
                "region_id": data.region_id,
                "region_name": data.region.name if data.region else None,
                "address": data.address,
                "phone_number": data.phone_number,
                "email": data.email,
                "capacity": data.capacity,
                "capacity_unit": data.capacity_unit,
                "registration_number": data.registration_number,
                "is_verified": data.is_verified,
            }
        return data


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
