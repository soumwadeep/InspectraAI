"""Pydantic schemas for maintenance tickets."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ApprovalDecision(BaseModel):
    action: str  # approved | rejected
    reason: Optional[str] = None
    approver_id: str


class MaintenanceTicketRead(BaseModel):
    id: str
    equipment_id: str
    finding_id: str
    organization_id: str
    priority: str
    description: str
    assigned_operator_id: Optional[str] = None
    status: str
    due_date: Optional[datetime] = None
    completion_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MaintenanceTicketCreate(BaseModel):
    equipment_id: str
    finding_id: str
    priority: str = "medium"
    description: str
    due_date: Optional[datetime] = None


class MaintenanceTicketUpdate(BaseModel):
    status: Optional[str] = None
    assigned_operator_id: Optional[str] = None
    priority: Optional[str] = None
    completion_notes: Optional[str] = None
    due_date: Optional[datetime] = None


class RepairVerificationRead(BaseModel):
    id: str
    ticket_id: str
    status: str
    details_json: dict
    verifier_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TicketEventRead(BaseModel):
    id: str
    ticket_id: str
    status: str
    actor_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApprovalRequestRead(BaseModel):
    id: str
    ticket_id: str
    finding_id: str
    requester_id: Optional[str] = None
    approver_id: Optional[str] = None
    status: str
    reason: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
