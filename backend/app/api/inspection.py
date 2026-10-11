"""Inspection endpoints: create, list, start, get details, upload inputs."""
from __future__ import annotations

import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.config import settings
from app.core.dependencies import get_current_user, get_current_organization_id, get_db
from app.core.storage import MAX_FILE_SIZE_BYTES, StorageService
from app.models.equipment import Equipment
from app.models.inspection import (
    Inspection,
    InspectionInput,
    InspectionStatusEnum,
)
from app.schemas.finding import FindingRead
from app.schemas.inspection import (
    InspectionCreate,
    InspectionRead,
    InspectionResponse,
    InspectionStartRequest,
)
from app.services.inspection_run import (
    InspectionRunError,
    execute_inspection_run,
    resolve_run_inputs,
)

from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/inspections", tags=["inspections"])


@router.get("", response_model=list[InspectionRead])
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


@router.post("", response_model=InspectionRead, status_code=201)
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

    # MAX_FILE_SIZE_BYTES was defined in app.core.storage and never enforced;
    # only the extension was checked, so arbitrarily large uploads were accepted.
    if file.size and file.size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File is {file.size / (1024 * 1024):.1f} MB; "
                f"the limit is {settings.max_upload_mb} MB"
            ),
        )

    rel_path = StorageService.save_image(file, subdir=f"inspections/{inspection_id}")

    # StorageService has no UPLOAD_DIR attribute (it is a module-level constant),
    # so this line raised AttributeError and every upload returned a 500 that the
    # browser reported as "Failed to fetch". get_image_path() already resolves the
    # stored relative path against the storage root.
    stored = StorageService.get_image_path(rel_path)
    if stored is None:
        raise HTTPException(
            status_code=500,
            detail="Upload was accepted but is not readable from storage",
        )

    inspection_input = InspectionInput(
        inspection_id=inspection.id,
        input_type=input_type,
        filename=file.filename,
        storage_path=rel_path,
        file_size_bytes=stored.stat().st_size,
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

    try:
        inputs = resolve_run_inputs(db, inspection)
    except InspectionRunError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    ctx, failure = execute_inspection_run(
        db, inspection=inspection, org_id=org_id, user_id=current_user.id, inputs=inputs
    )

    if failure:
        raise HTTPException(status_code=500, detail=f"Agent run failed: {failure}")

    return InspectionResponse(
        inspection=InspectionRead.model_validate(inspection),
        message=(
            f"Inspection {ctx.current_state.value}. {len(ctx.findings)} finding(s) created"
            f" across {ctx.iterations} tool calls."
        ),
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
        # `obj.__dict__` carries SQLAlchemy's `_sa_instance_state`, which pydantic
        # refuses to serialise — the endpoint 500'd as soon as a finding existed.
        "findings": [FindingRead.model_validate(f).model_dump(mode="json") for f in findings],
        "observations": [
            {
                "id": o.id,
                "inspection_id": o.inspection_id,
                "agent_run_id": o.agent_run_id,
                "observation_type": o.observation_type,
                "bbox_x": o.bbox_x,
                "bbox_y": o.bbox_y,
                "bbox_width": o.bbox_width,
                "bbox_height": o.bbox_height,
                "confidence": o.confidence,
                "category": o.category,
                "description": o.description,
                "details_json": o.details_json,
                "evidence_image_path": o.evidence_image_path,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
            for o in observations
        ],
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
