import {
  Equipment,
  Finding,
  Inspection,
  AgentStep,
  AgentRun,
  AgentToolCall,
  MaintenanceTicket,
  ApprovalRecord,
  BenchmarkRun,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------- Token storage ----------

const TOKEN_KEY = "inspectra_access_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

// ---------- Typed API responses (snake_case from backend) ----------

export interface AnalyticsOverview {
  total_equipment: number;
  total_inspections: number;
  pending_review: number;
  confirmed_findings: number;
  open_tickets: number;
  completed_tickets: number;
  avg_processing_ms: number;
  inspection_activity_trend: Array<{ date: string; count: number }>;
  finding_categories: Record<string, number>;
  equipment_status: Record<string, number>;
  priority_findings: Array<Record<string, unknown>>;
  agent_activity_feed: Array<Record<string, unknown>>;
  system_health: Record<string, unknown>;
}

interface BackendUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organization_id: string;
  is_active: boolean;
  created_at: string;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
  user: BackendUser;
}

interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  organization_name: string;
}

interface BackendEquipment {
  id: string;
  name: string;
  category: string;
  location: string;
  description?: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  installation_date?: string;
  inspection_schedule?: string;
  assigned_inspector_id?: string;
  organization_id: string;
  status: string;
  is_archived: boolean;
  open_findings: number;
  last_inspection?: string;
  created_at: string;
  updated_at: string;
}

interface BackendFinding {
  id: string;
  equipment_id: string;
  inspection_id: string;
  organization_id: string;
  category: string;
  description: string;
  detection_method: string;
  confidence?: number;
  severity: string;
  verification_status: string;
  resolution_state: string;
  assigned_reviewer_id?: string;
  notes?: string;
  evidence: Array<{
    id: string;
    finding_id: string;
    evidence_type: string;
    storage_path: string;
    caption?: string;
    metadata_json: Record<string, unknown>;
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
}

interface BackendTicket {
  id: string;
  equipment_id: string;
  finding_id: string;
  organization_id: string;
  priority: string;
  description: string;
  assigned_operator_id?: string;
  status: string;
  due_date?: string;
  completion_notes?: string;
  created_at: string;
  updated_at: string;
}

interface BackendAgentStep {
  id?: string;
  step_number: number;
  action_type: string;
  tool_name?: string | null;
  description: string;
  arguments?: Record<string, unknown>;
  result_summary?: string | null;
  evidence_ref?: string | null;
  decision?: string | null;
  reason?: string | null;
  timestamp: string;
  duration_ms?: number;
  is_human_interaction?: boolean;
}

interface BackendAgentToolCall {
  id: string;
  step_id?: string | null;
  tool_name: string;
  arguments?: Record<string, unknown>;
  result_summary?: string | null;
  result_json?: Record<string, unknown>;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number;
  success?: boolean;
}

interface BackendAgentRun {
  id: string;
  equipment?: string;
  inspection_id: string;
  status: string;
  iterations: number;
  budget_used: number;
  final_action?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  steps?: BackendAgentStep[];
  tool_calls?: BackendAgentToolCall[];
}

interface BackendAgentRunDetail {
  run: {
    id: string;
    inspection_id: string;
    status: string;
    started_at?: string | null;
    ended_at?: string | null;
    iterations: number;
    budget_used: number;
    final_action?: string | null;
    final_outcome?: Record<string, unknown>;
  };
  steps: BackendAgentStep[];
  tool_calls: BackendAgentToolCall[];
}

interface BackendBenchmarkRun {
  id: string;
  organization_id?: string | null;
  name: string;
  description?: string | null;
  config_json: Record<string, unknown>;
  results_json: Record<string, unknown>;
  created_at: string;
  duration_ms: number;
}

// ---------- Adapters (snake_case -> camelCase) ----------

function toCamelCase(str: string): string {
  return str.replace(/_[a-z]/g, (letter) => letter.slice(1).toUpperCase());
}

/** Deeply convert snake_case keys to camelCase. */
function toCamel<T>(obj: unknown): T {
  if (obj === null || typeof obj !== "object") return obj as T;
  if (Array.isArray(obj)) return obj.map(toCamel) as unknown as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[toCamelCase(key)] = toCamel(value);
  }
  return result as T;
}

export function adaptEquipment(eq: BackendEquipment): Equipment {
  return {
    id: eq.id,
    name: eq.name,
    category: eq.category,
    location: eq.location,
    description: eq.description ?? "",
    manufacturer: eq.manufacturer,
    model: eq.model,
    serialNumber: eq.serial_number,
    installationDate: eq.installation_date,
    inspectionSchedule: eq.inspection_schedule ?? "Monthly",
    assignedInspector: "",
    status: eq.status as Equipment["status"],
    openFindings: eq.open_findings,
    lastInspection: eq.last_inspection,
    referenceImages: [],
  };
}

