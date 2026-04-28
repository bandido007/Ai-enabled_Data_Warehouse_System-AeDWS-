"""
Document Type Configuration Loader

Loads wdms_documents/config/document_types.json once at module import,
validates the schema, and exposes accessors used by the FSM engine, the
upload endpoint, the metadata endpoint, and (later) the Celery AI pipeline.

The loader fails loudly: a malformed JSON file, a missing required key,
or a duplicate type id raises ImproperlyConfigured at import time so
the Django server refuses to start rather than silently breaking every
document operation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from django.core.exceptions import ImproperlyConfigured


CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "document_types.json"

REQUIRED_TYPE_KEYS = (
    "id",
    "label",
    "category",
    "initial_state",
    "allowed_transitions",
    "required_fields",
    "file_formats",
    "validation_rules",
    "classification_hints",
    "allowed_uploader_roles",
)

REQUIRED_TRANSITION_KEYS = ("from_state", "to_state", "required_role", "action")

VALID_CATEGORIES = {"FORM", "RECEIPT", "CERTIFICATE", "REPORT"}


@dataclass(frozen=True)
class DocumentTypeDefinition:
    """
    One entry from document_types.json.

    `allowed_transitions` is kept as a list of plain dicts rather than a typed
    class because the FSM engine indexes them by key (`transition["from_state"]`
    etc.) and the foundation starter code depends on that exact shape.
    """

    id: str
    label: str
    category: str
    initial_state: str
    allowed_uploader_roles: List[str]
    allowed_transitions: List[Dict[str, Any]]
    required_fields: List[str]
    optional_fields: List[str] = field(default_factory=list)
    file_formats: List[str] = field(default_factory=list)
    validation_rules: Dict[str, Any] = field(default_factory=dict)
    classification_hints: List[str] = field(default_factory=list)


def _validate_type_entry(entry: Dict[str, Any], index: int) -> None:
    if not isinstance(entry, dict):
        raise ImproperlyConfigured(
            f"document_types.json: entry at index {index} is not an object"
        )

    for key in REQUIRED_TYPE_KEYS:
        if key not in entry:
            raise ImproperlyConfigured(
                f"document_types.json: entry at index {index} is missing required key '{key}'"
            )

    type_id = entry["id"]
    if not isinstance(type_id, str) or not type_id:
        raise ImproperlyConfigured(
            f"document_types.json: entry at index {index} has invalid 'id'"
        )

    if entry["category"] not in VALID_CATEGORIES:
        raise ImproperlyConfigured(
            f"document_types.json: type '{type_id}' has invalid category "
            f"'{entry['category']}'. Allowed: {sorted(VALID_CATEGORIES)}"
        )

    if not isinstance(entry["allowed_uploader_roles"], list) or not entry["allowed_uploader_roles"]:
        raise ImproperlyConfigured(
            f"document_types.json: type '{type_id}' must declare at least one "
            f"allowed_uploader_role"
        )

    transitions = entry["allowed_transitions"]
    if not isinstance(transitions, list):
        raise ImproperlyConfigured(
            f"document_types.json: type '{type_id}' allowed_transitions must be a list"
        )

    for t_index, transition in enumerate(transitions):
        if not isinstance(transition, dict):
            raise ImproperlyConfigured(
                f"document_types.json: type '{type_id}' transition at index {t_index} "
                f"is not an object"
            )
        for key in REQUIRED_TRANSITION_KEYS:
            if key not in transition:
                raise ImproperlyConfigured(
                    f"document_types.json: type '{type_id}' transition at index {t_index} "
                    f"is missing required key '{key}'"
                )

    if not isinstance(entry["validation_rules"], dict):
        raise ImproperlyConfigured(
            f"document_types.json: type '{type_id}' validation_rules must be an object"
        )


def _load_from_disk() -> Dict[str, DocumentTypeDefinition]:
    if not CONFIG_PATH.exists():
        raise ImproperlyConfigured(
            f"document_types.json not found at {CONFIG_PATH}"
        )

    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ImproperlyConfigured(
            f"document_types.json is not valid JSON: {exc}"
        ) from exc

    if not isinstance(raw, dict) or "document_types" not in raw:
        raise ImproperlyConfigured(
            "document_types.json must be an object with a 'document_types' list"
        )

    entries = raw["document_types"]
    if not isinstance(entries, list) or not entries:
        raise ImproperlyConfigured(
            "document_types.json must contain a non-empty 'document_types' list"
        )

    registry: Dict[str, DocumentTypeDefinition] = {}
    for index, entry in enumerate(entries):
        _validate_type_entry(entry, index)
        type_id = entry["id"]
        if type_id in registry:
            raise ImproperlyConfigured(
                f"document_types.json: duplicate type id '{type_id}'"
            )
        registry[type_id] = DocumentTypeDefinition(
            id=type_id,
            label=entry["label"],
            category=entry["category"],
            initial_state=entry["initial_state"],
            allowed_uploader_roles=list(entry["allowed_uploader_roles"]),
            allowed_transitions=list(entry["allowed_transitions"]),
            required_fields=list(entry["required_fields"]),
            optional_fields=list(entry.get("optional_fields", [])),
            file_formats=list(entry["file_formats"]),
            validation_rules=dict(entry["validation_rules"]),
            classification_hints=list(entry["classification_hints"]),
        )

    return registry


_REGISTRY: Dict[str, DocumentTypeDefinition] = _load_from_disk()


def get_document_type(type_id: str) -> Optional[DocumentTypeDefinition]:
    """Return the definition for a type id, or None if not found."""
    return _REGISTRY.get(type_id)


def get_all_document_types() -> List[DocumentTypeDefinition]:
    """Return every loaded document type, stable in config order."""
    return list(_REGISTRY.values())


def get_allowed_transitions(
    type_id: str, from_state: str, user_role: str
) -> List[Dict[str, Any]]:
    """
    Return transitions allowed for a given (type, state, role) triple.

    Mirrors the filter logic used by FSMEngine.get_allowed_transitions so
    that non-engine callers (e.g. a metadata endpoint) can ask the same
    question without instantiating the engine.
    """
    type_def = get_document_type(type_id)
    if type_def is None:
        return []
    return [
        dict(t)
        for t in type_def.allowed_transitions
        if t["from_state"] == from_state and t["required_role"] == user_role
    ]


def get_required_fields(type_id: str) -> List[str]:
    """Return the list of required fields for a document type."""
    type_def = get_document_type(type_id)
    if type_def is None:
        return []
    return list(type_def.required_fields)
