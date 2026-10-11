"""Inspection run orchestration, shared by the API and the CLI seed script.

This logic lived inline in `POST /api/inspections/{id}/run`. A seeding script
needed the same behaviour, and copying it would have produced demo data through a
different code path than the one the product actually runs — which is precisely
the sort of divergence that makes a demo numbers-look-right-but-mean-nothing.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.agent.state_machine import AgentState, WorkflowContext
from app.agent.tools import VisionTools
from app.agent.workflow import PLANNER_ID, VisionAgent
from app.core.storage import StorageService
from app.models.equipment import EquipmentReferenceImage
from app.models.inspection import (
    Inspection,
    InspectionInput,
    InspectionJob,
    InspectionStatusEnum,
)
from app.vision.engine import VisionEngine


class InspectionRunError(Exception):
    """The inspection cannot be run; carries the reason shown to the caller."""


@dataclass
class RunInputs:
    reference_path: str
    input_path: str
    input_type: str
    input_id: str


def resolve_run_inputs(db: Session, inspection: Inspection) -> RunInputs:
    """Locate the reference image and the capture the run will measure."""
    ref_img = (
        db.query(EquipmentReferenceImage)
        .filter(EquipmentReferenceImage.equipment_id == inspection.equipment_id)
        .first()
    )
    if not ref_img:
        raise InspectionRunError(
            "No reference image for this equipment. Upload one first."
        )

    # The most recent capture wins: after a retake request the rejected image must
    # not be the one measured again.
    inputs = (
        db.query(InspectionInput)
        .filter(InspectionInput.inspection_id == inspection.id)
        .order_by(InspectionInput.uploaded_at.desc())
        .all()
    )
    if not inputs:
        raise InspectionRunError("No input images uploaded for this inspection")

    ref_resolved = StorageService.get_image_path(ref_img.storage_path)
    input_resolved = StorageService.get_image_path(inputs[0].storage_path)
    if ref_resolved is None or input_resolved is None:
        raise InspectionRunError("Image files not found on disk")

    return RunInputs(
        reference_path=str(ref_resolved),
        input_path=str(input_resolved),
        input_type=inputs[0].input_type,
        input_id=inputs[0].id,
    )


def inspection_status_for(state: AgentState) -> InspectionStatusEnum:
    """Map agent state onto the inspection enum.

    `AgentState.HUMAN_WAIT` has no enum twin, so it becomes awaiting_evidence —
    the run really is waiting for another capture, and reporting `completed` or
    `failed` here would misrepresent a pause as an outcome.
    """
    mapping = {
        AgentState.ANALYSIS: InspectionStatusEnum.quality_check,
        AgentState.DETECTION: InspectionStatusEnum.analyzing,
        AgentState.FINDING: InspectionStatusEnum.finding,
        AgentState.EVIDENCE: InspectionStatusEnum.awaiting_evidence,
        AgentState.APPROVAL: InspectionStatusEnum.approval,
        AgentState.HUMAN_WAIT: InspectionStatusEnum.awaiting_evidence,
        AgentState.REPORTING: InspectionStatusEnum.completed,
        AgentState.END: InspectionStatusEnum.completed,
        AgentState.FAILED: InspectionStatusEnum.failed,
    }
    return mapping.get(state, InspectionStatusEnum.processing)


def execute_inspection_run(
    db: Session,
    *,
    inspection: Inspection,
    org_id: str,
    user_id: str,
    inputs: RunInputs,
) -> tuple[WorkflowContext, str | None]:
    """Run the agent to completion (or pause) and persist the outcome.

    Returns the context plus a failure string when the loop raised. Callers decide
    how to present that — an endpoint as a 500, a script as a nonzero exit.
    """
    agent = VisionAgent(db, VisionTools(VisionEngine()))

    job = InspectionJob(
        inspection_id=inspection.id,
        status="running",
        result_json={"started_by": user_id, "input_id": inputs.input_id},
        started_at=datetime.utcnow(),
    )
    db.add(job)
    inspection.status = InspectionStatusEnum.processing
    db.commit()

    ctx = agent.create_run(
        inspection_id=inspection.id,
        organization_id=org_id,
        equipment_id=inspection.equipment_id,
        reference_image_path=inputs.reference_path,
        input_image_path=inputs.input_path,
        requesting_user_id=user_id,
    )

    started_at = datetime.utcnow()
    failure: str | None = None
    if inputs.input_type == "video":
        # Sampled before the loop so the agent analyses decoded pixels; the frame
        # rows and their measurements are persisted for the temporal view.
        agent.sample_input_video(ctx, inputs.input_path)
    try:
        ctx = agent.run(ctx)
    except Exception as error:  # the run persists its own trace before re-raising
        failure = f"{type(error).__name__}: {error}"

    elapsed_ms = int((datetime.utcnow() - started_at).total_seconds() * 1000)

    inspection.agent_run_id = ctx.run_id
    inspection.duration_ms = elapsed_ms
    # step_log entries are dicts; assigning one to a DateTime column failed.
    inspection.ended_at = (
        None if ctx.current_state is AgentState.HUMAN_WAIT else datetime.utcnow()
    )
    inspection.status = inspection_status_for(ctx.current_state)

    job.status = (
        "completed" if ctx.current_state is AgentState.END else inspection.status.value
    )
    job.result_json = {
        "final_state": ctx.current_state.value,
        "iterations": ctx.iterations,
        "budget_used": ctx.budget_used,
        "findings": len(ctx.findings),
        "duration_ms": elapsed_ms,
        "planner": PLANNER_ID,
        "error": failure or ctx.final_decision,
    }
    job.completed_at = datetime.utcnow()
    db.commit()

    return ctx, failure
