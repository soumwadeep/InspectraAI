"""Server-side organization report.

The Reports page used to assemble this document in the browser out of the same
capped list endpoints the tables use — findings 100, tickets 100, inspections 50,
agent runs 50. A workspace past those caps got a report that silently described a
truncated slice of itself, and the page carried an amber card saying so.

Every figure here is a SQL aggregate over the whole organization, scoped by the
same `organization_id` the rest of the API uses, so the report cannot disagree
with the tables and does not shrink as the history grows.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_current_organization_id, get_db
from app.models.agent import AgentRun, AgentToolCall
from app.models.equipment import Equipment
from app.models.finding import Finding
from app.models.inspection import Inspection
from app.models.user import Organization, User
from app.models.ticket import MaintenanceTicket, TicketStatusEnum

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _histogram(db: Session, column, base_filters: list) -> dict[str, int]:
    """Count rows per distinct value of an enum-or-text column."""
    rows = (
        db.query(column, func.count())
        .filter(*base_filters)
        .group_by(column)
        .all()
    )
    return {str(value.value if hasattr(value, "value") else value): int(count) for value, count in rows}


def _duration_stats(db: Session, base_filters: list) -> dict:
    """min/median/max over inspections that actually reached a measurement.

    Rows still carrying duration_ms = 0 never completed, so including them would
    drag the mean down with a number that was never measured. The median is
    computed in Python rather than SQL because the two dialects this project runs
    on (SQLite, Postgres) implement percentiles differently.
    """
    values = sorted(
        duration
        for (duration,) in db.query(Inspection.duration_ms).filter(*base_filters).all()
        if duration and duration > 0
    )
    if not values:
        return {"measured": 0, "min_ms": None, "median_ms": None, "max_ms": None, "mean_ms": None}
    middle = len(values) // 2
    median = (
        values[middle]
        if len(values) % 2
        else (values[middle - 1] + values[middle]) / 2
    )
    return {
        "measured": len(values),
        "min_ms": values[0],
        "median_ms": median,
        "max_ms": values[-1],
        "mean_ms": round(sum(values) / len(values), 1),
    }


def _run_duration_stats(db: Session, base_filters: list) -> dict:
    """Wall-clock per run, from the started_at/ended_at pair the run wrote itself."""
    pairs = db.query(AgentRun.started_at, AgentRun.ended_at).filter(*base_filters).all()
    values = sorted(
        int((end - start).total_seconds() * 1000)
        for start, end in pairs
        if start and end and end > start
    )
    if not values:
        return {"measured": 0, "min_ms": None, "median_ms": None, "max_ms": None, "mean_ms": None}
    middle = len(values) // 2
    return {
        "measured": len(values),
        "min_ms": values[0],
        "median_ms": values[middle] if len(values) % 2 else (values[middle - 1] + values[middle]) / 2,
        "max_ms": values[-1],
        "mean_ms": round(sum(values) / len(values), 1),
    }


@router.get("/organization")
async def organization_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
    days: Optional[int] = Query(default=None, ge=1, le=365),
):
    """Aggregate the organization's inspection history for the export report.

    `days` scopes every section to rows started/created inside the window; omit
    it for the whole history. The window boundary is generated server-side, so
    the report no longer depends on the browser clock.
    """
    generated_at = datetime.utcnow()
    window_start = generated_at - timedelta(days=days) if days else None

    def scoped(timestamp_column):
        filters = []
        if window_start:
            filters.append(timestamp_column >= window_start)
        return filters

    inspections_filters = [Inspection.organization_id == org_id, *scoped(Inspection.started_at)]
    findings_filters = [Finding.organization_id == org_id, *scoped(Finding.created_at)]
    tickets_filters = [MaintenanceTicket.organization_id == org_id, *scoped(MaintenanceTicket.created_at)]
    runs_filters = [AgentRun.organization_id == org_id, *scoped(AgentRun.started_at)]

    organization = db.get(Organization, org_id)

    open_count = (
        db.query(func.count(MaintenanceTicket.id))
        .filter(*tickets_filters, MaintenanceTicket.status != TicketStatusEnum.closed)
        .scalar()
    )
    overdue = (
        db.query(func.count(MaintenanceTicket.id))
        .filter(
            *tickets_filters,
            MaintenanceTicket.status != TicketStatusEnum.closed,
            MaintenanceTicket.due_date.isnot(None),
            MaintenanceTicket.due_date < generated_at,
        )
        .scalar()
    )

    iterations, budget_used = db.query(
        func.coalesce(func.sum(AgentRun.iterations), 0),
        func.coalesce(func.sum(AgentRun.budget_used), 0.0),
    ).filter(*runs_filters).one()

    return {
        "scope": {
            "organization_id": org_id,
            "organization_name": organization.name if organization else None,
            "requested_by": current_user.email,
            "role": getattr(current_user.role, "value", str(current_user.role)),
            "window_days": days,
            "window_start": window_start.isoformat() if window_start else None,
            "generated_at": generated_at.isoformat(),
            "assembled_by": "server",
            "aggregation": "SQL aggregates over every row in scope, not a capped list page",
        },
        "inspections": {
            "total": db.query(func.count(Inspection.id)).filter(*inspections_filters).scalar(),
            "by_status": _histogram(db, Inspection.status, inspections_filters),
            "duration": _duration_stats(db, inspections_filters),
        },
        "findings": {
            "total": db.query(func.count(Finding.id)).filter(*findings_filters).scalar(),
            "by_severity": _histogram(db, Finding.severity, findings_filters),
            "by_category": _histogram(db, Finding.category, findings_filters),
            "by_verification": _histogram(db, Finding.verification_status, findings_filters),
            "by_resolution": _histogram(db, Finding.resolution_state, findings_filters),
        },
        "tickets": {
            "total": db.query(func.count(MaintenanceTicket.id)).filter(*tickets_filters).scalar(),
            "by_status": _histogram(db, MaintenanceTicket.status, tickets_filters),
            "by_priority": _histogram(db, MaintenanceTicket.priority, tickets_filters),
            "open": int(open_count or 0),
            "overdue": int(overdue or 0),
        },
        "agent_runs": {
            "total": db.query(func.count(AgentRun.id)).filter(*runs_filters).scalar(),
            "by_status": _histogram(db, AgentRun.status, runs_filters),
            "iterations": int(iterations or 0),
            "budget_used": round(float(budget_used or 0.0), 1),
            # Counted against the runs in scope, not the whole table, so the
            # figure matches the total above.
            "tool_calls": (
                db.query(func.count(AgentToolCall.id))
                .filter(AgentToolCall.run_id.in_(
                    select(AgentRun.id).filter(*runs_filters)
                ))
                .scalar()
            ),
            "duration": _run_duration_stats(db, runs_filters),
        },
        "equipment": {
            "total": db.query(func.count(Equipment.id)).filter(
                Equipment.organization_id == org_id, Equipment.is_archived.is_(False)
            ).scalar(),
            "by_status": _histogram(
                db, Equipment.status, [Equipment.organization_id == org_id]
            ),
            "archived": db.query(func.count(Equipment.id)).filter(
                Equipment.organization_id == org_id, Equipment.is_archived.is_(True)
            ).scalar(),
        },
    }