export function adaptFinding(f: BackendFinding): Finding {
  return {
    id: f.id,
    equipmentId: f.equipment_id,
    inspectionId: f.inspection_id,
    category: f.category,
    description: f.description,
    evidenceImages: f.evidence.map((e) => e.storage_path),
    detectionMethod: f.detection_method,
    confidence: f.confidence,
    severity: f.severity as Finding["severity"],
    verificationStatus: f.verification_status as Finding["verificationStatus"],
    createdAt: f.created_at,
    assignedReviewer: f.assigned_reviewer_id,
    resolutionState: f.resolution_state as Finding["resolutionState"],
    notes: f.notes,
    isNew: false,
  };
}

export function adaptTicket(t: BackendTicket & { approval_history?: ApprovalRecord[]; events?: unknown[] }): MaintenanceTicket {
  return {
    id: t.id,
    equipmentId: t.equipment_id,
    findingId: t.finding_id,
    priority: t.priority as MaintenanceTicket["priority"],
    description: t.description,
    assignedOperator: t.assigned_operator_id,
    status: t.status as MaintenanceTicket["status"],
    dueDate: t.due_date,
    evidence: [],
    approvalHistory: t.approval_history ?? [],
    completionNotes: t.completion_notes,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

export function adaptAgentStep(s: BackendAgentStep): AgentStep {
  return {
    id: s.id ?? crypto.randomUUID(),
    step: s.step_number,
    tool: s.tool_name ?? "unknown",
    action: (s.action_type ?? "completed") as AgentStep["action"],
    description: s.description,
    arguments: s.arguments,
    resultSummary: s.result_summary ?? undefined,
    evidenceRef: s.evidence_ref ?? undefined,
    decision: s.decision ?? undefined,
    reason: s.reason ?? undefined,
    timestamp: s.timestamp,
    duration: s.duration_ms,
    isHumanInteraction: s.is_human_interaction,
  };
}

export function adaptAgentToolCall(tc: BackendAgentToolCall): AgentToolCall {
  return {
    id: tc.id,
    stepId: tc.step_id ?? undefined,
    tool: tc.tool_name,
    arguments: tc.arguments,
    resultSummary: tc.result_summary ?? undefined,
    resultJson: tc.result_json ?? undefined,
    startedAt: tc.started_at ?? "",
    completedAt: tc.completed_at ?? undefined,
    duration: tc.duration_ms,
    success: tc.success ?? true,
  };
}

export function adaptAgentRun(r: BackendAgentRun): AgentRun {
  return {
    id: r.id,
    inspectionId: r.inspection_id,
    equipmentName: r.equipment ?? undefined,
    status: (r.status ?? "completed") as AgentRun["status"],
    iterations: r.iterations,
    budgetUsed: r.budget_used,
    finalAction: r.final_action ?? undefined,
    startTime: r.started_at ?? "",
    endTime: r.ended_at ?? undefined,
    steps: (r.steps ?? []).map(adaptAgentStep),
    toolCalls: (r.tool_calls ?? []).map(adaptAgentToolCall),
    toolCount: (r.tool_calls ?? []).length,
  };
}

export function adaptAgentRunDetail(d: BackendAgentRunDetail): AgentRun {
  // Combine detail parts into a full AgentRun via the list adapter field shapes
  const run = d.run;
  const backendRun: BackendAgentRun = {
    id: run.id,
    inspection_id: run.inspection_id,
    equipment: undefined,
    status: run.status,
    iterations: run.iterations,
    budget_used: run.budget_used,
    final_action: run.final_action ?? null,
    started_at: run.started_at ?? null,
    ended_at: run.ended_at ?? null,
    steps: d.steps,
    tool_calls: d.tool_calls,
  };
  return adaptAgentRun(backendRun);
}

export function adaptBenchmarkRun(b: BackendBenchmarkRun): BenchmarkRun {
  return {
    id: b.id,
    name: b.name,
    description: b.description ?? undefined,
    config: b.config_json,
    results: b.results_json,
    createdAt: b.created_at,
    durationMs: b.duration_ms,
  };
}

// ---------- HTTP client ----------

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let detail = "An error occurred";
    try {
      const err = await res.json();
      detail = err.detail || JSON.stringify(err);
    } catch {
      // use default message
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

// ---------- Auth API ----------

export const api = {
  auth: {
    login: async (email: string, password: string): Promise<{ access_token: string; user: User }> => {
      const res = await request<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.access_token);
      return { access_token: res.access_token, user: adaptUser(res.user) };
    },
    register: async (data: RegisterRequest): Promise<{ access_token: string; user: User }> => {
      const res = await request<LoginResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setToken(res.access_token);
      return { access_token: res.access_token, user: adaptUser(res.user) };
    },
    me: async (): Promise<User | null> => {
      const token = getToken();
      if (!token) return null;
      try {
        const res = await request<BackendUser>("/api/auth/me");
        return adaptUser(res);
      } catch {
        clearToken();
        return null;
      }
    },
    logout: () => {
      clearToken();
    },
  },

  // ---------- Equipment API ----------
  equipment: {
    list: async (params?: {
      search?: string;
      status?: string;
      category?: string;
      limit?: number;
    }): Promise<Equipment[]> => {
      const q = new URLSearchParams();
      if (params?.search) q.set("search", params.search);
      if (params?.status) q.set("status_filter", params.status);
      if (params?.category) q.set("category", params.category);
      if (params?.limit) q.set("limit", String(params.limit));

      const query = q.toString();
      const res = await request<BackendEquipment[]>(`/api/equipment${query ? `?${query}` : ""}`);
      return res.map(adaptEquipment);
    },
    get: async (id: string): Promise<Equipment> => {
      const res = await request<BackendEquipment>(`/api/equipment/${id}`);
      return adaptEquipment(res);
    },
    status: async (id: string): Promise<Record<string, unknown>> => {
      return request<Record<string, unknown>>(`/api/equipment/${id}/status`);
    },
  },

  // ---------- Findings API ----------
  findings: {
    list: async (params?: {
      status?: string;
      severity?: string;
      equipment_id?: string;
    }): Promise<Finding[]> => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.severity) q.set("severity", params.severity);
      if (params?.equipment_id) q.set("equipment_id", params.equipment_id);

      const query = q.toString();
      const res = await request<BackendFinding[]>(`/api/findings${query ? `?${query}` : ""}`);
      return res.map(adaptFinding);
    },
    get: async (id: string): Promise<Finding> => {
      const res = await request<BackendFinding>(`/api/findings/${id}`);
      return adaptFinding(res);
    },
    review: async (id: string, resolution_state: string, notes?: string, verified?: boolean): Promise<Finding> => {
      const res = await request<BackendFinding>(`/api/findings/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ resolution_state, notes, verified }),
      });
      return adaptFinding(res);
    },
  },

  // ---------- Inspections API ----------
  inspections: {
    list: async (status?: string): Promise<Inspection[]> => {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await request<Inspection[]>(`/api/inspections${query}`);
      return toCamel(res);
    },
    get: async (id: string): Promise<Record<string, unknown>> => {
      return request<Record<string, unknown>>(`/api/inspections/${id}`);
    },
    create: async (equipmentId: string): Promise<Inspection> => {
      const res = await request<Inspection>("/api/inspections", {
        method: "POST",
        body: JSON.stringify({ equipment_id: equipmentId }),
      });
      return toCamel(res);
    },
    run: async (id: string): Promise<Record<string, unknown>> => {
      return request<Record<string, unknown>>(`/api/inspections/${id}/run`, {
        method: "POST",
      });
    },
  },

  // ---------- Tickets API ----------
  tickets: {
    list: async (params?: { status?: string; priority?: string }): Promise<MaintenanceTicket[]> => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.priority) q.set("priority", params.priority);

      const query = q.toString();
      const res = await request<BackendTicket[]>(`/api/tickets${query ? `?${query}` : ""}`);
      return res.map(adaptTicket);
    },
    get: async (id: string): Promise<Record<string, unknown>> => {
      return request<Record<string, unknown>>(`/api/tickets/${id}`);
    },
    update: async (id: string, data: Partial<MaintenanceTicketUpdate>): Promise<MaintenanceTicket> => {
      const res = await request<BackendTicket>(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return adaptTicket(res);
    },
  },

  // ---------- Analytics API ----------
  analytics: {
    overview: async (days = 30): Promise<AnalyticsOverview> => {
      return request<AnalyticsOverview>(`/api/analytics/overview?days=${days}`);
    },
  },

  // ---------- Agent API ----------
  agent: {
    listRuns: async (): Promise<AgentRun[]> => {
      const res = await request<BackendAgentRun[]>(`/api/agent/runs`);
      return res.map(adaptAgentRun);
    },
    getRun: async (id: string): Promise<AgentRun> => {
      const res = await request<BackendAgentRunDetail>(`/api/agent/runs/${id}`);
      return adaptAgentRunDetail(res);
    },
  },

  // ---------- Benchmarks API ----------
  benchmarks: {
    list: async (params?: { limit?: number }): Promise<BenchmarkRun[]> => {
      const q = new URLSearchParams();
      if (params?.limit) q.set("limit", String(params.limit));
      const query = q.toString();
      const res = await request<BackendBenchmarkRun[]>(`/api/benchmarks${query ? `?${query}` : ""}`);
      return res.map(adaptBenchmarkRun);
    },
    get: async (id: string): Promise<BenchmarkRun> => {
      const res = await request<BackendBenchmarkRun>(`/api/benchmarks/${id}`);
      return adaptBenchmarkRun(res);
    },
    run: async (config: Record<string, unknown>): Promise<Record<string, unknown>> => {
      return request<Record<string, unknown>>("/api/benchmarks/run", {
        method: "POST",
        body: JSON.stringify(config),
      });
    },
  },

  health: async (): Promise<Record<string, unknown>> => {
    return request<Record<string, unknown>>("/health");
  },
};

// ---------- Types ----------

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
}

interface MaintenanceTicketUpdate {
  status?: string;
  assigned_operator_id?: string;
  priority?: string;
  completion_notes?: string;
  due_date?: string | null;
}

function adaptUser(u: BackendUser): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    organizationId: u.organization_id,
    isActive: u.is_active,
    createdAt: u.created_at,
  };
}

// Re-export camelCase adapter for general use
export { toCamel, toCamelCase };
