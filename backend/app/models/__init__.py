"""SQLAlchemy model imports for convenient access."""
from app.models.user import User, Organization, OrganizationMember
from app.models.equipment import Equipment, EquipmentReferenceImage
from app.models.inspection import (
    Inspection,
    InspectionInput,
    InspectionJob,
    InspectionFrame,
    VisionObservation,
)
from app.models.finding import Finding, FindingEvidence, AuditLog
from app.models.ticket import (
    MaintenanceTicket,
    MaintenanceTicketEvent,
    ApprovalRequest,
    RepairVerification,
)
from app.models.benchmark import BenchmarkRun

__all__ = [
    # Users & Org
    "User",
    "Organization",
    "OrganizationMember",
    # Equipment
    "Equipment",
    "EquipmentReferenceImage",
    # Inspections
    "Inspection",
    "InspectionInput",
    "InspectionJob",
    "InspectionFrame",
    "VisionObservation",
    # Findings
    "Finding",
    "FindingEvidence",
    "AuditLog",
    # Tickets
    "MaintenanceTicket",
    "MaintenanceTicketEvent",
    "ApprovalRequest",
    "RepairVerification",
    # Benchmarks
    "BenchmarkRun",
]
