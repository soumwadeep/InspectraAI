"""Maintenance ticket, events, approvals, and repair verification models."""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, uuid_gen


class TicketPriorityEnum(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class TicketStatusEnum(str, enum.Enum):
    draft = "draft"
    awaiting_approval = "awaiting-approval"
    open = "open"
    assigned = "assigned"
    in_progress = "in-progress"
    awaiting_verification = "awaiting-verification"
    closed = "closed"
    reopened = "reopened"


class MaintenanceTicket(Base):
    __tablename__ = "maintenance_tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    equipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("equipment.id"), nullable=False
    )
    finding_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("findings.id"), nullable=False
    )
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    priority: Mapped[TicketPriorityEnum] = mapped_column(
        Enum(TicketPriorityEnum), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_operator_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    status: Mapped[TicketStatusEnum] = mapped_column(
        Enum(TicketStatusEnum), default=TicketStatusEnum.draft, nullable=False
    )
    due_date: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    completion_notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    equipment: Mapped["Equipment"] = relationship(back_populates="tickets")
    finding: Mapped["Finding"] = relationship(back_populates="ticket")
    events: Mapped[list["MaintenanceTicketEvent"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
    )
    approvals: Mapped[list["ApprovalRequest"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
    )
    evidence: Mapped[list["RepairEvidence"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
    )
    verifications: Mapped[list["RepairVerification"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
    )


class MaintenanceTicketEvent(Base):
    __tablename__ = "maintenance_ticket_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    ticket_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("maintenance_tickets.id"), nullable=False
    )
    status: Mapped[TicketStatusEnum] = mapped_column(
        Enum(TicketStatusEnum), nullable=False
    )
    actor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    ticket: Mapped["MaintenanceTicket"] = relationship(back_populates="events")


class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    ticket_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("maintenance_tickets.id"), nullable=False
    )
    finding_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("findings.id"), nullable=True
    )
    requester_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    approver_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False
    )  # pending|approved|rejected
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    ticket: Mapped["MaintenanceTicket"] = relationship(back_populates="approvals")
    requester: Mapped["User"] = relationship(
        back_populates="approval_requests",
        foreign_keys="ApprovalRequest.requester_id",
    )


class RepairEvidence(Base):
    __tablename__ = "repair_evidence"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    ticket_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("maintenance_tickets.id"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(512), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    ticket: Mapped["MaintenanceTicket"] = relationship(back_populates="evidence")


class RepairVerification(Base):
    __tablename__ = "repair_verifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    ticket_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("maintenance_tickets.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # passed|failed|pending
    details_json: Mapped[str] = mapped_column(JSON, default="{}", nullable=False)
    verifier_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    ticket: Mapped["MaintenanceTicket"] = relationship(back_populates="verifications")
