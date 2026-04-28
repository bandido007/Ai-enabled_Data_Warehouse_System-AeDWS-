import secrets
import string


def get_forgot_password_token(length: int = 64) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def get_activation_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)
