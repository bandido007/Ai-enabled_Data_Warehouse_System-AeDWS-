import enum
from datetime import date
from typing import List
from uuid import UUID

from ninja import Schema


def to_camel(string: str) -> str:
    return "".join(
        word.capitalize() if index > 0 else word
        for (index, word) in enumerate(string.split("_"))
    )


class TimeRangeEnum(str, enum.Enum):
    TODAY = "TODAY"
    THIS_WEEK = "THIS_WEEK"
    THIS_MONTH = "THIS_MONTH"
    THIS_YEAR = "THIS_YEAR"


class UserResponse(Schema):
    username: str = None
    first_name: str = None
    last_name: str = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class ResponseSerializer(Schema):
    id: int
    status: bool
    message: str
    code: int


class PaginationResponseSerializer(Schema):
    number: int | None = None
    has_next_page: bool | None = None
    has_previous_page: bool | None = None
    current_page_number: int | None = None
    next_page_number: int | None = None
    previous_page_number: int | None = None
    number_of_pages: int | None = None
    total_elements: int | None = None
    pages_number_array: List[int] | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BasePagedFilteringSerializer(Schema):
    page_number: int | None = None
    items_per_page: int | None = None
    search_term: str | None = None
    unique_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    time_range: TimeRangeEnum | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BaseNonPagedFilteringSerializer(Schema):
    search_term: str | None = None
    unique_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    time_range: TimeRangeEnum | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BaseSerializer(Schema):
    id: int
    unique_id: UUID
    created_date: date
    updated_date: date
    is_active: bool
    created_by: UserResponse | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BaseInputSerializer(Schema):
    unique_id: str | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BasePagedResponseList(Schema):
    response: ResponseSerializer
    page: PaginationResponseSerializer | None = None

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BaseNonPagedResponseData(Schema):
    response: ResponseSerializer

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True


class BaseSchema(Schema):
    """Extend this to get the camelCase feature on any bespoke schema."""

    class Config(Schema.Config):
        alias_generator = to_camel
        populate_by_name = True
