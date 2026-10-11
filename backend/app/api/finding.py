"""Finding endpoints: list, review, update, evidence retrieval."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user, get_current_organization_id, get_db
from app.models.finding import Finding, FindingEvidence, FindingStatusEnum, SeverityEnum
from app.schemas.finding import FindingRead, FindingReview, FindingUpdate
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/findings", tags=["findings"])


@router.get("", response_model=list[FindingRead])
async def list_findings(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    equipment_id: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
):
    """List findings for the current organization with optional filtering."""
    query = db.query(Finding).filter(Finding.organization_id == org_id)

    if status:
        query = query.filter(Finding.resolution_state == status)
    if severity:
        query = query.filter(Finding.severity == severity)
    if equipment_id:
        query = query.filter(Finding.equipment_id == equipment_id)

    return query.offset(skip).limit(limit).all()


@router.get("/{finding_id}", response_model=FindingRead)
async def get_finding(
    finding_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Get a single finding with evidence."""
    f = db.query(Finding).filter(
        Finding.id == finding_id,
        Finding.organization_id == org_id,
    ).first()
    if not f:
        raise HTTPException(status_code=404, detail="Finding not found")
    return f


@router.patch("/{finding_id}", response_model=FindingRead)
async def update_finding(
    finding_id: str,
    data: FindingUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Update a finding (assign reviewer, change status, add notes)."""
    f = db.query(Finding).filter(
        Finding.id == finding_id,
        Finding.organization_id == org_id,
    ).first()
    if not f:
        raise HTTPException(status_code=404, detail="Finding not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(f, key, value)

    db.commit()
    db.refresh(f)
    return f


@router.post("/{finding_id}/review", response_model=FindingRead)
async def review_finding(
    finding_id: str,
    review: FindingReview,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Review a finding (confirm/reject) and optionally verify."""
    f = db.query(Finding).filter(
        Finding.id == finding_id,
        Finding.organization_id == org_id,
    ).first()
    if not f:
        raise HTTPException(status_code=404, detail="Finding not found")

    f.resolution_state = FindingStatusEnum(review.resolution_state)
    if review.notes:
        f.notes = review.notes
    if review.verified:
        f.verification_status = "verified"

    # Create audit log
    from app.models.finding import AuditLog
    log = AuditLog(
        organization_id=org_id,
        user_id=current_user.id,
        action="finding_review",
        resource_type="finding",
        resource_id=f.id,
        details_json={
            "resolution_state": review.resolution_state,
            "verified": review.verified,
        },
    )
    db.add(log)
    db.commit()
    db.refresh(f)
    return f


@router.get("/{finding_id}/evidence/{evidence_id}")
async def get_evidence_image(
    finding_id: str,
    evidence_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Retrieve an evidence image for a finding."""
    from fastapi.responses import FileResponse

    evidence = db.query(FindingEvidence).filter(
        FindingEvidence.id == evidence_id,
    ).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")

    # Verify finding belongs to this org
    f = db.query(Finding).filter(
        Finding.id == evidence.finding_id,
        Finding.organization_id == org_id,
    ).first()
    if not f:
        raise HTTPException(status_code=404, detail="Evidence not found")

    from app.core.storage import StorageService
    path = StorageService.get_image_path(evidence.storage_path)
    if path and path.exists():
        return FileResponse(str(path), media_type="image/png")
    raise HTTPException(status_code=404, detail="Evidence file not found on disk")
