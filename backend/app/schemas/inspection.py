"""Pydantic schemas for inspections."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class QualityMetricsSchema(BaseModel):
    blur_score: float
    exposure_score: float
    glare_estimate: float
    image_coverage: float
    alignment_confidence: float
    inspection_suitability: str
    reasons: list[str]


class VisionObservationRead(BaseModel):
    id: str
    inspection_id: str
    observation_type: str
    bbox_x: Optional[float] = None
    bbox_y: Optional[float] = None
    bbox_width: Optional[float] = None
    bbox_height: Optional[float] = None
    confidence: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    details_json: dict[str, Any] = {}
    evidence_image_path: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InspectionCreate(BaseModel):
    equipment_id: str
    inspector_id: Optional[str] = None


class InspectionRead(BaseModel):
    id: str
    equipment_id: str
    organization_id: str
    inspector_id: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_ms: int = 0
    agent_run_id: Optional[str] = None
    findings: list[str] = []

    model_config = {"from_attributes": True}


class InspectionStartRequest(BaseModel):
    equipment_id: str
    input_type: str = "image"  # image, video, live


class InspectionResponse(BaseModel):
    inspection: InspectionRead
    message: str
