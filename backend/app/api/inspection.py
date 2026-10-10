"""Inspection endpoints: create, list, start, get details, upload inputs."""
from __future__ import annotations

import os
import time

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.dependencies import get_current_user, get_current_organization_id, get_db
from app.core.storage import StorageService
from app.models.equipment import Equipment
from app.models.inspection import (
    Inspection,
    InspectionInput,
    InspectionJob,
    InspectionStatusEnum,
)
from app.schemas.inspection import (
    InspectionCreate,
    InspectionRead,
    InspectionResponse,
    InspectionStartRequest,
)
from app.agent.workflow import VisionAgent
from app.agent.tools import VisionTools
from app.vision.engine import VisionEngine

from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/inspections", tags=["inspections"])


@router.get("/", response_model=list[InspectionRead])
async def list_inspections(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
    status: str | None = None,
    skip: int = 0,
    limit: int = 50,
):
    """List inspections for the current organization."""
    query = db.query(Inspection).filter(Inspection.organization_id == org_id)
    if status:
        query = query.filter(Inspection.status == status)
    return query.offset(skip).limit(limit).all()


@router.post("/", response_model=InspectionRead, status_code=201)
async def create_inspection(
    data: InspectionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Create a new inspection record (pending status)."""
    eq = db.query(Equipment).filter(
        Equipment.id == data.equipment_id,
        Equipment.organization_id == org_id,
    ).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    inspection = Inspection(
        equipment_id=eq.id,
        organization_id=org_id,
        inspector_id=data.inspector_id or current_user.id,
        status=InspectionStatusEnum.pending,
    )
    db.add(inspection)
    db.commit()
    db.refresh(inspection)
    return inspection


@router.post("/{inspection_id}/upload", response_model=dict)
async def upload_inspection_input(
    inspection_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Upload an image or video input for an inspection."""
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == org_id,
    ).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext in [".jpg", ".jpeg", ".png", ".webp"]:
        input_type = "image"
        valid, msg = StorageService.validate_image(file)
        if not valid:
            raise HTTPException(status_code=400, detail=msg)
    elif ext in [".mp4", ".webm", ".avi", ".mov"]:
        input_type = "video"
        valid, msg = StorageService.validate_video(file)
        if not valid:
            raise HTTPException(status_code=400, detail=msg)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    rel_path = StorageService.save_image(file, subdir=f"inspections/{inspection_id}")

    inspection_input = InspectionInput(
        inspection_id=inspection.id,
        input_type=input_type,
        filename=file.filename,
        storage_path=rel_path,
        file_size_bytes=os.path.getsize(
            str(StorageService.UPLOAD_DIR / rel_path.replace(str(StorageService.UPLOAD_DIR) + "/", ""))
            if rel_path.startswith("storage") else StorageService.UPLOAD_DIR.parent / rel_path
        ),
        metadata_json={},
    )
    db.add(inspection_input)
    db.commit()
    db.refresh(inspection_input)

    return {
        "message": "File uploaded successfully",
        "input_id": inspection_input.id,
        "path": rel_path,
        "type": input_type,
    }


