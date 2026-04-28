from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.CreateModel(
            name="Region",
            fields=[
                ("primary_key", models.AutoField(primary_key=True, serialize=False)),
                ("unique_id", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("created_date", models.DateField(auto_now_add=True)),
                ("updated_date", models.DateField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                ("name", models.CharField(max_length=255)),
                ("code", models.CharField(blank=True, max_length=10, unique=True)),
                ("description", models.TextField(blank=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="auth.user",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "REGIONS",
                "db_table": "regions",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="Tenant",
            fields=[
                ("primary_key", models.AutoField(primary_key=True, serialize=False)),
                ("unique_id", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("created_date", models.DateField(auto_now_add=True)),
                ("updated_date", models.DateField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                ("name", models.CharField(max_length=255)),
                ("registration_number", models.CharField(blank=True, max_length=100)),
                ("phone_number", models.CharField(blank=True, max_length=50)),
                ("email", models.EmailField(blank=True)),
                ("address", models.TextField(blank=True)),
                ("logo_url", models.URLField(blank=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="auth.user",
                    ),
                ),
                (
                    "region",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="tenants",
                        to="wdms_tenants.region",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "TENANTS",
                "db_table": "tenants",
                "ordering": ["-primary_key"],
            },
        ),
        migrations.CreateModel(
            name="Warehouse",
            fields=[
                ("primary_key", models.AutoField(primary_key=True, serialize=False)),
                ("unique_id", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("created_date", models.DateField(auto_now_add=True)),
                ("updated_date", models.DateField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                ("name", models.CharField(max_length=255)),
                ("address", models.TextField(blank=True)),
                ("phone_number", models.CharField(blank=True, max_length=50)),
                ("email", models.EmailField(blank=True)),
                ("capacity", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("capacity_unit", models.CharField(default="MT", max_length=20)),
                ("registration_number", models.CharField(blank=True, max_length=100)),
                ("is_verified", models.BooleanField(default=False)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="auth.user",
                    ),
                ),
                (
                    "region",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="warehouses",
                        to="wdms_tenants.region",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="warehouses",
                        to="wdms_tenants.tenant",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "WAREHOUSES",
                "db_table": "warehouses",
                "ordering": ["-primary_key"],
            },
        ),
    ]
