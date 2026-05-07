"""
Regulatory models.

RegulatorJurisdiction ties a REGULATOR user to the geographic scope they are
allowed to inspect.  A NATIONAL regulator sees all warehouses.  A REGIONAL
regulator sees only warehouses that sit in their assigned region.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import models

from wdms_tenants.models import Region
from wdms_utils.BaseModel import BaseModel

User = get_user_model()


class JurisdictionScope(models.TextChoices):
    NATIONAL = "NATIONAL", "National"
    REGIONAL = "REGIONAL", "Regional"


class RegulatorJurisdiction(BaseModel):
    """
    Ties a REGULATOR user to their geographic scope.

    - scope=NATIONAL:  region must be null; sees every warehouse.
    - scope=REGIONAL:  region must be set; sees only that region's warehouses.
    """

    regulator = models.ForeignKey(
        User,
        related_name="jurisdictions",
        on_delete=models.CASCADE,
    )
    scope = models.CharField(
        max_length=16,
        choices=JurisdictionScope.choices,
        default=JurisdictionScope.NATIONAL,
    )
    region = models.ForeignKey(
        Region,
        null=True,
        blank=True,
        related_name="regulator_jurisdictions",
        on_delete=models.SET_NULL,
        help_text="Required when scope is REGIONAL; null for NATIONAL regulators.",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "regulator_jurisdictions"
        verbose_name = "Regulator Jurisdiction"
        verbose_name_plural = "REGULATOR JURISDICTIONS"
        unique_together = [("regulator", "region")]

    def __str__(self) -> str:
        region_label = self.region.name if self.region else "All Regions"
        return f"{self.regulator} — {self.scope} ({region_label})"
