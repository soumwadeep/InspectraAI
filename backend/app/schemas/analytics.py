"""Pydantic schemas for analytics endpoints."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class InspectionsTrend(BaseModel):
    date: str
    count: int


class FindingsTrend(BaseModel):
    date: str
    confirmed: int
    rejected: int
    pending: int


class AnalyticsOverview(BaseModel):
    total_equipment: int
    total_inspections: int
    pending_review: int
    confirmed_findings: int
    open_tickets: int
    completed_tickets: int
    avg_processing_ms: float
    inspection_activity_trend: list[InspectionsTrend]
    finding_categories: dict[str, int]
    equipment_status: dict[str, int]
    priority_findings: list[dict[str, Any]]
    agent_activity_feed: list[dict[str, Any]]
    system_health: dict[str, Any]
