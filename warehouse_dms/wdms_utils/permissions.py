# wdms_utils/permissions.py
#
# Declarative source of truth for all permission groups, permission codes,
# and role-permission mappings in the Warehouse DMS.
#
# The seeder (CreateUserAddSeedPermissions) reads this file and uses it to
# create/sync UserPermissionsGroup, UserPermissions, UserRoles, and
# UserRolesWithPermissions rows in the database.
#
# To add a new permission: add its code string to the relevant group below
# and to the relevant role(s) in role_permission_mappings, then re-run
# `python manage.py seed_permissions`.
#
# ADMIN is intentionally absent from role_permission_mappings — the seeder
# grants every permission in the database to ADMIN automatically.

permissions = [
    {
        "permission_group": "DOCUMENT LIFECYCLE",
        "permissions": [
            "upload_document",
            "confirm_upload",
            "confirm_document",
            "approve_document_manager",
            "approve_document_ceo",
            "reject_document",
            "send_document_back",
            "resubmit_document",
            "reclassify_document",
            "correct_ai_fields",
        ],
    },
    {
        "permission_group": "DOCUMENT ACCESS",
        "permissions": [
            "view_own_documents",
            "view_warehouse_documents",
            "view_tenant_documents",
            "view_jurisdiction_documents",
            "download_own_documents",
            "download_approved_documents",
        ],
    },
    {
        "permission_group": "DOCUMENT SEARCH",
        "permissions": [
            "keyword_search_documents",
            "semantic_search_documents",
        ],
    },
    {
        "permission_group": "REPORTING",
        "permissions": [
            "generate_report",
            "view_warehouse_ranking",
            "trigger_ranking_recompute",
            "export_report",
        ],
    },
    {
        "permission_group": "ADMINISTRATION",
        "permissions": [
            "manage_users",
            "manage_tenants",
            "manage_warehouses",
            "manage_document_types",
            "view_audit_trail",
            "assign_user_roles",
            "manage_regions",
        ],
    },
    {
        "permission_group": "REGULATORY",
        "permissions": [
            "view_regulator_dashboard",
            "access_regulatory_api",
            "view_compliance_documents",
            "view_inspection_reports",
        ],
    },
    {
        "permission_group": "NOTIFICATION MANAGEMENT",
        "permissions": [
            "manage_own_notification_preferences",
            "view_own_notifications",
            "manage_own_preferences",
        ],
    },
]

# ADMIN is omitted here — the seeder links every permission to ADMIN.
role_permission_mappings = {
    "DEPOSITOR": [
        "upload_document",
        "confirm_upload",
        "resubmit_document",
        "view_own_documents",
        "download_own_documents",
        "keyword_search_documents",
        "manage_own_notification_preferences",
        "view_own_notifications",
        "manage_own_preferences",
    ],
    "STAFF": [
        "view_warehouse_documents",
        "confirm_document",
        "send_document_back",
        "reclassify_document",
        "correct_ai_fields",
        "keyword_search_documents",
        "semantic_search_documents",
        "manage_own_notification_preferences",
        "view_own_notifications",
        "manage_own_preferences",
    ],
    "MANAGER": [
        "view_tenant_documents",
        "approve_document_manager",
        "reject_document",
        "send_document_back",
        "reclassify_document",
        "correct_ai_fields",
        "view_warehouse_ranking",
        "keyword_search_documents",
        "semantic_search_documents",
        "generate_report",
        "export_report",
        "manage_own_notification_preferences",
        "view_own_notifications",
        "manage_own_preferences",
    ],
    "CEO": [
        "view_tenant_documents",
        "approve_document_ceo",
        "reject_document",
        "send_document_back",
        "view_warehouse_ranking",
        "keyword_search_documents",
        "semantic_search_documents",
        "generate_report",
        "export_report",
        "manage_own_notification_preferences",
        "view_own_notifications",
        "manage_own_preferences",
    ],
    "REGULATOR": [
        "view_jurisdiction_documents",
        "download_approved_documents",
        "view_regulator_dashboard",
        "access_regulatory_api",
        "view_compliance_documents",
        "view_inspection_reports",
        "view_warehouse_ranking",
        "trigger_ranking_recompute",
        "keyword_search_documents",
        "semantic_search_documents",
        "manage_own_notification_preferences",
        "view_own_notifications",
        "manage_own_preferences",
    ],
}
