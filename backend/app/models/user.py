"""User, organization, and membership models."""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, uuid_gen


class RoleEnum(str, enum.Enum):
    administrator = "administrator"
    inspector = "inspector"
    maintenance_operator = "maintenance-operator"
    viewer = "viewer"


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    users: Mapped[list["User"]] = relationship(back_populates="organization")
    members: Mapped[list["OrganizationMember"]] = relationship(back_populates="organization")
    equipment: Mapped[list["Equipment"]] = relationship(back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[RoleEnum] = mapped_column(
        Enum(RoleEnum), nullable=False, default=RoleEnum.inspector
    )
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    organization: Mapped["Organization"] = relationship(back_populates="users")
    audit_logs: Mapped[list["AuditLog"] | None] = relationship(back_populates="user")
    approval_requests: Mapped[list["ApprovalRequest"] | None] = relationship(
        back_populates="requester",
        foreign_keys="ApprovalRequest.requester_id",
    )


class OrganizationMember(Base):
    __tablename__ = "organization_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    role: Mapped[RoleEnum] = mapped_column(
        Enum(RoleEnum), nullable=False, default=RoleEnum.viewer
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    organization: Mapped["Organization"] = relationship(back_populates="members")
