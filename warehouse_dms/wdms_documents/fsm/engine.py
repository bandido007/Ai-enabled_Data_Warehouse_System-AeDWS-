"""
Configurable Finite State Machine Engine

Reads document type definitions from wdms_documents/config/document_types.json
and exposes allowed transitions plus atomic transition execution with audit logging.

This engine is the heart of the workflow layer. Every document state change
passes through `execute_transition`, which guarantees:
- The transition is allowed by the document type's configuration
- The user has the required role
- Any `reason_required` constraint is satisfied
- The change is atomic with its audit trail
"""

import logging
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from django.db import transaction
from django.contrib.auth.models import User
from django.dispatch import Signal

from wdms_documents.models import Document, WorkflowTransition
from wdms_documents.fsm.types import get_document_type, DocumentTypeDefinition

logger = logging.getLogger("wdms_logger")

# Signal fired after every successful transition. Notification dispatcher subscribes.
document_transitioned = Signal()


@dataclass
class AllowedTransition:
    """Represents a transition available to a user for a document."""
    from_state: str
    to_state: str
    action: str
    required_role: str
    reason_required: bool


@dataclass
class TransitionResult:
    """Result of attempting a transition."""
    success: bool
    message: str
    new_status: Optional[str] = None
    transition_id: Optional[int] = None


class FSMEngine:
    """
    The finite state machine engine.

    Responsibilities:
    - Compute allowed transitions for a (document, user) pair
    - Execute transitions atomically with audit logging
    - Fire signals for downstream listeners (notifications, analytics)

    Non-responsibilities:
    - Does NOT dispatch notifications (handled by signal receivers)
    - Does NOT run AI pipeline (handled by Celery tasks triggered by signals)
    - Does NOT enforce tenant isolation (handled at view layer)
    """

    def get_allowed_transitions(
        self,
        document: Document,
        user: User,
    ) -> List[AllowedTransition]:
        """
        Return the list of transitions this user can perform on this document
        given its current status. The UI uses this to render action buttons.
        """
        type_def = get_document_type(document.document_type_id)
        if not type_def:
            return []

        user_role = self._get_user_role(user)
        if not user_role:
            return []

        allowed = []
        for transition in type_def.allowed_transitions:
            if transition["from_state"] != document.status:
                continue
            if transition["required_role"] != user_role:
                continue
            allowed.append(
                AllowedTransition(
                    from_state=transition["from_state"],
                    to_state=transition["to_state"],
                    action=transition["action"],
                    required_role=transition["required_role"],
                    reason_required=transition.get("reason_required", False),
                )
            )
        return allowed

    def can_transition(
        self,
        document: Document,
        user: User,
        action: str,
    ) -> Optional[AllowedTransition]:
        """
        Check whether a specific action is allowed for this user on this document.
        Returns the transition spec if allowed, None otherwise.
        """
        for transition in self.get_allowed_transitions(document, user):
            if transition.action == action:
                return transition
        return None

    @transaction.atomic
    def execute_transition(
        self,
        document: Document,
        user: User,
        action: str,
        reason: str = "",
        edited_fields: Optional[Dict[str, Any]] = None,
        ai_corrections: Optional[Dict[str, Any]] = None,
    ) -> TransitionResult:
        """
        Execute a state transition atomically.

        Steps:
        1. Validate the transition is allowed for this user and action
        2. Validate reason is provided if reason_required
        3. Update the document's status
        4. Create a WorkflowTransition audit record
        5. Fire the document_transitioned signal (notifications listen to this)

        All steps happen in a single database transaction. If any step fails,
        the entire transition is rolled back.
        """
        # Step 1: Validate
        transition_spec = self.can_transition(document, user, action)
        if not transition_spec:
            return TransitionResult(
                success=False,
                message=f"Action '{action}' not allowed for user on document in status '{document.status}'",
            )

        # Step 2: Check reason
        if transition_spec.reason_required and not reason.strip():
            return TransitionResult(
                success=False,
                message=f"Action '{action}' requires a reason",
            )

        # Step 3: Update document
        from_status = document.status
        document.status = transition_spec.to_state

        # If going to CORRECTION_NEEDED, store the reason in the dedicated field
        if transition_spec.to_state == "CORRECTION_NEEDED":
            document.current_correction_note = reason
        else:
            document.current_correction_note = ""

        save_fields = ["status", "current_correction_note", "updated_date"]

        # On resubmit with edited_fields: merge corrections into extracted fields
        # and clear AI summary so the AI pipeline re-analyses the corrected data.
        if action == "resubmit" and edited_fields:
            existing = document.ai_extracted_fields or {}
            existing.update(edited_fields)
            document.ai_extracted_fields = existing
            document.ai_summary = ""
            document.ai_review_notes = ""
            document.ai_confidence_score = None
            save_fields += ["ai_extracted_fields", "ai_summary", "ai_review_notes", "ai_confidence_score"]

        document.save(update_fields=save_fields)

        # Step 4: Audit log
        wt = WorkflowTransition.objects.create(
            document=document,
            from_status=from_status,
            to_status=transition_spec.to_state,
            actor=user,
            action=action,
            reason=reason,
            edited_fields=edited_fields or {},
            ai_corrections=ai_corrections or {},
            created_by=user,
        )

        # Step 5: Signal
        document_transitioned.send(
            sender=Document,
            document=document,
            from_status=from_status,
            to_status=transition_spec.to_state,
            action=action,
            actor=user,
            reason=reason,
        )

        logger.info(
            f"FSM transition: doc={document.pk} {from_status}->{transition_spec.to_state} "
            f"by {user.username} action={action}"
        )

        return TransitionResult(
            success=True,
            message="Transition executed",
            new_status=transition_spec.to_state,
            transition_id=wt.pk,
        )

    def _get_user_role(self, user: User) -> Optional[str]:
        """Get the user's primary role name (e.g., 'STAFF', 'MANAGER')."""
        from wdms_uaa.models import UsersWithRoles
        ur = UsersWithRoles.objects.filter(
            user_with_role_user=user, is_active=True
        ).select_related("user_with_role_role").first()
        return ur.user_with_role_role.name if ur else None
