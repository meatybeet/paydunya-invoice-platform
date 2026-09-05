"""Small self-contained authentication helpers for the API."""

import base64
import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta

from ..config import settings


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt.encode("utf-8"), n=2**14, r=8, p=1
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored_value: str) -> bool:
    try:
        salt, _ = stored_value.split("$", 1)
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, salt), stored_value)


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": int((datetime.now(UTC) + timedelta(days=7)).timestamp()),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload_bytes).rstrip(b"=")
    signature = hmac.new(
        settings.auth_secret.encode("utf-8"), encoded_payload, hashlib.sha256
    ).digest()
    return f"{encoded_payload.decode()}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


def read_access_token(token: str) -> str | None:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        expected = hmac.new(
            settings.auth_secret.encode("utf-8"), encoded_payload.encode(), hashlib.sha256
        ).digest()
        signature = base64.urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))
        if not hmac.compare_digest(signature, expected):
            return None
        payload = json.loads(base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4)))
        if payload["exp"] < int(datetime.now(UTC).timestamp()):
            return None
        return str(payload["sub"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None