@router.post("/{inspection_id}/run", response_model=InspectionResponse)
async def run_inspection(
    inspection_id: str,
    request: InspectionStartRequest | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """
    Run the vision agent on an inspection.

    Executes the full pipeline: quality analysis, alignment, change detection,
    evidence generation, finding creation, and ticket creation if needed.
    """
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == org_id,
    ).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    # Get inspection inputs
    inputs = db.query(InspectionInput).filter(
        InspectionInput.inspection_id == inspection_id
    ).all()
    if not inputs:
        raise HTTPException(status_code=400, detail="No input images uploaded for this inspection")

    # Get reference image
    from app.models.equipment import EquipmentReferenceImage
    ref_img = db.query(EquipmentReferenceImage).filter(
        EquipmentReferenceImage.equipment_id == inspection.equipment_id
    ).first()

    if not ref_img:
        raise HTTPException(
            status_code=400,
            detail="No reference image for this equipment. Upload one first."
        )

    # Initialize engine and agent
    engine = VisionEngine()
    tools = VisionTools(engine)
    agent = VisionAgent(db, tools)

    # Resolve paths
    ref_path = str(StorageService.UPLOAD_DIR.parent / ref_img.storage_path)
    input_path = str(StorageService.UPLOAD_DIR.parent / inputs[0].storage_path)

    if not os.path.exists(ref_path) or not os.path.exists(input_path):
        raise HTTPException(status_code=400, detail="Image files not found on disk")

    # Create agent run
    ctx = agent.create_run(
        inspection_id=inspection.id,
        organization_id=org_id,
        equipment_id=inspection.equipment_id,
        reference_image_path=ref_path,
        input_image_path=input_path,
    )

    # Update inspection status
    inspection.status = InspectionStatusEnum.processing
    db.commit()

    # Run the agent
    ctx = agent.run(ctx)

    # Fetch final status
    run_status = agent.get_run_status(ctx.run_id)

    # Update inspection status
    from app.agent.state_machine import AgentState
    if ctx.current_state == AgentState.END:
        inspection.status = InspectionStatusEnum.completed
    else:
        inspection.status = InspectionStatusEnum.failed
    inspection.agent_run_id = ctx.run_id
    inspection.ended_at = ctx.step_log[-1] if ctx.step_log else None
    db.commit()

    return InspectionResponse(
        inspection=InspectionRead.model_validate(inspection),
        message=f"Inspection {ctx.current_state.value}. {len(ctx.findings)} findings created.",
    )


@router.get("/{inspection_id}", response_model=dict)
async def get_inspection(
    inspection_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Get a single inspection with findings and observations."""
    from app.models.finding import Finding
    from app.models.inspection import VisionObservation
    from app.models.agent import AgentRun, AgentStep, AgentToolCall

    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == org_id,
    ).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    findings = (
        db.query(Finding)
        .filter(Finding.inspection_id == inspection_id)
        .all()
    )

    observations = (
        db.query(VisionObservation)
        .filter(VisionObservation.inspection_id == inspection_id)
        .all()
    )

    run_info = None
    if inspection.agent_run_id:
        run = db.query(AgentRun).get(inspection.agent_run_id)
        steps = db.query(AgentStep).filter(AgentStep.run_id == inspection.agent_run_id).all()
        tool_calls = db.query(AgentToolCall).filter(AgentToolCall.run_id == inspection.agent_run_id).all()
        run_info = {
            "status": run.status if run else None,
            "iterations": run.iterations if run else 0,
            "budget_used": run.budget_used if run else 0,
            "final_action": run.final_action if run else None,
            "steps": [
                {
                    "step_number": s.step_number,
                    "action": s.action_type,
                    "tool": s.tool_name,
                    "description": s.description,
                    "result": s.result_summary,
                    "duration_ms": s.duration_ms,
                }
                for s in steps
            ],
            "tool_calls": [
                {
                    "tool_name": tc.tool_name,
                    "duration_ms": tc.duration_ms,
                    "success": tc.success,
                }
                for tc in tool_calls
            ],
        }

    return {
        "inspection": InspectionRead.model_validate(inspection),
        "findings": [f.__dict__ for f in findings],
        "observations": [o.__dict__ for o in observations],
        "agent_run": run_info,
    }


@router.get("/{inspection_id}/input/{input_id}/preview")
async def get_input_preview(
    inspection_id: str,
    input_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Get a thumbnail preview of an inspection input image."""
    inp = db.query(InspectionInput).filter(
        InspectionInput.id == input_id,
    ).first()
    if not inp:
        raise HTTPException(status_code=404, detail="Input not found")

    img_bytes = StorageService.read_image_as_bytes(inp.storage_path)
    if not img_bytes:
        raise HTTPException(status_code=404, detail="Image not found on disk")

    # Generate thumbnail
    import io
    from PIL import Image
    from fastapi.responses import StreamingResponse

    try:
        img = Image.open(io.BytesIO(img_bytes))
        img.thumbnail((512, 512))
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        return StreamingResponse(buffer, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
