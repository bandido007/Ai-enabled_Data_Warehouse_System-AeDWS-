import logging
from typing import Any, Dict, Optional

import jwt
from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from wdms_uaa.authentication.user_management import UserManagementService
from wdms_uaa.models import LoginAttempt
from wdms_utils.encryption import AESCipher

logger = logging.getLogger("wdms_logger")
encryption = AESCipher(key=settings.SECRET_KEY)


class AuthenticationService:
    """Layer 1 — Who are you?

    Verifies identity and generates tokens. Does NOT know about roles
    or permissions — those are AuthorizationService's concern.
    """

    def validate_token(self, token: str) -> Optional[int]:
        """Verify an AES-encrypted JWT and return user_id if valid."""
        try:
            decrypted_token = encryption.decrypt(token)
            user_data = jwt.decode(
                decrypted_token,
                options={"verify_signature": True, "verify_exp": True},
                algorithms=settings.SIMPLE_JWT["ALGORITHM"],
                key=settings.SIMPLE_JWT["SIGNING_KEY"],
            )
            if user_data.get("token_type") != "access":
                return None
            return user_data.get("user_id")
        except Exception as e:
            logger.error(f"Token validation failed: {e}")
            return None

    def get_user_from_token(self, token: str) -> Optional[User]:
        user_id = self.validate_token(token)
        if not user_id:
            return None
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    def check_login_attempts(
        self, username: str, ip_address: str
    ) -> Dict[str, Any]:
        """Rate-limit guard. Returns {'allowed': bool, ...}."""
        max_attempts = getattr(settings, "MAX_ATTEMPTS_FAILURE", 5)
        block_seconds = getattr(settings, "MAX_TIME_BLOCKED", 300)

        attempt = LoginAttempt.objects.filter(username=username).first()
        if not attempt:
            return {"allowed": True}

        if attempt.blocked_time:
            elapsed = (timezone.now() - attempt.blocked_time).total_seconds()
            if elapsed < block_seconds:
                remaining = int(block_seconds - elapsed)
                return {
                    "allowed": False,
                    "seconds_remaining": remaining,
                    "message": f"Account locked. Try again in {remaining} seconds.",
                }
            # Block period expired — reset
            attempt.attempts = 0
            attempt.blocked_time = None
            attempt.save()

        if attempt.attempts >= max_attempts:
            attempt.blocked_time = timezone.now()
            attempt.save()
            return {
                "allowed": False,
                "seconds_remaining": block_seconds,
                "message": f"Too many failed attempts. Account locked for {block_seconds} seconds.",
            }

        return {"allowed": True}

    def _record_failed_attempt(self, username: str, ip_address: str):
        attempt, _ = LoginAttempt.objects.get_or_create(
            username=username,
            defaults={"ip_address": ip_address},
        )
        attempt.attempts += 1
        attempt.ip_address = ip_address
        attempt.save()

    def _clear_attempts(self, username: str):
        LoginAttempt.objects.filter(username=username).delete()

    def authenticate_with_credentials(
        self, username: str, password: str, ip_address: str = None
    ) -> Optional[Dict[str, Any]]:
        """Return token dict if valid, None on wrong credentials, error dict on lock."""
        try:
            if ip_address:
                attempt_check = self.check_login_attempts(username, ip_address)
                if not attempt_check["allowed"]:
                    return {"error": "user_blocked", "detail": attempt_check["message"]}

            user = User.objects.filter(username=username).first()
            if not user:
                user = User.objects.filter(email=username).first()

            if not user or not user.check_password(password):
                if ip_address:
                    self._record_failed_attempt(username, ip_address)
                return None

            self._clear_attempts(username)

            refresh = RefreshToken.for_user(user)
            return {
                "refresh": encryption.encrypt(str(refresh)),
                "access": encryption.encrypt(str(refresh.access_token)),
                "expires": settings.ACCESS_TOKEN_LIFETIME_SECONDS,
                "user": {
                    "id": str(user.id),
                    "userName": user.username,
                    "email": user.email,
                    "firstName": user.first_name,
                    "lastName": user.last_name,
                },
            }
        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            return None

    def authenticate_with_google(self, jwt_token: str) -> Optional[Dict[str, Any]]:
        """Verify a Google ID token and provision/return a warehouse DMS user."""
        try:
            from wdms_uaa.authentication.google_auth import GoogleAuth

            google = GoogleAuth()
            payload = google.verify_token(jwt_token)
            if not payload:
                return None

            mgmt = UserManagementService()
            user = mgmt.create_or_update_user_from_google(
                email=payload.get("email", ""),
                given_name=payload.get("given_name", ""),
                family_name=payload.get("family_name", ""),
            )
            if not user:
                return None

            refresh = RefreshToken.for_user(user)
            return {
                "refresh": encryption.encrypt(str(refresh)),
                "access": encryption.encrypt(str(refresh.access_token)),
                "expires": settings.ACCESS_TOKEN_LIFETIME_SECONDS,
                "user": {
                    "id": str(user.id),
                    "userName": user.username,
                    "email": user.email,
                    "firstName": user.first_name,
                    "lastName": user.last_name,
                },
            }
        except Exception as e:
            logger.error(f"Google authentication failed: {e}")
            return None
