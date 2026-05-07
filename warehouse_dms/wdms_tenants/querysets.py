from typing import Optional, Type

from django.db.models import Model, QuerySet

from wdms_tenants.models import Region, Tenant, Warehouse


def get_user_tenant(user) -> Optional[Tenant]:
    """Return the Tenant linked to the user's profile, or None."""
    profile = getattr(user, "user_profile", None)
    if profile:
        return profile.tenant
    return None


def get_tenant_queryset(user):
    """Return a Warehouse queryset scoped to the user's tenant."""
    tenant = get_user_tenant(user)
    if tenant:
        return Warehouse.objects.filter(tenant=tenant, is_active=True)
    return Warehouse.objects.none()


def get_tenant_scoped_queryset(
    model: Type[Model],
    user,
    tenant_path: str = "warehouse__tenant",
) -> QuerySet:
    """
    Return a queryset of `model` filtered to the user's tenant.

    `tenant_path` is the ORM lookup from `model` to `Tenant`. The default
    works for models that reach Tenant via a `warehouse` FK (Document,
    UploadAttempt, future WorkflowTransition-adjacent models). Override
    for models that hang off Tenant differently.

    Superusers bypass tenant scoping and see every row. Users without
    a profile or tenant get an empty queryset rather than all rows.
    """
    qs = model.objects.all()

    if getattr(user, "is_superuser", False):
        return qs

    tenant = get_user_tenant(user)
    if tenant is None:
        return qs.none()

    return qs.filter(**{tenant_path: tenant})


def get_regulator_queryset(user):
    """
    Return a queryset of Warehouses visible to the given regulator user.

    - Superusers see everything.
    - Regulators with a NATIONAL jurisdiction see every active warehouse.
    - Regulators with a REGIONAL jurisdiction see only warehouses in their
      assigned region(s).
    - Regulators with no jurisdiction record at all fall back to seeing all
      active warehouses (graceful degradation during seeding/setup).

    The import of RegulatorJurisdiction is deferred to avoid a circular
    dependency between wdms_tenants and wdms_regulatory.
    """
    if getattr(user, "is_superuser", False):
        return Warehouse.objects.filter(is_active=True)

    # Deferred import avoids circular dependency
    from wdms_regulatory.models import JurisdictionScope, RegulatorJurisdiction  # noqa: PLC0415

    jurisdictions = RegulatorJurisdiction.objects.filter(
        regulator=user, is_active=True
    ).select_related("region")

    if not jurisdictions.exists():
        # No jurisdiction assigned yet — show everything (dev / setup mode)
        return Warehouse.objects.filter(is_active=True)

    # If any jurisdiction is NATIONAL, the regulator sees everything
    if jurisdictions.filter(scope=JurisdictionScope.NATIONAL).exists():
        return Warehouse.objects.filter(is_active=True)

    # Otherwise collect region PKs and scope to those regions
    region_pks = jurisdictions.filter(
        scope=JurisdictionScope.REGIONAL
    ).values_list("region_id", flat=True)

    return Warehouse.objects.filter(region_id__in=region_pks, is_active=True)
