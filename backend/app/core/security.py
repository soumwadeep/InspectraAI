"""Security: password hashing and JWT token utilities."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt
from fastapi import HTTPException, status

from app.config import settings

# bcrypt silently ignores bytes past 72, so a longer secret must be rejected
# rather than truncated — otherwise a password could match a different one.
_BCRYPT_MAX_BYTES = 72
_BCRYPT_ROUNDS = 12


def hash_password(password: str) -> str:
    secret = password.encode("utf-8")
    if len(secret) > _BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must not exceed {_BCRYPT_MAX_BYTES} bytes")
    return bcrypt.hashpw(secret, bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        # Malformed or truncated hash in storage: treat as no match, never raise.
        return False


def create_access_token(
    data: dict[str, Any], expires_delta: timedelta | None = None
) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": int(expire.timestamp()), "iat": int(datetime.now(timezone.utc).timestamp())})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
