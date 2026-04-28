from django.contrib import admin

from .models import Region, Tenant, Warehouse

admin.site.register(Region)
admin.site.register(Tenant)
admin.site.register(Warehouse)
