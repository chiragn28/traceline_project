from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from passlib.context import CryptContext

from app.core.config import settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# bcrypt silently truncates anything past 72 bytes, and passlib raises on
# it rather than truncating. Enforced at the schema layer as a validation
# error; this constant is the single source of truth for that limit.
MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 12

# A bcrypt hash of a value nobody holds, used to spend the same time
# verifying a password for an email that doesn't exist as for one that
# does -- see verify_password_dummy.
_DUMMY_HASH = _pwd_context.hash("traceline-nonexistent-user-placeholder")


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _pwd_context.verify(password, hashed)
    except ValueError:
        # Malformed/truncated hash in the row, or a password over bcrypt's
        # 72-byte limit. Neither is a valid credential; neither should be a
        # 500 on the login path.
        return False


def verify_password_dummy() -> None:
    """Burn one bcrypt verification against a throwaway hash.

    Login must take the same observable time whether or not the email
    exists. Without this, a missing user returns before any hashing
    happens and answers in single-digit milliseconds while a real user
    takes ~100ms+, which is a reliable account-enumeration oracle -- and
    for this product, knowing which corporate emails hold a Traceline
    account is itself useful reconnaissance.
    """
    _pwd_context.verify("traceline-nonexistent-user-placeholder", _DUMMY_HASH)


def create_access_token(user_id: UUID, workspace_id: UUID, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "workspace_id": str(workspace_id),
        "email": email,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
