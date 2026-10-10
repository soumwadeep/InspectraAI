"""Authentication endpoints: login, register, token refresh, current user."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.config import settings
from app.core.dependencies import get_db, get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import OrganizationMember, RoleEnum, User, Organization
from app.schemas.auth import LoginRequest, LoginResponse, RegisterRequest, UserRead

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(login_data: LoginRequest, db=Depends(get_db)):
    """Authenticate a user and return an access token."""
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated",
        )

    access_token = create_access_token(
        data={
            "sub": user.id,
            "org_id": user.organization_id,
            "role": user.role.value,
        }
    )
    return LoginResponse(
        access_token=access_token,
        user=UserRead.model_validate(user),
    )


@router.post("/register", response_model=LoginResponse, status_code=201)
async def register(reg_data: RegisterRequest, db=Depends(get_db)):
    """Register a new user and the organization they own.

    The first member of a new organization is its administrator: approvals and
    ticket closure require that role, and without this rule a fresh install has
    no way to produce one — the old ``/api/admin/init-db`` bootstrap needed an
    admin token that could not exist yet.
    """
    existing = db.query(User).filter(User.email == reg_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    org = Organization(
        name=reg_data.organization_name,
        slug=await _unique_slug(db, reg_data.organization_name),
    )
    db.add(org)
    db.flush()

    user = User(
        email=reg_data.email,
        hashed_password=hash_password(reg_data.password),
        name=reg_data.name,
        role=RoleEnum.administrator,
        organization_id=org.id,
    )
    db.add(user)
    db.flush()

    db.add(
        OrganizationMember(
            organization_id=org.id,
            user_id=user.id,
            role=RoleEnum.administrator,
        )
    )
    db.commit()
    db.refresh(user)

    access_token = create_access_token(
        data={"sub": user.id, "org_id": org.id, "role": user.role.value}
    )
    return LoginResponse(
        access_token=access_token,
        user=UserRead.model_validate(user),
    )


async def _unique_slug(db, organization_name: str) -> str:
    """Slugify and de-duplicate; ``organizations.slug`` is UNIQUE and this runs on
    every signup, so two companies with the same name would raise IntegrityError
    and return a 500 instead of a usable account."""
    import re

    base = re.sub(r"[^a-z0-9]+", "-", organization_name.lower()).strip("-") or "org"
    slug = base
    suffix = 2
    while db.query(Organization).filter(Organization.slug == slug).first():
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


@router.get("/me", response_model=UserRead)
async def get_current(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user."""
    return current_user


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """Logout endpoint (token is stateless — client just discards it)."""
    return {"message": "Logged out successfully"}
