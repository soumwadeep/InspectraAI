"""Agent run, steps, tool calls, and benchmark models."""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, ClassVar

from sqlalchemy import DateTime, ForeignKey, Float, JSON, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, uuid_gen, value_enum


class AgentRunStatus(str, enum.Enum):
    running = "running"
    completed = "completed"
    failed = "failed"
    paused = "paused"  # awaiting human input


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    inspection_id: Mapped[str] = mapped_column(
        ForeignKey("inspections.id"), nullable=False
    )
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    status: Mapped[AgentRunStatus] = mapped_column(
        value_enum(AgentRunStatus), default=AgentRunStatus.running, nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    iterations: Mapped[int] = mapped_column(Integer, default=0)
    # Tool costs are fractional (2.5, 3.0 per step), so Integer silently
    # truncates the budget the moment it is read back.
    budget_used: Mapped[float] = mapped_column(Float, default=0.0)
    final_action: Mapped[str] = mapped_column(String(512), nullable=True)
    final_outcome: Mapped[str] = mapped_column(JSON, default=dict, nullable=False)
    # Serialized WorkflowContext, written when a run pauses so it can be
    # resumed from real state instead of being marked complete.
    context_json: Mapped[str] = mapped_column(JSON, nullable=True)

    steps: Mapped[list["AgentStep"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="AgentStep.step_number",
    )
    tool_calls: Mapped[list["AgentToolCall"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
    )


class AgentStep(Base):
    __tablename__ = "agent_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("agent_runs.id"), nullable=False
    )
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    action: ClassVar[str]  # Will be stored as the step's action type
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    arguments: Mapped[str] = mapped_column(JSON, default=dict, nullable=False)
    result_summary: Mapped[str] = mapped_column(Text, nullable=True)
    evidence_ref: Mapped[str] = mapped_column(String(512), nullable=True)
    decision: Mapped[str] = mapped_column(Text, nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    is_human_interaction: Mapped[bool] = mapped_column(default=False, nullable=False)

    run: Mapped["AgentRun"] = relationship(back_populates="steps")


class AgentToolCall(Base):
    __tablename__ = "agent_tool_calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("agent_runs.id"), nullable=False
    )
    step_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("agent_steps.id"), nullable=True
    )
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    arguments: Mapped[str] = mapped_column(JSON, default=dict, nullable=False)
    result_summary: Mapped[str] = mapped_column(Text, nullable=True)
    result_json: Mapped[str] = mapped_column(JSON, default=dict, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    success: Mapped[bool] = mapped_column(default=True, nullable=False)

    run: Mapped["AgentRun"] = relationship(back_populates="tool_calls")


class BenchmarkRun(Base):
    __tablename__ = "benchmark_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_gen)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    config_json: Mapped[str] = mapped_column(JSON, default=dict, nullable=False)
    results_json: Mapped[str] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
