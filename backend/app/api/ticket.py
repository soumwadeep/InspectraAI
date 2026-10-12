"""Maintenance ticket endpoints: list, create, update, events, approvals."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user, get_current_organization_id, get_db
from app.models.finding import Finding
from app.models.ticket import (
    MaintenanceTicket,
    MaintenanceTicketEvent,
    ApprovalRequest,
    RepairVerification,
    TICKET_TRANSITIONS,
    TicketStatusEnum,
    allowed_ticket_transitions,
)
from app.schemas.ticket import (
    MaintenanceTicketCreate,
    MaintenanceTicketRead,
    MaintenanceTicketUpdate,
    ApprovalDecision,
)
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


@router.get("", response_model=list[MaintenanceTicketRead])
async def list_tickets(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
    status: str | None = Query(None),
    priority: str | None = Query(None),
    skip: int = 0,
    limit: int = 100,
):
    """List maintenance tickets for the current organization."""
    query = db.query(MaintenanceTicket).filter(MaintenanceTicket.organization_id == org_id)
    if status:
        query = query.filter(MaintenanceTicket.status == status)
    if priority:
        query = query.filter(MaintenanceTicket.priority == priority)
    return query.offset(skip).limit(limit).all()


@router.post("", response_model=MaintenanceTicketRead, status_code=201)
async def create_ticket(
    data: MaintenanceTicketCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Create a new maintenance ticket from a finding."""
    # Verify finding belongs to this org
    f = db.query(Finding).filter(
        Finding.id == data.finding_id,
        Finding.organization_id == org_id,
    ).first()
    if not f:
        raise HTTPException(status_code=404, detail="Finding not found")

    # Verify equipment belongs to org
    from app.models.equipment import Equipment
    eq = db.query(Equipment).filter(
        Equipment.id == data.equipment_id,
        Equipment.organization_id == org_id,
    ).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    ticket = MaintenanceTicket(
        equipment_id=data.equipment_id,
        finding_id=data.finding_id,
        organization_id=org_id,
        priority=data.priority,
        description=data.description,
        status=TicketStatusEnum.awaiting_approval,
        due_date=data.due_date,
    )
    db.add(ticket)
    # The session is created with autoflush=False, so ticket.id is still None
    # until this flush — and both rows below have NOT NULL ticket_id.
    db.flush()

    # Create approval request
    approval = ApprovalRequest(
        ticket_id=ticket.id,
        finding_id=data.finding_id,
        requester_id=current_user.id,
        status="pending",
    )
    db.add(approval)

    # Log event
    event = MaintenanceTicketEvent(
        ticket_id=ticket.id,
        status=TicketStatusEnum.awaiting_approval,
        actor_id=current_user.id,
        notes="Ticket created and pending approval",
    )
    db.add(event)

    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("/{ticket_id}", response_model=dict)
