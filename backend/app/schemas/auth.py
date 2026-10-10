"""Pydantic schemas for authentication and user management."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator, Field

_BCRYPT_MAX_BYTES = 72


def _check_bcrypt_length(password: str) -> str:
    """bcrypt ignores anything past 72 *bytes*, so a longer secret would quietly
    authenticate against a truncated hash. Reject instead of silently weakening."""
    if len(password.encode("utf-8")) > _BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must not exceed {_BCRYPT_MAX_BYTES} bytes")
    return password


class UserRead(BaseModel):
    id: str
    email: str
    name: str
    role: str
    organization_id: str
    is_active: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(..., min_length=8)
    role: str = "inspector"

    _validate_password = field_validator("password")(_check_bcrypt_length)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str
    organization_name: str

    _validate_password = field_validator("password")(_check_bcrypt_length)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class TokenPayload(BaseModel):
    sub: str
    exp: int
    org_id: str
    role: str
