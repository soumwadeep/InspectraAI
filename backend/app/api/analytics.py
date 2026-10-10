"""Analytics endpoints: overview, trends, activity feed, system health."""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user, get_current_organization_id, get_db
from app.models.equipment import Equipment
from app.models.finding import Finding, FindingStatusEnum, SeverityEnum
from app.models.inspection import Inspection, InspectionStatusEnum
from app.models.ticket import MaintenanceTicket, TicketStatusEnum
from app.schemas.analytics import AnalyticsOverview
from sqlalchemy import func, select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview", response_model=AnalyticsOverview)
async def get_analytics_overview(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
    days: int = Query(default=30, ge=1, le=365),
):
    """Get comprehensive analytics overview for the current organization."""
    since = datetime.utcnow() - timedelta(days=days)

    # Counts
    total_equipment = db.query(func.count(Equipment.id)).filter(
        Equipment.organization_id == org_id
    ).scalar()

    total_inspections = db.query(func.count(Inspection.id)).filter(
        Inspection.organization_id == org_id
    ).scalar()

    pending_review = db.query(func.count(Finding.id)).filter(
        Finding.organization_id == org_id,
        Finding.resolution_state == FindingStatusEnum.pending_review,
    ).scalar()

    confirmed_findings = db.query(func.count(Finding.id)).filter(
        Finding.organization_id == org_id,
        Finding.resolution_state == FindingStatusEnum.confirmed,
    ).scalar()

    open_tickets = db.query(func.count(MaintenanceTicket.id)).filter(
        MaintenanceTicket.organization_id == org_id,
        MaintenanceTicket.status != TicketStatusEnum.closed,
    ).scalar()

    completed_tickets = db.query(func.count(MaintenanceTicket.id)).filter(
        MaintenanceTicket.organization_id == org_id,
        MaintenanceTicket.status == TicketStatusEnum.closed,
    ).scalar()

    # Inspection activity trend (last 30 days)
    inspection_trend = []
    for i in range(days):
        day = datetime.utcnow() - timedelta(days=i)
        next_day = day + timedelta(days=1)
        count = db.query(func.count(Inspection.id)).filter(
            Inspection.organization_id == org_id,
            Inspection.started_at >= day,
            Inspection.started_at < next_day,
        ).scalar()
        inspection_trend.append({
            "date": day.strftime("%Y-%m-%d"),
            "count": count,
        })
    inspection_trend.reverse()

    # Findings by category
    finding_categories = {}
    cat_results = db.query(
        Finding.category, func.count(Finding.id)
    ).filter(
        Finding.organization_id == org_id
    ).group_by(Finding.category).all()
    for cat, count in cat_results:
        finding_categories[cat or "unknown"] = count

    # Equipment status breakdown
    equipment_status = {}
    status_results = db.query(
        Equipment.status, func.count(Equipment.id)
    ).filter(
        Equipment.organization_id == org_id,
        Equipment.is_archived.is_(False),
    ).group_by(Equipment.status).all()
    for status, count in status_results:
        equipment_status[status.value if hasattr(status, 'value') else status] = count

    # Priority findings
    priority_findings = []
    critical_findings = db.query(Finding).filter(
        Finding.organization_id == org_id,
        Finding.severity == SeverityEnum.critical,
        Finding.resolution_state.in_(
            [FindingStatusEnum.pending_review, FindingStatusEnum.in_progress]
        ),
    ).order_by(Finding.created_at.desc()).limit(10).all()
    for f in critical_findings:
        priority_findings.append({
            "id": f.id,
            "category": f.category,
            "severity": f.severity.value if hasattr(f.severity, 'value') else f.severity,
            "equipment_id": f.equipment_id,
            "created_at": f.created_at.isoformat(),
        })

    # Agent activity feed
    from app.models.agent import AgentRun
    agent_activity = []
    # agent_runs and inspections reference each other, so SQLAlchemy cannot infer
    # the join path — the onclause must be stated on every such join.
    recent_runs = (
        db.query(AgentRun)
        .join(Inspection, Inspection.agent_run_id == AgentRun.id)
        .filter(Inspection.organization_id == org_id)
        .order_by(AgentRun.started_at.desc())
        .limit(10)
        .all()
    )
    for run in recent_runs:
        inspection = db.query(Inspection).filter(
            Inspection.agent_run_id == run.id
        ).first()
        eq_name = "Unknown"
        if inspection:
            eq = db.query(Equipment).filter(Equipment.id == inspection.equipment_id).first()
            if eq:
                eq_name = eq.name
        agent_activity.append({
            "run_id": run.id,
            "equipment": eq_name,
            "status": run.status,
            "iterations": run.iterations,
            "budget_used": run.budget_used,
            "started_at": run.started_at.isoformat() if run.started_at else None,
        })

    # InspectionJob has no duration_ms column, so this raised AttributeError and
    # the dashboard's only data call returned a 500. Inspection duration is the
    # measured wall-clock time of a run and is populated by run_inspection.
    avg_processing = (
        db.query(func.avg(Inspection.duration_ms))
        .filter(Inspection.organization_id == org_id)
        .filter(Inspection.duration_ms > 0)
        .scalar()
        or 0.0
    )

    return AnalyticsOverview(
        total_equipment=total_equipment,
        total_inspections=total_inspections,
        pending_review=pending_review,
        confirmed_findings=confirmed_findings,
        open_tickets=open_tickets,
        completed_tickets=completed_tickets,
        avg_processing_ms=float(avg_processing),
        inspection_activity_trend=inspection_trend,
        finding_categories=finding_categories,
        equipment_status=equipment_status,
        priority_findings=priority_findings,
        agent_activity_feed=agent_activity,
        system_health=await _system_health(),
    )


async def _system_health() -> dict:
    """Component state read from the running process, not assumed."""
    import cv2

    from app.config import settings
    from app.database import check_db_connection

    return {
        "database": check_db_connection(),
        "opencv": cv2.__version__,
        # A queue only exists if a broker is configured; nothing currently
        # enqueues, so this reports configuration rather than pretending health.
        "redis": bool(settings.redis_url),
        "processing_mode": "in-process" if not settings.redis_url else "configured",
    }
