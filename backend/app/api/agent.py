"""Agent run endpoints: list, get detail, resume human input, status."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user, get_current_organization_id, get_db
from app.core.storage import StorageService
from app.models.agent import AgentRun, AgentStep, AgentToolCall
from app.models.equipment import EquipmentReferenceImage
from app.models.inspection import Inspection, InspectionInput
from app.schemas.agent import (
    AgentRunRead,
    AgentStepRead,
    AgentToolCallRead,
    HumanResponse,
)
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

    run_ids = [run.id for run in runs]
    if not run_ids:
        return []

    # Batched loads. The original loop issued four queries per run — inspection,
    # steps, tool calls and equipment — so a 50-run page cost 200 round trips.
    inspections_by_run = {
        inspection.agent_run_id: inspection
        for inspection in db.query(Inspection).filter(
            Inspection.agent_run_id.in_(run_ids)
        )
    }
    steps_by_run: dict[str, list] = {}
    for step in db.query(AgentStep).filter(AgentStep.run_id.in_(run_ids)).order_by(
        AgentStep.step_number.asc()
    ):
        steps_by_run.setdefault(step.run_id, []).append(step)
    calls_by_run: dict[str, list] = {}
    for call in db.query(AgentToolCall).filter(AgentToolCall.run_id.in_(run_ids)):
        calls_by_run.setdefault(call.run_id, []).append(call)

    equipment_ids = {
        inspection.equipment_id
        for inspection in inspections_by_run.values()
        if inspection
    }
    from app.models.equipment import Equipment

    names_by_equipment = {
        equipment.id: equipment.name
        for equipment in db.query(Equipment).filter(Equipment.id.in_(equipment_ids))
    } if equipment_ids else {}

    result = []
    for run in runs:
        inspection = inspections_by_run.get(run.id)
        steps = steps_by_run.get(run.id, [])
        tool_calls = calls_by_run.get(run.id, [])
        eq_name = (
            names_by_equipment.get(inspection.equipment_id, "Unknown")
            if inspection
            else "Unknown"
        )

        result.append({
            "id": run.id,
            "equipment": eq_name,
            "inspection_id": run.inspection_id,
            "status": run.status,
            "iterations": run.iterations,
            "budget_used": run.budget_used,
            "final_action": run.final_action,
            # The console's outcome panel reads this, so a list row alone can fill
            # the pane before the detail request lands.
            "final_outcome": run.final_outcome,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "ended_at": run.ended_at.isoformat() if run.ended_at else None,
            # `__dict__` carries SQLAlchemy's `_sa_instance_state`, which pydantic
            # cannot serialise — the run list 500'd as soon as a run had steps.
            "steps": [
                AgentStepRead.model_validate(s).model_dump(mode="json") for s in steps
            ],
            "tool_calls": [
                AgentToolCallRead.model_validate(tc).model_dump(mode="json")
                for tc in tool_calls
            ],
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
    """Continue a paused agent run from its persisted context.

    This endpoint used to append text to a finding and mark the run completed
    without executing anything — it recorded a continuation that never happened.
    It also raised UnboundLocalError on every call, because a local
    `from datetime import datetime` below the point where `datetime` was used.
    """
    run = db.query(AgentRun).filter(AgentRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found")

    inspection = db.query(Inspection).filter(Inspection.agent_run_id == run_id).first()
    if not inspection or inspection.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if run.status != "paused":
        raise HTTPException(status_code=400, detail=f"Run is {run.status}, not paused")

    inputs = (
        db.query(InspectionInput)
        .filter(InspectionInput.inspection_id == inspection.id)
        .order_by(InspectionInput.uploaded_at.desc())
        .all()
    )
    if not inputs:
        raise HTTPException(status_code=400, detail="Inspection has no input to resume from")

    resolved = StorageService.get_image_path(inputs[0].storage_path)
    reference = db.query(EquipmentReferenceImage).filter(
        EquipmentReferenceImage.equipment_id == inspection.equipment_id
    ).first()
    reference_resolved = StorageService.get_image_path(reference.storage_path) if reference else None

    if resolved is None or reference_resolved is None:
        raise HTTPException(status_code=400, detail="Reference or capture file missing from storage")

    from app.agent.tools import VisionTools
    from app.agent.workflow import VisionAgent
    from app.vision.engine import VisionEngine

    agent = VisionAgent(db, VisionTools(VisionEngine()))

    try:
        status = agent.resume(run_id, response.response)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    db.refresh(inspection)
    from app.agent.state_machine import AgentState
    from app.services.inspection_run import inspection_status_for

    run_state = AgentState(status["run"]["final_outcome"].get("final_state", "failed"))
    inspection.status = inspection_status_for(run_state)
    inspection.ended_at = None if run_state is AgentState.HUMAN_WAIT else datetime.utcnow()
    db.commit()

    return {
        "message": "Agent run continued",
        "run_id": run_id,
        "status": status["run"]["status"],
        "response": response.response,
    }
