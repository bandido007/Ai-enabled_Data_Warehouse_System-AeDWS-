"""Seed the 10 primary administrative regions of Tanzania."""

from django.db import migrations


TANZANIA_REGIONS = [
    {"name": "Dar es Salaam", "code": "DSM"},
    {"name": "Dodoma",        "code": "DDM"},
    {"name": "Arusha",        "code": "ARU"},
    {"name": "Mwanza",        "code": "MWZ"},
    {"name": "Mbeya",         "code": "MBY"},
    {"name": "Tanga",         "code": "TNG"},
    {"name": "Morogoro",      "code": "MRG"},
    {"name": "Kilimanjaro",   "code": "KJR"},
    {"name": "Iringa",        "code": "IRG"},
    {"name": "Kigoma",        "code": "KGM"},
]


def seed_regions(apps, schema_editor):
    Region = apps.get_model("wdms_tenants", "Region")
    for region_data in TANZANIA_REGIONS:
        Region.objects.get_or_create(
            code=region_data["code"],
            defaults={"name": region_data["name"]},
        )


def reverse_seed_regions(apps, schema_editor):
    Region = apps.get_model("wdms_tenants", "Region")
    codes = [r["code"] for r in TANZANIA_REGIONS]
    Region.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("wdms_tenants", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_regions, reverse_seed_regions),
    ]
