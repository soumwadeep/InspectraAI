"""SQLAlchemy model imports for convenient access.

Every model must be imported here so that ``Base.metadata`` is complete before
migrations or tests inspect it — an unregistered model simply has no table.
"""
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
    RepairEvidence,
    RepairVerification,
)
from app.models.agent import AgentRun, AgentStep, AgentToolCall
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
    "RepairEvidence",
    "RepairVerification",
    # Agent
    "AgentRun",
    "AgentStep",
    "AgentToolCall",
    # Benchmarks
    "BenchmarkRun",
]
