"""Equipment endpoints: CRUD, reference images, status updates."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.core.dependencies import get_current_user, get_current_organization_id, get_db
from app.models.equipment import Equipment, EquipmentReferenceImage, EquipmentStatusEnum
from app.schemas.equipment import EquipmentCreate, EquipmentRead, EquipmentUpdate
from app.core.storage import StorageService
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


@router.get("/", response_model=list[EquipmentRead])
async def list_equipment(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    archived: bool = False,
    skip: int = 0,
    limit: int = 50,
):
    """List equipment for the current organization with optional filtering."""
    query = db.query(Equipment).filter(Equipment.organization_id == org_id)

    if not archived:
        query = query.filter(Equipment.is_archived.is_(False))

    if search:
        query = query.filter(
            (Equipment.name.ilike(f"%{search}%")) |
            (Equipment.category.ilike(f"%{search}%")) |
            (Equipment.location.ilike(f"%{search}%"))
        )

    if status_filter:
        query = query.filter(Equipment.status == status_filter)

    if category:
        query = query.filter(Equipment.category == category)

    return query.offset(skip).limit(limit).all()


@router.post("/", response_model=EquipmentRead, status_code=201)
async def create_equipment(
    data: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Create a new equipment record."""
    eq = Equipment(
        organization_id=org_id,
        name=data.name,
        category=data.category,
        location=data.location,
        description=data.description,
        manufacturer=data.manufacturer,
        model=data.model,
        serial_number=data.serial_number,
        installation_date=data.installation_date,
        inspection_schedule=data.inspection_schedule,
        assigned_inspector_id=data.assigned_inspector_id,
    )
    db.add(eq)
    db.commit()
    db.refresh(eq)
    return eq


@router.get("/{equipment_id}", response_model=EquipmentRead)
async def get_equipment(
    equipment_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Get a single equipment record by ID."""
    eq = db.query(Equipment).filter(
        Equipment.id == equipment_id,
        Equipment.organization_id == org_id,
    ).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return eq


@router.patch("/{equipment_id}", response_model=EquipmentRead)
async def update_equipment(
    equipment_id: str,
    data: EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Update equipment information."""
    eq = db.query(Equipment).filter(
        Equipment.id == equipment_id,
        Equipment.organization_id == org_id,
    ).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(eq, key, value)

    db.commit()
    db.refresh(eq)
    return eq


@router.delete("/{equipment_id}", status_code=204)
async def archive_equipment(
    equipment_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Archive (soft-delete) an equipment record."""
    eq = db.query(Equipment).filter(
        Equipment.id == equipment_id,
        Equipment.organization_id == org_id,
    ).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")
    eq.is_archived = True
    db.commit()
    return {"message": "Equipment archived"}


@router.post("/{equipment_id}/reference-image", status_code=201)
async def upload_reference_image(
    equipment_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Upload a reference image for alignment comparison."""
    eq = db.query(Equipment).filter(
        Equipment.id == equipment_id,
        Equipment.organization_id == org_id,
    ).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    valid, msg = StorageService.validate_image(file)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    rel_path = StorageService.save_image(file, subdir=f"reference/{equipment_id}")

    ref_img = EquipmentReferenceImage(
        equipment_id=eq.id,
        filename=file.filename,
        storage_path=rel_path,
    )
    db.add(ref_img)
    db.commit()
    db.refresh(ref_img)

    # Load and get image dimensions
    from PIL import Image
    full_path = StorageService.get_image_path(rel_path)
    if full_path:
        with Image.open(str(full_path)) as img:
            ref_img_ref = db.query(EquipmentReferenceImage).get(ref_img.id)
            # Store dims in metadata
            ref_img_ref.metadata_json = {"width": img.width, "height": img.height}
            db.commit()

    return {"message": "Reference image uploaded", "id": ref_img.id, "path": rel_path}


@router.get("/{equipment_id}/status", response_model=dict)
async def get_equipment_status(
    equipment_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Get real-time status of equipment including open findings count."""
    eq = db.query(Equipment).filter(
        Equipment.id == equipment_id,
        Equipment.organization_id == org_id,
    ).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    from app.models.finding import Finding

    open_findings = (
        db.query(Finding)
        .filter(
            Finding.equipment_id == eq.id,
            Finding.resolution_state.in_(["pending-review", "in-progress"]),
        )
        .count()
    )

    return {
        "id": eq.id,
        "name": eq.name,
        "status": eq.status.value,
        "open_findings": open_findings,
        "last_inspection": None,
        "next_inspection": eq.inspection_schedule,
    }
