"""Pydantic schemas for agent runs, steps, and tool calls."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class AgentRunStatusEnum(str):
    running = "running"
    completed = "completed"
    failed = "failed"
    paused = "paused"


class AgentStepRead(BaseModel):
    id: str
    run_id: str
    step_number: int
    action_type: str
    tool_name: Optional[str] = None
    description: str
    arguments: dict[str, Any] = {}
    result_summary: Optional[str] = None
    evidence_ref: Optional[str] = None
    decision: Optional[str] = None
    reason: Optional[str] = None
    timestamp: datetime
    duration_ms: int = 0
    is_human_interaction: bool = False

    model_config = {"from_attributes": True}


class AgentToolCallRead(BaseModel):
    id: str
    run_id: str
    step_id: Optional[str] = None
    tool_name: str
    arguments: dict[str, Any] = {}
    result_summary: Optional[str] = None
    result_json: dict[str, Any] = {}
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: int = 0
    success: bool = True

    model_config = {"from_attributes": True}


class AgentRunRead(BaseModel):
    id: str
    inspection_id: str
    organization_id: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    iterations: int
    budget_used: float
    final_action: Optional[str] = None
    final_outcome: dict[str, Any] = {}
    steps: list[AgentStepRead] = []
    tool_calls: list[AgentToolCallRead] = []

    model_config = {"from_attributes": True}


class HumanResponse(BaseModel):
    response: str
    finding_id: Optional[str] = None
