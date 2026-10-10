"""Pydantic schemas for equipment management."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class EquipmentBase(BaseModel):
    name: str
    category: str
    location: str
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    installation_date: Optional[datetime] = None
    inspection_schedule: Optional[str] = None
    assigned_inspector_id: Optional[str] = None


class EquipmentCreate(EquipmentBase):
    pass


class EquipmentUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    installation_date: Optional[datetime] = None
    inspection_schedule: Optional[str] = None
    assigned_inspector_id: Optional[str] = None
    status: Optional[str] = None


class EquipmentReferenceImageRead(BaseModel):
    id: str
    equipment_id: str
    filename: str
    storage_path: str
    s3_key: Optional[str] = None
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class EquipmentRead(EquipmentBase):
    id: str
    organization_id: str
    status: str
    is_archived: bool = False
    open_findings: int = 0
    last_inspection: Optional[datetime] = None
    reference_images: list[EquipmentReferenceImageRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
