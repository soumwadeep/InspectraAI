"""Pydantic schemas for benchmark runs."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class BenchmarkRunSchema(BaseModel):
    name: str
    description: Optional[str] = None
    config: dict[str, Any] = {}


class BenchmarkRunRead(BaseModel):
    id: str
    organization_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    config_json: dict[str, Any] = {}
    results_json: dict[str, Any] = {}
    created_at: datetime
    duration_ms: int

    model_config = {"from_attributes": True}
