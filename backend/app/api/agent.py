"""Agent run endpoints: list, get detail, resume human input, status."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user, get_current_organization_id, get_db
from app.models.agent import AgentRun, AgentStep, AgentToolCall
from app.models.inspection import Inspection
from app.schemas.agent import AgentRunRead, AgentStepRead, HumanResponse
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.get("/runs", response_model=list[dict])
async def list_agent_runs(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
    limit: int = 50,
):
    """List agent runs for the current organization (via inspection join)."""
    runs = (
        db.query(AgentRun)
        .join(Inspection, Inspection.agent_run_id == AgentRun.id)
        .filter(Inspection.organization_id == org_id)
        .order_by(AgentRun.started_at.desc())
        .limit(limit)
        .all()
    )

    result = []
    for run in runs:
        inspection = db.query(Inspection).filter(Inspection.agent_run_id == run.id).first()
        steps = db.query(AgentStep).filter(AgentStep.run_id == run.id).all()
        tool_calls = db.query(AgentToolCall).filter(AgentToolCall.run_id == run.id).all()

        # Get equipment
        eq_name = "Unknown"
        if inspection:
            from app.models.equipment import Equipment
            eq = db.query(Equipment).filter(Equipment.id == inspection.equipment_id).first()
            if eq:
                eq_name = eq.name

        result.append({
            "id": run.id,
            "equipment": eq_name,
            "inspection_id": run.inspection_id,
            "status": run.status,
            "iterations": run.iterations,
            "budget_used": run.budget_used,
            "final_action": run.final_action,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "ended_at": run.ended_at.isoformat() if run.ended_at else None,
            "steps": [s.__dict__ for s in steps],
            "tool_calls": [tc.__dict__ for tc in tool_calls],
        })

    return result


@router.get("/runs/{run_id}", response_model=dict)
async def get_agent_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Get detailed info about a specific agent run, including all steps and tool calls."""
    run = db.query(AgentRun).filter(AgentRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found")

    # Verify org access
    inspection = db.query(Inspection).filter(Inspection.agent_run_id == run_id).first()
    if not inspection or inspection.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Access denied to this run")

    steps = db.query(AgentStep).filter(AgentStep.run_id == run_id).order_by(AgentStep.step_number).all()
    tool_calls = db.query(AgentToolCall).filter(AgentToolCall.run_id == run_id).all()

    return {
        "run": {
            "id": run.id,
            "inspection_id": run.inspection_id,
            "status": run.status,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "ended_at": run.ended_at.isoformat() if run.ended_at else None,
            "iterations": run.iterations,
            "budget_used": run.budget_used,
            "final_action": run.final_action,
            "final_outcome": run.final_outcome,
        },
        "steps": [
            {
                "step_number": s.step_number,
                "action_type": s.action_type,
                "description": s.description,
                "tool_name": s.tool_name,
                "arguments": s.arguments,
                "result_summary": s.result_summary,
                "decision": s.decision,
                "reason": s.reason,
                "duration_ms": s.duration_ms,
                "timestamp": s.timestamp.isoformat() if s.timestamp else None,
                "is_human_interaction": s.is_human_interaction,
            }
            for s in steps
        ],
        "tool_calls": [
            {
                "id": tc.id,
                "tool_name": tc.tool_name,
                "arguments": tc.arguments,
                "result_summary": tc.result_summary,
                "result_json": tc.result_json,
                "started_at": tc.started_at.isoformat() if tc.started_at else None,
                "completed_at": tc.completed_at.isoformat() if tc.completed_at else None,
                "duration_ms": tc.duration_ms,
                "success": tc.success,
            }
            for tc in tool_calls
        ],
    }


@router.post("/runs/{run_id}/resume", response_model=dict)
async def resume_agent_run(
    run_id: str,
    response: HumanResponse,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Resume a paused agent run with a human response."""
    run = db.query(AgentRun).filter(AgentRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found")

    inspection = db.query(Inspection).filter(Inspection.agent_run_id == run_id).first()
    if not inspection or inspection.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if run.status != "paused":
        raise HTTPException(status_code=400, detail="Run is not paused")

    # In a full implementation, we would resume the agent from where it left off
    # For now, record the human response and mark as completed
    from app.models.finding import Finding
    if response.finding_id:
        finding = db.query(Finding).filter(
            Finding.id == response.finding_id,
            Finding.inspection_id == run.inspection_id,
        ).first()
        if finding:
            finding.notes = (finding.notes or "") + f"\n\nHuman response: {response.response}"
            db.commit()

    run.status = "completed"
    run.ended_at = datetime.utcnow()
    db.commit()

    from datetime import datetime
    return {"message": "Agent run resumed", "run_id": run_id, "status": "completed"}
