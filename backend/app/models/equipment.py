"""Equipment and reference image models."""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, uuid_gen, value_enum


class EquipmentStatusEnum(str, enum.Enum):
    operational = "operational"
    warning = "warning"
    critical = "critical"
    maintenance = "maintenance"
    offline = "offline"


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    manufacturer: Mapped[str] = mapped_column(String(255), nullable=True)
    model: Mapped[str] = mapped_column(String(255), nullable=True)
    serial_number: Mapped[str] = mapped_column(String(255), nullable=True)
    installation_date: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    inspection_schedule: Mapped[str] = mapped_column(String(100), nullable=True)
    assigned_inspector_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    status: Mapped[EquipmentStatusEnum] = mapped_column(
        value_enum(EquipmentStatusEnum),
        default=EquipmentStatusEnum.operational,
        nullable=False,
    )
    is_archived: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    organization: Mapped["Organization"] = relationship(back_populates="equipment")
    reference_images: Mapped[list["EquipmentReferenceImage"]] = relationship(
        back_populates="equipment",
        cascade="all, delete-orphan",
    )
    inspections: Mapped[list["Inspection"]] = relationship(
        back_populates="equipment",
        cascade="all, delete-orphan",
    )
    findings: Mapped[list["Finding"]] = relationship(
        back_populates="equipment",
        cascade="all, delete-orphan",
    )
    tickets: Mapped[list["MaintenanceTicket"]] = relationship(
        back_populates="equipment",
        cascade="all, delete-orphan",
    )


class EquipmentReferenceImage(Base):
    __tablename__ = "equipment_reference_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    equipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("equipment.id"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(512), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    equipment: Mapped["Equipment"] = relationship(back_populates="reference_images")
