"""
Notification serializers.

Five-serializer pattern per entity (table, input, filtering, paged response, 
non-paged response) following the secured_SRS convention.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from ninja import Schema
from pydantic import model_validator

from wdms_utils.SharedSerializer import (
    BaseNonPagedResponseData,
    BasePagedFilteringSerializer,
    BasePagedResponseList,
    BaseSerializer,
    ResponseSerializer,
    to_camel,
)


# ─────────────────────────────────────────────────────────────────────────────
# NotificationEvent serializers
# ─────────────────────────────────────────────────────────────────────────────


class NotificationEventTableSerializer(BaseSerializer):
    event_type: str
    subject: str
    body: str
    related_document_id: Optional[int]
    channels_sent: List[str]
    read_on_dashboard: bool
    read_at: Optional[datetime]

    class Config(BaseSerializer.Config):
        alias_generator = to_camel
        populate_by_name = True

    @model_validator(mode="before")
    @classmethod
    def from_orm(cls, obj: Any) -> Dict[str, Any]:
        if isinstance(obj, dict):
            return obj
        created_by = getattr(obj, "created_by", None)
        try:
            pk = obj.pk
        except AttributeError:
            pk = obj.id
        return {
            "id": pk,
            "unique_id": str(obj.unique_id),
            "created_date": obj.created_date,
            "updated_date": obj.updated_date,
            "is_active": obj.is_active,
            "created_by": (
                {"username": created_by.username} if created_by else None
            ),
            "event_type": obj.event_type,
            "subject": obj.subject,
            "body": obj.body,
            "related_document_id": obj.related_document_id,
            "channels_sent": obj.channels_sent or [],
            "read_on_dashboard": obj.read_on_dashboard,
            "read_at": obj.read_at,
        }


class NotificationFilteringSerializer(BasePagedFilteringSerializer):
    unread_only: Optional[bool] = None

    class Config(BasePagedFilteringSerializer.Config):
        alias_generator = to_camel
        populate_by_name = True


class NotificationPagedResponseSerializer(BasePagedResponseList):
    data: Optional[List[NotificationEventTableSerializer]] = None

    class Config(BasePagedResponseList.Config):
        alias_generator = to_camel
        populate_by_name = True


class NotificationNonPagedResponseSerializer(BaseNonPagedResponseData):
    data: Optional[NotificationEventTableSerializer] = None

    class Config(BaseNonPagedResponseData.Config):
        alias_generator = to_camel
        populate_by_name = True


# ─────────────────────────────────────────────────────────────────────────────
# NotificationPreference serializers
# ─────────────────────────────────────────────────────────────────────────────


class PreferenceItemSerializer(Schema):
    event_type: str
    channel: str
    enabled: bool

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class PreferencesResponseSerializer(Schema):
    response: ResponseSerializer
    data: Optional[List[PreferenceItemSerializer]] = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class UpdatePreferencesInputSerializer(Schema):
    preferences: List[PreferenceItemSerializer]

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


# ─────────────────────────────────────────────────────────────────────────────
# Upload attempt serializers (returned by the new SSE upload endpoint)
# ─────────────────────────────────────────────────────────────────────────────


class UploadAttemptStartSerializer(Schema):
    attempt_id: int
    stream_url: str

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class UploadAttemptStartResponseSerializer(BaseNonPagedResponseData):
    data: Optional[UploadAttemptStartSerializer] = None

    class Config(BaseNonPagedResponseData.Config):
        alias_generator = to_camel
        populate_by_name = True
