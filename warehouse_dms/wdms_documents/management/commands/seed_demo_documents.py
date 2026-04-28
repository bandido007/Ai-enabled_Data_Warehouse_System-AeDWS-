"""
===============================================================================
  DEV-ONLY SEED COMMAND — do NOT run against a production database.
===============================================================================

Creates a minimal demo environment for manual/UI testing of Phase 2:

  - A "Demo Tenant" (is_active=True) with a single "Demo Warehouse"
  - Five demo users, each with a single role:
        depositor_demo, staff_demo, manager_demo, ceo_demo, regulator_demo
    (the regulator exists for Phase 5 cross-tenant tests; no jurisdiction
    row is written because RegulatorJurisdiction is a Phase 5 model)
  - Twenty Document rows spanning every document type and several statuses
  - A few WorkflowTransition rows on mid-chain documents so the history
    endpoint returns non-empty data

All users are created with password "demo123" — clearly a dev-only credential.

Safety:
  - Refuses to run unless settings.DEBUG is True OR the --confirm-dev-only
    flag is passed explicitly. This keeps it from ever firing accidentally
    against a deployment where DEBUG has been turned off.
  - Idempotent: re-running is safe, existing rows are reused, and the
    document count is topped up to 20 rather than duplicated on each run.

Usage:
    python manage.py seed_demo_documents                   # requires DEBUG=True
    python manage.py seed_demo_documents --confirm-dev-only

===============================================================================
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Dict, List, Optional

from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from wdms_accounts.models import AccountType, UserProfile
from wdms_documents.fsm.types import get_document_type
from wdms_documents.models import (
    Document,
    DocumentStatus,
    WorkflowTransition,
)
from wdms_tenants.models import Region, Tenant, Warehouse
from wdms_uaa.models import UserRoles, UsersWithRoles

logger = logging.getLogger("wdms_logger")

DEMO_PASSWORD = "demo123"
DEMO_TENANT_NAME = "Demo Tenant"
DEMO_WAREHOUSE_NAME = "Demo Warehouse"

ROLE_BY_USERNAME: Dict[str, str] = {
    "depositor_demo": "DEPOSITOR",
    "staff_demo": "STAFF",
    "manager_demo": "MANAGER",
    "ceo_demo": "CEO",
    "regulator_demo": "REGULATOR",
}


# Each entry: (document_type_id, status, title_suffix)
# Spread across all four types and every reachable status per type.
DOCUMENT_PLAN: List[tuple] = [
    ("application_form", DocumentStatus.PENDING_STAFF, "Jane Doe — New deposit request"),
    ("application_form", DocumentStatus.PENDING_STAFF, "Peter Msuya — Coffee bean deposit"),
    ("application_form", DocumentStatus.PENDING_MANAGER, "Grace Mushi — Maize deposit"),
    ("application_form", DocumentStatus.PENDING_CEO, "John Kimaro — Rice shipment"),
    ("application_form", DocumentStatus.APPROVED, "Fatima Ali — Cashew export prep"),
    ("application_form", DocumentStatus.APPROVED, "Samuel Njoroge — Sorghum batch"),
    ("application_form", DocumentStatus.REJECTED, "Lost paperwork — duplicate request"),
    ("application_form", DocumentStatus.CORRECTION_NEEDED, "Missing stamp — needs re-upload"),
    ("application_form", DocumentStatus.CORRECTION_NEEDED, "Wrong warehouse code"),
    ("inspection_form", DocumentStatus.PENDING_MANAGER, "Q1 routine inspection — Bay A"),
    ("inspection_form", DocumentStatus.PENDING_MANAGER, "Spot inspection — Bay B"),
    ("inspection_form", DocumentStatus.PENDING_CEO, "Q1 routine inspection — Bay C"),
    ("inspection_form", DocumentStatus.APPROVED, "Q4 2025 comprehensive inspection"),
    ("inspection_form", DocumentStatus.CORRECTION_NEEDED, "Missing photographs"),
    ("warehouse_receipt", DocumentStatus.PENDING_MANAGER, "Delivery #WR-2026-001"),
    ("warehouse_receipt", DocumentStatus.PENDING_MANAGER, "Delivery #WR-2026-002"),
    ("warehouse_receipt", DocumentStatus.APPROVED, "Delivery #WR-2026-003"),
    ("warehouse_receipt", DocumentStatus.CORRECTION_NEEDED, "Delivery #WR-2026-004 — qty mismatch"),
    ("compliance_certificate", DocumentStatus.APPROVED, "TFRA Certificate 2026 — Q1"),
    ("compliance_certificate", DocumentStatus.APPROVED, "TFRA Certificate 2025 — renewed"),
]

assert len(DOCUMENT_PLAN) == 20, "DOCUMENT_PLAN must declare exactly 20 documents"


# Uploader role is dictated by the document type config.
UPLOADER_FOR_TYPE = {
    "application_form": "depositor_demo",
    "inspection_form": "staff_demo",
    "warehouse_receipt": "staff_demo",
    "compliance_certificate": "regulator_demo",
}


class Command(BaseCommand):
    help = (
        "Seed a demo tenant + warehouse + five users + twenty documents for Phase 2 "
        "manual testing. DEV-ONLY."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm-dev-only",
            action="store_true",
            default=False,
            help=(
                "Bypass the DEBUG guard. Use only when you are certain the target "
                "database is a development or test database."
            ),
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["confirm_dev_only"]:
            raise CommandError(
                "Refusing to run with DEBUG=False. Pass --confirm-dev-only if you are "
                "absolutely sure this is not a production database."
            )

        with transaction.atomic():
            tenant = self._ensure_tenant()
            warehouse = self._ensure_warehouse(tenant)
            users = self._ensure_users(tenant, warehouse)
            created_count, skipped_count = self._ensure_documents(warehouse, users)

        self.stdout.write(
            self.style.SUCCESS(
                f"Demo seed complete. Tenant={tenant.name!r} Warehouse={warehouse.name!r} "
                f"Users={list(users.keys())} Docs created={created_count} "
                f"existing reused={skipped_count}"
            )
        )
        self.stdout.write(
            self.style.WARNING(
                f"Demo user password is {DEMO_PASSWORD!r} — dev-only credential."
            )
        )

    # ── Tenant / Warehouse ────────────────────────────────────────────────────

    def _ensure_tenant(self) -> Tenant:
        tenant, created = Tenant.objects.get_or_create(
            name=DEMO_TENANT_NAME,
            defaults={
                "email": "demo-tenant@example.tz",
                "phone_number": "+255700000000",
                "address": "Demo Tenant HQ, Dar es Salaam",
            },
        )
        if created:
            self.stdout.write(f"Created tenant: {tenant.name}")
        else:
            self.stdout.write(f"Reused tenant: {tenant.name}")
        return tenant

    def _ensure_warehouse(self, tenant: Tenant) -> Warehouse:
        region = Region.objects.filter(is_active=True).first()
        warehouse, created = Warehouse.objects.get_or_create(
            name=DEMO_WAREHOUSE_NAME,
            tenant=tenant,
            defaults={
                "region": region,
                "address": "Plot 42, Industrial Area, Dar es Salaam",
                "phone_number": "+255700000001",
                "email": "demo-warehouse@example.tz",
                "capacity": 10000,
                "capacity_unit": "MT",
                "is_verified": True,
            },
        )
        if created:
            self.stdout.write(f"Created warehouse: {warehouse.name}")
        else:
            self.stdout.write(f"Reused warehouse: {warehouse.name}")
        return warehouse

    # ── Users ────────────────────────────────────────────────────────────────

    def _ensure_users(
        self, tenant: Tenant, warehouse: Warehouse
    ) -> Dict[str, User]:
        users: Dict[str, User] = {}
        for username, role_name in ROLE_BY_USERNAME.items():
            user = self._ensure_user(
                username=username,
                role_name=role_name,
                tenant=tenant,
                warehouse=warehouse,
            )
            users[username] = user
        return users

    def _ensure_user(
        self,
        username: str,
        role_name: str,
        tenant: Tenant,
        warehouse: Warehouse,
    ) -> User:
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": f"{username}@example.tz",
                "first_name": username.split("_")[0].capitalize(),
                "last_name": "Demo",
            },
        )
        if created:
            user.set_password(DEMO_PASSWORD)
            user.save()
            self.stdout.write(f"Created user: {username} ({role_name})")

        # Regulators do not belong to operational warehouses. Phase 5 adds
        # RegulatorJurisdiction; for now, link to the demo tenant so they
        # at least exist in the right tenant graph, leave warehouse=None.
        profile_warehouse: Optional[Warehouse] = (
            None if role_name in ("REGULATOR", "ADMIN", "MANAGER", "CEO") else warehouse
        )
        # Managers and CEOs are tenant-wide, not warehouse-bound.
        profile_tenant: Optional[Tenant] = tenant

        account_type_map = {
            "DEPOSITOR": AccountType.DEPOSITOR,
            "STAFF": AccountType.STAFF,
            "MANAGER": AccountType.MANAGER,
            "CEO": AccountType.CEO,
            "REGULATOR": AccountType.REGULATOR,
        }

        UserProfile.objects.update_or_create(
            profile_user=user,
            defaults={
                "account_type": account_type_map[role_name],
                "tenant": profile_tenant,
                "warehouse": profile_warehouse,
                "has_been_verified": True,
            },
        )

        role = UserRoles.objects.filter(name=role_name, is_active=True).first()
        if role is None:
            raise CommandError(
                f"Role '{role_name}' does not exist. Run `seed_permissions` first."
            )

        # Replace any existing role assignment with the demo role so reruns
        # stay idempotent even if someone hand-edited the seed user in the DB.
        UsersWithRoles.objects.filter(user_with_role_user=user).delete()
        UsersWithRoles.objects.create(
            user_with_role_user=user, user_with_role_role=role
        )

        return user

    # ── Documents ────────────────────────────────────────────────────────────

    def _ensure_documents(
        self, warehouse: Warehouse, users: Dict[str, User]
    ) -> tuple:
        created_count = 0
        skipped_count = 0

        for index, (type_id, status, title_suffix) in enumerate(DOCUMENT_PLAN):
            type_def = get_document_type(type_id)
            if type_def is None:
                raise CommandError(f"Unknown document type in plan: {type_id}")

            uploader_username = UPLOADER_FOR_TYPE[type_id]
            uploader = users[uploader_username]

            title = f"[{type_id}] {title_suffix}"

            # Idempotence key: (warehouse, document_type_id, title).
            existing = Document.objects.filter(
                warehouse=warehouse,
                document_type_id=type_id,
                title=title,
            ).first()
            if existing is not None:
                skipped_count += 1
                continue

            document = Document(
                warehouse=warehouse,
                uploader=uploader,
                document_type_id=type_id,
                title=title,
                status=status,
                created_by=uploader,
            )
            placeholder = _placeholder_file(type_id, index)
            document.file.save(placeholder.name, placeholder, save=False)

            if status == DocumentStatus.CORRECTION_NEEDED:
                document.current_correction_note = (
                    "DEMO: the previous submission was incomplete. "
                    "Please attach the missing pages and resubmit."
                )

            document.save()

            # Synthesise a small audit trail for mid-chain documents so the
            # detail view has something interesting to render.
            _synthesise_transitions(document, users)
            created_count += 1

        return created_count, skipped_count


def _placeholder_file(type_id: str, index: int) -> ContentFile:
    """Return a tiny text-based placeholder posing as a .pdf."""
    body = (
        f"DEMO placeholder content for {type_id} #{index + 1}\n"
        f"Generated at {timezone.now().isoformat()}\n"
        f"This file is NOT a real PDF. Phase 4 introduces format validation.\n"
    )
    return ContentFile(body.encode("utf-8"), name=f"demo_{type_id}_{index + 1}.pdf")


def _synthesise_transitions(document: Document, users: Dict[str, User]) -> None:
    """
    Insert a plausible WorkflowTransition trail consistent with `document.status`.
    Avoids using the FSM engine so we can back-date states without validation.
    """
    status = document.status
    now = timezone.now()

    def add(from_status: str, to_status: str, actor: User, action: str, reason: str = ""):
        WorkflowTransition.objects.create(
            document=document,
            from_status=from_status,
            to_status=to_status,
            actor=actor,
            action=action,
            reason=reason,
            created_by=actor,
        )

    depositor = users["depositor_demo"]
    staff = users["staff_demo"]
    manager = users["manager_demo"]
    ceo = users["ceo_demo"]

    # application_form: follow the PENDING_STAFF → … chain as appropriate.
    if document.document_type_id == "application_form":
        if status == DocumentStatus.PENDING_MANAGER:
            add("PENDING_STAFF", "PENDING_MANAGER", staff, "confirm")
        elif status == DocumentStatus.PENDING_CEO:
            add("PENDING_STAFF", "PENDING_MANAGER", staff, "confirm")
            add("PENDING_MANAGER", "PENDING_CEO", manager, "approve")
        elif status == DocumentStatus.APPROVED:
            add("PENDING_STAFF", "PENDING_MANAGER", staff, "confirm")
            add("PENDING_MANAGER", "PENDING_CEO", manager, "approve")
            add("PENDING_CEO", "APPROVED", ceo, "final_approve")
        elif status == DocumentStatus.REJECTED:
            add("PENDING_STAFF", "PENDING_MANAGER", staff, "confirm")
            add(
                "PENDING_MANAGER",
                "REJECTED",
                manager,
                "reject",
                reason="Duplicate of existing application.",
            )
        elif status == DocumentStatus.CORRECTION_NEEDED:
            add(
                "PENDING_STAFF",
                "CORRECTION_NEEDED",
                staff,
                "send_back",
                reason="Missing signature on page 2.",
            )

    elif document.document_type_id == "inspection_form":
        if status == DocumentStatus.PENDING_CEO:
            add("PENDING_MANAGER", "PENDING_CEO", manager, "approve")
        elif status == DocumentStatus.APPROVED:
            add("PENDING_MANAGER", "PENDING_CEO", manager, "approve")
            add("PENDING_CEO", "APPROVED", ceo, "final_approve")
        elif status == DocumentStatus.CORRECTION_NEEDED:
            add(
                "PENDING_MANAGER",
                "CORRECTION_NEEDED",
                manager,
                "send_back",
                reason="Photographs missing.",
            )

    elif document.document_type_id == "warehouse_receipt":
        if status == DocumentStatus.APPROVED:
            add("PENDING_MANAGER", "APPROVED", manager, "approve")
        elif status == DocumentStatus.CORRECTION_NEEDED:
            add(
                "PENDING_MANAGER",
                "CORRECTION_NEEDED",
                manager,
                "send_back",
                reason="Quantity mismatch with delivery note.",
            )

    # compliance_certificate is born APPROVED with no transitions — nothing to add.
