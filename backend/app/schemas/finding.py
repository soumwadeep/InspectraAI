"""Pydantic schemas for findings."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class FindingEvidenceRead(BaseModel):
    id: str
    finding_id: str
    evidence_type: str
    storage_path: str
    s3_key: Optional[str] = None
    caption: Optional[str] = None
    metadata_json: dict[str, Any] = {}
    created_at: datetime

    model_config = {"from_attributes": True}


class FindingRead(BaseModel):
    id: str
    equipment_id: str
    inspection_id: str
    organization_id: str
    category: str
    description: str
    detection_method: str
    confidence: Optional[float] = None
    severity: str
    verification_status: str
    resolution_state: str
    assigned_reviewer_id: Optional[str] = None
    notes: Optional[str] = None
    evidence: list[FindingEvidenceRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FindingCreate(BaseModel):
    equipment_id: str
    inspection_id: str
    category: str
    description: str
    detection_method: str
    confidence: Optional[float] = None
    severity: str = "warning"
    evidence: list[dict[str, Any]] = []


class FindingUpdate(BaseModel):
    resolution_state: Optional[str] = None
    assigned_reviewer_id: Optional[str] = None
    notes: Optional[str] = None
    severity: Optional[str] = None
    verification_status: Optional[str] = None


class FindingReview(BaseModel):
    resolution_state: str
    notes: Optional[str] = None
    verified: bool = False
