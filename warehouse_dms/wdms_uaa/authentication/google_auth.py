import logging
from typing import Optional

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

logger = logging.getLogger("wdms_logger")


class GoogleAuth:
    """Verify a Google ID token and return its decoded payload."""

    def verify_token(self, jwt_token: str) -> Optional[dict]:
        try:
            payload = id_token.verify_oauth2_token(
                jwt_token,
                google_requests.Request(),
            )
            return payload
        except Exception as e:
            logger.error(f"Google token verification failed: {e}")
            return None
