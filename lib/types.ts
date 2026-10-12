export type Severity = "critical" | "warning" | "info" | "success";

export type VerificationStatus = "unverified" | "verified" | "rejected";

export type TicketPriority = "low" | "medium" | "high" | "critical";

/**
 * Badge variants are looked up from tables keyed by the unions above. Declaring
 * those tables `Record<Union, BadgeVariant>` makes a missing case a compile
 * error instead of an `undefined` className at runtime.
 */
export type BadgeVariant =
  | "default"
  | "critical"
  | "warning"
  | "success"
  | "info"
  | "outline";

export type FindingStatus =
  | "pending-review"
  | "confirmed"
  | "rejected"
  | "needs-evidence"
  | "in-progress"
  | "resolved";

export type TicketStatus =
  | "draft"
  | "awaiting-approval"
  | "open"
  | "assigned"
  | "in-progress"
  | "awaiting-verification"
  | "closed"
  | "reopened";

export type EquipmentStatus = "operational" | "warning" | "critical" | "maintenance" | "offline";

export type QualityStatus = "sufficient" | "insufficient" | "processing" | "failed";

export type InspectionStatus =
  | "pending"
  | "processing"
  | "quality-check"
  | "analyzing"
  | "awaiting-evidence"
  | "finding"
  | "approval"
  | "ticket"
  | "completed"
  | "failed";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "administrator" | "inspector" | "maintenance-operator" | "viewer";
  avatar?: string;
  organizationId: string;
}

export interface ReferenceImage {
  id: string;
  filename: string;
  /** Path relative to the backend storage root, e.g. `uploads/reference/x.jpg`. */
  storagePath: string;
  /** Measured server-side on upload; lets overlays reserve aspect ratio first. */
  width?: number | null;
  height?: number | null;
  uploadedAt: string;
}

export interface Equipment {
  id: string;
  name: string;
  category: string;
  location: string;
  description: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: string;
  inspectionSchedule: string;
  assignedInspector: string;
  status: EquipmentStatus;
  openFindings: number;
  /**
   * Summary from `GET /api/equipment/{id}/status`. The equipment read schema
   * always returns null here, so the detail page fetches the status endpoint
   * when it needs the real last inspection.
   */
  lastInspection?: Record<string, unknown>;
  referenceImages?: ReferenceImage[];
}

export interface QualityMetrics {
  blurScore: number;
  exposureScore: number;
  glareEstimate: number;
  imageCoverage: number;
  alignmentConfidence: number;
  inspectionSuitability: "sufficient" | "insufficient";
  reasons: string[];
}

export interface Finding {
  id: string;
  equipmentId: string;
  inspectionId: string;
  category: string;
  description: string;
  evidenceImages: string[];
  detectionMethod: string;
  confidence?: number;
  severity: Severity;
  verificationStatus: VerificationStatus;
  createdAt: string;
  assignedReviewer?: string;
  resolutionState: FindingStatus;
  notes?: string;
  isNew?: boolean;
}

export interface MaintenanceTicket {
  id: string;
  equipmentId: string;
  findingId: string;
  priority: TicketPriority;
  description: string;
  assignedOperator?: string;
  status: TicketStatus;
  dueDate?: string;
  evidence: string[];
  approvalHistory: ApprovalRecord[];
  completionNotes?: string;
  repairVerification?: "pending" | "passed" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  id: string;
  action: "approved" | "rejected";
  approverId: string;
  timestamp: string;
  reason?: string;
}

export interface Inspection {
  id: string;
  equipmentId: string;
  organizationId: string;
  inspectorId: string;
  startTime: string;
  endTime?: string;
  status: InspectionStatus;
  findings: string[];
  /** Wall-clock milliseconds of the run, measured server-side. */
  duration?: number;
  agentRunId?: string;
}

export interface AgentStep {
  id: string;
  step: number;
  tool: string;
  action: "started" | "completed" | "failed";
  description: string;
  arguments?: Record<string, unknown>;
  resultSummary?: string;
  evidenceRef?: string;
  decision?: string;
  reason?: string;
  timestamp: string;
  duration?: number;
  isHumanInteraction?: boolean;
}

export interface AgentToolCall {
  id: string;
  stepId?: string;
  tool: string;
  arguments?: Record<string, unknown>;
  resultSummary?: string;
  resultJson?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  success: boolean;
}

export interface AgentRun {
  id: string;
  inspectionId: string;
  equipmentName?: string;
  status: "running" | "completed" | "failed" | "paused";
  steps: AgentStep[];
  toolCalls: AgentToolCall[];
  startTime: string;
  endTime?: string;
  iterations: number;
  budgetUsed: number;
  finalAction?: string;
  toolCount: number;
  /**
   * What the planner recorded when the run stopped: planner id, final state,
   * end_reached, alignment attempts, findings created, timeout, awaiting query,
   * recommendations and any video sampling summary. Absent until the detail
   * adapter forwards it, in which case the UI says "not returned" rather than
   * guessing.
   */
  finalOutcome?: Record<string, unknown> | null;
}

export interface BenchmarkRun {
  id: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  createdAt: string;
  durationMs: number;
}

export interface MetricData {
  name: string;
  value: number;
  change: string;
  trend: "up" | "down" | "neutral";
}