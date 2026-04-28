import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger("wdms_logger")


class LoginAttemptsMiddleware:
    """Rate-limit middleware that blocks IPs with too many failed logins.

    This middleware records context in the request object so that the
    AuthenticationService can access the IP address without touching
    the WSGI environ directly. The heavy lifting (actual blocking) is
    done inside AuthenticationService.check_login_attempts so that
    the same logic is reachable from both the middleware and tests.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.client_ip = self._get_client_ip(request)
        response = self.get_response(request)
        return response

    @staticmethod
    def _get_client_ip(request) -> str:
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "unknown")
