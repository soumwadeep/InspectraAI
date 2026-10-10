"""Authentication endpoints: login, register, token refresh, current user."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.config import settings
from app.core.dependencies import get_db, get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import RoleEnum, User, Organization
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
    """Register a new user and organization."""
    existing = db.query(User).filter(User.email == reg_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    org = Organization(
        name=reg_data.organization_name,
        slug=reg_data.organization_name.lower().replace(" ", "-"),
    )
    db.add(org)
    db.flush()

    user = User(
        email=reg_data.email,
        hashed_password=hash_password(reg_data.password),
        name=reg_data.name,
        role=RoleEnum.inspector,
        organization_id=org.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(
        data={"sub": user.id, "org_id": org.id, "role": user.role.value}
    )
    return LoginResponse(
        access_token=access_token,
        user=UserRead.model_validate(user),
    )


@router.get("/me", response_model=UserRead)
async def get_current(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user."""
    return current_user


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """Logout endpoint (token is stateless — client just discards it)."""
    return {"message": "Logged out successfully"}
