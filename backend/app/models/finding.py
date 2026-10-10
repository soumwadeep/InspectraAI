"""Finding, evidence, and audit log models."""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, uuid_gen, value_enum


class SeverityEnum(str, enum.Enum):
    critical = "critical"
    warning = "warning"
    info = "info"
    success = "success"


class FindingStatusEnum(str, enum.Enum):
    pending_review = "pending-review"
    confirmed = "confirmed"
    rejected = "rejected"
    needs_evidence = "needs-evidence"
    in_progress = "in-progress"
    resolved = "resolved"


class VerificationStatusEnum(str, enum.Enum):
    unverified = "unverified"
    verified = "verified"
    rejected = "rejected"


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    equipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("equipment.id"), nullable=False
    )
    inspection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("inspections.id"), nullable=False
    )
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    detection_method: Mapped[str] = mapped_column(String(255), nullable=False)
    confidence: Mapped[float] = mapped_column(JSON, nullable=True)
    severity: Mapped[SeverityEnum] = mapped_column(value_enum(SeverityEnum), nullable=False)
    verification_status: Mapped[VerificationStatusEnum] = mapped_column(
        value_enum(VerificationStatusEnum),
        default=VerificationStatusEnum.unverified,
    )
    resolution_state: Mapped[FindingStatusEnum] = mapped_column(
        value_enum(FindingStatusEnum), default=FindingStatusEnum.pending_review
    )
    assigned_reviewer_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    equipment: Mapped["Equipment"] = relationship(back_populates="findings")
    inspection: Mapped["Inspection"] = relationship(back_populates="findings")
    evidence: Mapped[list["FindingEvidence"]] = relationship(
        back_populates="finding",
        cascade="all, delete-orphan",
    )
    ticket: Mapped["MaintenanceTicket | None"] = relationship(
        back_populates="finding",
        cascade="all, delete-orphan",
    )


class FindingEvidence(Base):
    __tablename__ = "finding_evidence"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    finding_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("findings.id"), nullable=False
    )
    evidence_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # original|annotated|cropped|comparison
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(512), nullable=True)
    caption: Mapped[str] = mapped_column(String(255), nullable=True)
    metadata_json: Mapped[str] = mapped_column(JSON, default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    finding: Mapped["Finding"] = relationship(back_populates="evidence")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=True)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=True)
    details_json: Mapped[str] = mapped_column(JSON, default="{}", nullable=False)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User | None"] = relationship(back_populates="audit_logs")