async def get_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Get a single ticket with events and approval status."""
    ticket = db.query(MaintenanceTicket).filter(
        MaintenanceTicket.id == ticket_id,
        MaintenanceTicket.organization_id == org_id,
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    events = db.query(MaintenanceTicketEvent).filter(
        MaintenanceTicketEvent.ticket_id == ticket.id
    ).all()
    approvals = db.query(ApprovalRequest).filter(
        ApprovalRequest.ticket_id == ticket.id
    ).all()
    verifications = db.query(RepairVerification).filter(
        RepairVerification.ticket_id == ticket.id
    ).all()

    from app.schemas.ticket import (
        ApprovalRequestRead,
        RepairVerificationRead,
        TicketEventRead,
    )

    # `__dict__` on an ORM row carries `_sa_instance_state`, which pydantic refuses
    # to serialise, so this endpoint 500'd for any ticket with an event or approval.
    return {
        "ticket": MaintenanceTicketRead.model_validate(ticket),
        "events": [
            TicketEventRead.model_validate(e).model_dump(mode="json") for e in events
        ],
        "approvals": [
            ApprovalRequestRead.model_validate(a).model_dump(mode="json")
            for a in approvals
        ],
        "verifications": [
            RepairVerificationRead.model_validate(v).model_dump(mode="json")
            for v in verifications
        ],
    }


@router.patch("/{ticket_id}", response_model=MaintenanceTicketRead)
async def update_ticket(
    ticket_id: str,
    data: MaintenanceTicketUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Update a maintenance ticket status, priority, or assignment."""
    ticket = db.query(MaintenanceTicket).filter(
        MaintenanceTicket.id == ticket_id,
        MaintenanceTicket.organization_id == org_id,
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    old_status = ticket.status
    update_data = data.model_dump(exclude_unset=True)

    if "status" in update_data and update_data["status"] is not None:
        requested = TicketStatusEnum(update_data["status"])
        if requested != old_status:
            permitted = TICKET_TRANSITIONS.get(old_status, frozenset())
            if requested not in permitted:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Cannot move a ticket from {old_status.value} to "
                        f"{requested.value}. Allowed next: "
                        f"{allowed_ticket_transitions(old_status) or 'none — this state is final'}"
                    ),
                )
            update_data["status"] = requested

    for key, value in update_data.items():
        setattr(ticket, key, value)

    db.commit()

    # Log status change event
    if ticket.status != old_status:
        event = MaintenanceTicketEvent(
            ticket_id=ticket.id,
            status=ticket.status,
            actor_id=current_user.id,
            notes=f"Status changed from {old_status.value} to {ticket.status.value}",
        )
        db.add(event)
        db.commit()

    db.refresh(ticket)
    return ticket


@router.post("/{ticket_id}/approve", response_model=MaintenanceTicketRead)
async def approve_ticket(
    ticket_id: str,
    approval: ApprovalDecision,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Approve or reject a maintenance ticket."""
    from app.core.dependencies import require_role
    from app.models.user import RoleEnum

    # Only administrators can approve
    if current_user.role not in (RoleEnum.administrator,):
        raise HTTPException(status_code=403, detail="Only administrators can approve tickets")

    ticket = db.query(MaintenanceTicket).filter(
        MaintenanceTicket.id == ticket_id,
        MaintenanceTicket.organization_id == org_id,
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Update the approval request
    approval_req = db.query(ApprovalRequest).filter(
        ApprovalRequest.ticket_id == ticket.id
    ).order_by(ApprovalRequest.created_at.desc()).first()
    if not approval_req:
        raise HTTPException(status_code=404, detail="Approval request not found")

    approval_req.status = "approved" if approval.action == "approved" else "rejected"
    approval_req.approver_id = approval.approver_id
    approval_req.reason = approval.reason
    approval_req.resolved_at = datetime.utcnow()

    if approval.action == "approved":
        ticket.status = TicketStatusEnum.open
    else:
        ticket.status = TicketStatusEnum.draft

    event = MaintenanceTicketEvent(
        ticket_id=ticket.id,
        status=ticket.status,
        actor_id=approval.approver_id,
        notes=f"Ticket {approval.action}: {approval.reason or ''}",
    )
    db.add(event)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/{ticket_id}/verify", response_model=dict)
async def verify_repair(
    ticket_id: str,
    details: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Submit repair verification for a ticket."""
    ticket = db.query(MaintenanceTicket).filter(
        MaintenanceTicket.id == ticket_id,
        MaintenanceTicket.organization_id == org_id,
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    verification = RepairVerification(
        ticket_id=ticket.id,
        status="passed" if details.get("status") == "passed" else "failed",
        details_json=details,
        verifier_id=current_user.id,
    )
    db.add(verification)
    ticket.status = TicketStatusEnum.closed if details.get("status") == "passed" else TicketStatusEnum.reopened

    event = MaintenanceTicketEvent(
        ticket_id=ticket.id,
        status=ticket.status,
        actor_id=current_user.id,
        notes=f"Repair verification: {verification.status}",
    )
    db.add(event)
    db.commit()

    return {"message": "Verification recorded", "ticket_id": ticket.id, "status": ticket.status.value}


# Fix import for datetime
from datetime import datetime
