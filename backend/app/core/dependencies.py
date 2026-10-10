"""FastAPI dependencies: authentication, RBAC, organization isolation."""
from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database import get_db
from app.models.user import RoleEnum, User
from app.schemas.auth import TokenPayload

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    token_data = TokenPayload(**payload)
    user = db.get(User, token_data.sub)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    """Non-raising auth check for public-but-optional endpoints."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    try:
        token = auth_header[7:]
        payload = decode_token(token)
        token_data = TokenPayload(**payload)
        return db.get(User, token_data.sub)
    except (HTTPException, ValueError):
        return None


def require_role(*allowed_roles: RoleEnum):
    """Dependency factory: enforces that the current user has one of the allowed roles."""

    def role_checker(
        user: User = Depends(get_current_user),
    ) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return role_checker


def get_current_organization_id(user: User = Depends(get_current_user)) -> str:
    return user.organization_id


def get_redis() -> Any:
    """Lazily return a Redis client or None if Redis is not configured."""
    from app.config import settings

    if not settings.redis_url:
        return None
    import redis

    return redis.from_url(settings.redis_url)
