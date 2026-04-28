import json
import logging
from datetime import date, timedelta
from pathlib import Path
from typing import Type, TypeVar

from django.core.paginator import Paginator
from django.db import models
from django.db.models import Q

logger = logging.getLogger("wdms_logger")
T = TypeVar("T", bound=models.Model)

# Absolute path to response.json — works regardless of CWD
_RESPONSE_JSON_PATH = Path(__file__).resolve().parent.parent / "response.json"


class ResponseObject:
    id: int = 0
    status: bool = False
    code: int = 9000
    message: str = ""

    def __init__(self, id=0, status=False, code=9000, message=""):
        self.id = id
        self.status = status
        self.code = code
        self.message = message

    @staticmethod
    def __read_code_file(code_id):
        with open(_RESPONSE_JSON_PATH, "r") as file:
            response_codes = json.loads(file.read())
        return next(code for code in response_codes if code["id"] == code_id)

    @staticmethod
    def get_response(id: int, message: str | None = None):
        response_code = ResponseObject._ResponseObject__read_code_file(id)
        return ResponseObject(
            response_code["id"],
            response_code["status"],
            response_code["code"],
            message if message else response_code["message"],
        )


class PageObject:
    def __init__(
        self,
        number=None,
        has_next_page=None,
        has_previous_page=None,
        current_page_number=None,
        next_page_number=None,
        previous_page_number=None,
        number_of_pages=None,
        total_elements=None,
        pages_number_array=None,
    ):
        self.number = number
        self.has_next_page = has_next_page
        self.has_previous_page = has_previous_page
        self.current_page_number = current_page_number
        self.next_page_number = next_page_number
        self.previous_page_number = previous_page_number
        self.number_of_pages = number_of_pages
        self.total_elements = total_elements
        self.pages_number_array = pages_number_array


def apply_search_filter(queryset, search_term: str):
    """Apply a global text search across all CharField and TextField columns."""
    if not search_term:
        return queryset

    q = Q()
    for field in queryset.model._meta.get_fields():
        if isinstance(field, (models.CharField, models.TextField)):
            q |= Q(**{f"{field.name}__icontains": search_term})
        elif isinstance(field, models.ForeignKey):
            related_model = field.related_model
            if related_model:
                for related_field in related_model._meta.get_fields():
                    if isinstance(related_field, (models.CharField, models.TextField)):
                        q |= Q(
                            **{
                                f"{field.name}__{related_field.name}__icontains": search_term
                            }
                        )

    return queryset.filter(q)


def apply_date_filters(
    queryset,
    start_date=None,
    end_date=None,
    time_range=None,
    date_field_name: str = "created_date",
    is_datetime: bool = False,
):
    """Apply date-range filtering using explicit dates or a TimeRangeEnum."""
    today = date.today()

    if time_range:
        if time_range == "TODAY":
            start_date = today
            end_date = today
        elif time_range == "THIS_WEEK":
            start_date, end_date = get_week_range(today)
        elif time_range == "THIS_MONTH":
            start_date = today.replace(day=1)
            end_date = today
        elif time_range == "THIS_YEAR":
            start_date = today.replace(month=1, day=1)
            end_date = today

    if start_date:
        queryset = queryset.filter(**{f"{date_field_name}__gte": start_date})
    if end_date:
        queryset = queryset.filter(**{f"{date_field_name}__lte": end_date})

    return queryset


def get_paginated_and_non_paginated_data(
    model,
    filtering_object,
    serializer,
    additional_filters: Q | None = None,
    exclude_filtering_object: Q | None = None,
    custom_look_up_filter: dict | None = None,
    is_paged: bool = True,
    additional_computed_values: dict = None,
    custom_date_field_name: str = "created_date",
    is_custom_date_field_date_time: bool = False,
    **kwargs,
):
    try:
        # Build queryset from model class or pre-filtered queryset
        if isinstance(model, models.QuerySet):
            queryset = model
        else:
            queryset = model.objects.all()

        # Extract filtering dict
        if filtering_object is not None:
            if hasattr(filtering_object, "dict"):
                filter_dict = filtering_object.dict(exclude_none=True)
            else:
                filter_dict = dict(filtering_object) if filtering_object else {}
        else:
            filter_dict = {}

        # Pull out special keys before passing to .filter()
        page_number = filter_dict.pop("page_number", 1) or 1
        items_per_page = filter_dict.pop("items_per_page", 10) or 10
        search_term = filter_dict.pop("search_term", None)
        unique_id = filter_dict.pop("unique_id", None)
        start_date = filter_dict.pop("start_date", None)
        end_date = filter_dict.pop("end_date", None)
        time_range = filter_dict.pop("time_range", None)

        # Force is_active=True unless caller overrides it
        if "is_active" not in filter_dict:
            filter_dict["is_active"] = True

        # Translate field names if a custom lookup is provided
        if custom_look_up_filter:
            translated = {}
            for k, v in filter_dict.items():
                translated[custom_look_up_filter.get(k, k)] = v
            filter_dict = translated

        queryset = queryset.filter(**filter_dict)

        if additional_filters:
            queryset = queryset.filter(additional_filters)

        if exclude_filtering_object:
            queryset = queryset.exclude(exclude_filtering_object)

        if unique_id:
            queryset = queryset.filter(unique_id=unique_id)

        if search_term:
            queryset = apply_search_filter(queryset, search_term)

        queryset = apply_date_filters(
            queryset,
            start_date=start_date,
            end_date=end_date,
            time_range=time_range,
            date_field_name=custom_date_field_name,
            is_datetime=is_custom_date_field_date_time,
        )

        if not is_paged:
            return serializer(
                response=ResponseObject.get_response(1),
                data=list(queryset),
            )

        paginator = Paginator(queryset, items_per_page)
        page = paginator.get_page(page_number)

        page_obj = PageObject(
            number=paginator.num_pages,
            has_next_page=page.has_next(),
            has_previous_page=page.has_previous(),
            current_page_number=page.number,
            next_page_number=page.next_page_number() if page.has_next() else None,
            previous_page_number=page.previous_page_number()
            if page.has_previous()
            else None,
            number_of_pages=paginator.num_pages,
            total_elements=paginator.count,
            pages_number_array=list(paginator.page_range),
        )

        return serializer(
            response=ResponseObject.get_response(1),
            page=page_obj,
            data=list(page.object_list),
        )

    except Exception as e:
        logger.error(f"get_paginated_and_non_paginated_data error: {e}")
        return serializer(response=ResponseObject.get_response(2, str(e)))


def get_week_range(today: date):
    start = today - timedelta(days=today.weekday())
    end = start + timedelta(days=6)
    return start, end
