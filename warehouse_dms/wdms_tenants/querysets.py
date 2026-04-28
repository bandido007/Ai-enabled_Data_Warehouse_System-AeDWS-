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
    """Stub — Phase 4 will scope by jurisdiction/region.

    For now return all active warehouses so regulators can at least
    see data during development.
    """
    return Warehouse.objects.filter(is_active=True)
