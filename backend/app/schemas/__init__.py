"""Pydantic schema exports."""
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    TokenPayload,
    UserRead,
    UserUpdate,
)
from app.schemas.equipment import (
    EquipmentCreate,
    EquipmentRead,
    EquipmentReferenceImageRead,
    EquipmentUpdate,
)
from app.schemas.inspection import (
    InspectionCreate,
    InspectionRead,
    InspectionResponse,
    InspectionStartRequest,
    QualityMetricsSchema,
    VisionObservationRead,
)
from app.schemas.finding import (
    FindingCreate,
    FindingEvidenceRead,
    FindingRead,
    FindingReview,
    FindingUpdate,
)
from app.schemas.ticket import (
    ApprovalDecision,
    MaintenanceTicketCreate,
    MaintenanceTicketRead,
    MaintenanceTicketUpdate,
    RepairVerificationRead,
)
from app.schemas.agent import (
    AgentRunRead,
    AgentRunStatusEnum,
    AgentStepRead,
    AgentToolCallRead,
    HumanResponse,
)
from app.schemas.benchmark import (
    BenchmarkRunRead,
    BenchmarkRunSchema,
)
from app.schemas.analytics import (
    AnalyticsOverview,
    FindingsTrend,
    InspectionsTrend,
)

__all__ = [
    # Auth
    "LoginRequest", "LoginResponse", "RegisterRequest", "TokenPayload",
    "UserRead", "UserUpdate",
    # Equipment
    "EquipmentCreate", "EquipmentRead", "EquipmentUpdate",
    "EquipmentReferenceImageRead",
    # Inspection
    "InspectionCreate", "InspectionRead", "InspectionResponse",
    "InspectionStartRequest", "QualityMetricsSchema", "VisionObservationRead",
    # Finding
    "FindingCreate", "FindingEvidenceRead", "FindingRead",
    "FindingReview", "FindingUpdate",
    # Ticket
    "ApprovalDecision", "MaintenanceTicketCreate", "MaintenanceTicketRead",
    "MaintenanceTicketUpdate", "RepairVerificationRead",
    # Agent
    "AgentRunRead", "AgentRunStatusEnum", "AgentStepRead",
    "AgentToolCallRead", "HumanResponse",
    # Benchmark
    "BenchmarkRunRead", "BenchmarkRunSchema",
    # Analytics
    "AnalyticsOverview", "FindingsTrend", "InspectionsTrend",
]
