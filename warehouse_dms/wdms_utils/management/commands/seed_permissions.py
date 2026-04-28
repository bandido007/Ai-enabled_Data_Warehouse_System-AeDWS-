from django.core.management.base import BaseCommand

from wdms_utils.CreateUserAddSeedPermissions import CreateRolesAddPermissions


class Command(BaseCommand):
    help = "Create all roles, permissions, and the admin superuser account."

    def handle(self, *args, **options):
        self.stdout.write("Running permission seeder...")
        CreateRolesAddPermissions()
        self.stdout.write(self.style.SUCCESS("Seed complete."))
