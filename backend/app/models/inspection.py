"""Inspection, input, job, frame, and observation models."""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    Float,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, uuid_gen, value_enum


class InspectionStatusEnum(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    quality_check = "quality-check"
    analyzing = "analyzing"
    awaiting_evidence = "awaiting-evidence"
    finding = "finding"
    approval = "approval"
    ticket = "ticket"
    completed = "completed"
    failed = "failed"


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    equipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("equipment.id"), nullable=False
    )
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    inspector_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    status: Mapped[InspectionStatusEnum] = mapped_column(
        value_enum(InspectionStatusEnum),
        default=InspectionStatusEnum.pending,
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    # agent_runs.inspection_id and inspections.agent_run_id form a cycle. SQLite
    # tolerates it; Postgres would raise UndefinedTable because agent_runs sorts
    # first, so this side must be added with ALTER TABLE after both exist.
    agent_run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("agent_runs.id", use_alter=True, name="fk_inspections_agent_run_id"),
        nullable=True,
    )

    equipment: Mapped["Equipment"] = relationship(back_populates="inspections")
    inputs: Mapped[list["InspectionInput"]] = relationship(
        back_populates="inspection",
        cascade="all, delete-orphan",
    )
    jobs: Mapped[list["InspectionJob"]] = relationship(
        back_populates="inspection",
        cascade="all, delete-orphan",
    )
    frames: Mapped[list["InspectionFrame"]] = relationship(
        back_populates="inspection",
        cascade="all, delete-orphan",
    )
    findings: Mapped[list["Finding"]] = relationship(
        back_populates="inspection",
        cascade="all, delete-orphan",
    )


class InspectionInput(Base):
    __tablename__ = "inspection_inputs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    inspection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("inspections.id"), nullable=False
    )
    input_type: Mapped[str] = mapped_column(String(20), nullable=False)  # image|video|live
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(512), nullable=True)
    width: Mapped[int] = mapped_column(Integer, nullable=True)
    height: Mapped[int] = mapped_column(Integer, nullable=True)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[str] = mapped_column(JSON, default=dict, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    inspection: Mapped["Inspection"] = relationship(back_populates="inputs")


class InspectionJob(Base):
    __tablename__ = "inspection_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    inspection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("inspections.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    result_json: Mapped[str] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    inspection: Mapped["Inspection"] = relationship(back_populates="jobs")


class InspectionFrame(Base):
    __tablename__ = "inspection_frames"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    inspection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("inspections.id"), nullable=False
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("inspection_jobs.id"), nullable=True
    )
    frame_index: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp_ms: Mapped[int] = mapped_column(Integer, nullable=True)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(512), nullable=True)

    inspection: Mapped["Inspection"] = relationship(back_populates="frames")


class VisionObservation(Base):
    """A single detected anomaly region or quality metric result."""

    __tablename__ = "vision_observations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    inspection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("inspections.id"), nullable=False
    )
    frame_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("inspection_frames.id"), nullable=True
    )
    # Which run measured this. Without it a re-run left the previous run's numbers
    # indistinguishable from the current ones, so `vision_observations` could not
    # be read as "what the pipeline measured" for an inspection.
    agent_run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("agent_runs.id"), nullable=True
    )
    observation_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # quality|defect|change|alignment|temporal

    # Coordinates (relative 0-1 or absolute)
    bbox_x: Mapped[float] = mapped_column(Float, nullable=True)
    bbox_y: Mapped[float] = mapped_column(Float, nullable=True)
    bbox_width: Mapped[float] = mapped_column(Float, nullable=True)
    bbox_height: Mapped[float] = mapped_column(Float, nullable=True)

    confidence: Mapped[float] = mapped_column(Float, nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    details_json: Mapped[str] = mapped_column(JSON, default=dict, nullable=False)
    evidence_image_path: Mapped[str] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
