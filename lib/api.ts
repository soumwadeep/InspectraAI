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

// Same-origin by default: requests go to `/backend-api/*` and the Next.js server
// proxies them to the API (see `next.config.mjs`). `NEXT_PUBLIC_*` is inlined into
// the bundle at *build* time, so a baked absolute host survives a domain change and
// the deployed app ends up telling every visitor's browser to call their own
// machine on port 8000. A relative base plus a runtime `BACKEND_ORIGIN` removes
// that whole failure mode — and the browser never makes a cross-origin call, so
// CORS stops being a deployment requirement.
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "/backend-api").replace(/\/$/, "");

/** Exported so the settings/analytics pages report the real base instead of
 *  re-deriving it and drifting from this file. */
export const API_BASE = API_URL;

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

/** Mirrors `app/api/analytics.py::_system_health`. */
export interface SystemHealthSnapshot {
  database: boolean;
  opencv: string;
  redis: boolean;
  processing_mode: string;
}

/** Mirrors the `priority_findings` rows built in analytics.py. */
export interface PriorityFinding {
  id: string;
  category: string;
  severity: string;
  equipment_id: string;
  created_at: string;
}

/** Mirrors the `agent_activity_feed` rows built in analytics.py. */
export interface AgentActivityEntry {
  run_id: string;
  equipment: string;
  status: string;
  iterations: number;
  budget_used: number;
  started_at: string | null;
}

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
  priority_findings: PriorityFinding[];
  agent_activity_feed: AgentActivityEntry[];
  system_health: SystemHealthSnapshot;
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

interface BackendEquipmentReferenceImage {
  id: string;
  equipment_id: string;
  filename: string;
  storage_path: string;
  s3_key?: string | null;
  width?: number | null;
  height?: number | null;
  uploaded_at: string;
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
  last_inspection?: Record<string, unknown> | null;
  reference_images?: BackendEquipmentReferenceImage[];
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

/** Wire shape of `schemas/inspection.py::InspectionRead`. */
interface BackendInspection {
  id: string;
  equipment_id: string;
  organization_id: string;
  inspector_id: string;
  status: string;
  started_at: string;
  ended_at?: string | null;
  duration_ms: number;
  agent_run_id?: string | null;
  findings: string[];
}

/**
 * Explicit, because this endpoint used to be handed to the generic `toCamel`
 * helper. That produced `startedAt`/`durationMs` while `Inspection` declares
 * `startTime`/`duration`, so every history and equipment-detail table silently
 * rendered blank cells that looked like an empty database rather than a mismatch.
 */
export function adaptInspection(i: BackendInspection): Inspection {
  return {
    id: i.id,
    equipmentId: i.equipment_id,
    organizationId: i.organization_id,
    inspectorId: i.inspector_id,
    startTime: i.started_at,
    endTime: i.ended_at ?? undefined,
    status: i.status as Inspection["status"],
    findings: i.findings ?? [],
    duration: i.duration_ms,
    agentRunId: i.agent_run_id ?? undefined,
  };
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
    inspectionSchedule: eq.inspection_schedule ?? "Not scheduled",
    assignedInspector: eq.assigned_inspector_id ?? "",
    status: eq.status as Equipment["status"],
    openFindings: eq.open_findings,
    lastInspection: eq.last_inspection ?? undefined,
    // The backend returns reference images on every equipment read. This adapter
    // used to hardcode an empty array, so the detail page always rendered
    // placeholder icons and no inspection could find its reference.
    referenceImages: (eq.reference_images ?? []).map((image) => ({
      id: image.id,
      filename: image.filename,
      storagePath: image.storage_path,
      width: image.width ?? null,
      height: image.height ?? null,
      uploadedAt: image.uploaded_at,
    })),
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
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Setting Content-Type on a FormData body overrides the multipart boundary the
  // browser generates, and FastAPI then answers 422 "field required" for every
  // upload. Only JSON bodies get the header.
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isForm && options.body !== undefined) {
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  }
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
      detail = res.statusText || detail;
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

/**
 * `/storage` is mounted on `backend/storage/uploads` while stored paths begin with
 * `uploads/`, so the prefix has to be dropped to build a loadable URL.
 */
export function storageUrl(storagePath: string): string {
  const relative = storagePath
    .replace(/^\.?\/?storage\//, "")
    .replace(/^uploads\//, "");
  return `${API_URL}/storage/${relative}`;
}

const blobUrlCache = new Map<string, string>();

/**
 * Loads an authenticated binary response as an object URL.
 *
 * Evidence images come back from `GET /api/findings/{id}/evidence/{eid}`, which
 * requires an Authorization header — and an <img> element cannot send one, so the
 * bytes have to be fetched and turned into a blob URL.
 */
export async function fetchBlobUrl(path: string): Promise<string> {
  const cached = blobUrlCache.get(path);
  if (cached) return cached;

  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(`Could not load ${path}`, res.status);

  const url = URL.createObjectURL(await res.blob());
  blobUrlCache.set(path, url);
  return url;
}

// ---------- Auth API ----------

export interface FrameSample {
  id: string;
  frame_index: number;
  timestamp_ms: number | null;
  storage_path: string;
  blur_score: number | null;
  mean_abs_diff: number | null;
  ssim_score: number | null;
}
export interface InspectionFrames {
  frames: FrameSample[];
  selected_frame_index: number | null;
  selection_reason: string | null;
  count: number;
}
export interface SystemCapabilities {
  opencv: {
    version: string;
    ffmpeg: boolean;
    gstreamer: boolean;
    contrib_available: boolean;
    note: string;
  };
  database: { dialect: string; tables_present: number; postgres_verified: boolean };
  integrations: {
    redis_configured: boolean;
    s3_configured: boolean;
    aws_worker: boolean;
    cool_integration: boolean;
  };
  queue: { instrumented: boolean; note: string };
  features: { name: string; implemented: boolean; detail: string }[];
}

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
    create: async (data: {
      name: string;
      category: string;
      location: string;
      description?: string;
      manufacturer?: string;
      model?: string;
      serialNumber?: string;
    }): Promise<Equipment> => {
      const res = await request<BackendEquipment>("/api/equipment", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          category: data.category,
          location: data.location,
          description: data.description,
          manufacturer: data.manufacturer,
          model: data.model,
          serial_number: data.serialNumber,
        }),
      });
      return adaptEquipment(res);
    },
    uploadReferenceImage: async (id: string, file: File): Promise<Record<string, unknown>> => {
      const form = new FormData();
      form.append("file", file);
      return request<Record<string, unknown>>(`/api/equipment/${id}/reference-image`, {
        method: "POST",
        body: form,
      });
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
      const res = await request<BackendInspection[]>(`/api/inspections${query}`);
      return res.map(adaptInspection);
    },
    get: async (id: string): Promise<Record<string, unknown>> => {
      return request<Record<string, unknown>>(`/api/inspections/${id}`);
    },
    create: async (equipmentId: string): Promise<Inspection> => {
      const res = await request<BackendInspection>("/api/inspections", {
        method: "POST",
        body: JSON.stringify({ equipment_id: equipmentId }),
      });
      return adaptInspection(res);
    },
    run: async (id: string): Promise<Record<string, unknown>> => {
      return request<Record<string, unknown>>(`/api/inspections/${id}/run`, {
        method: "POST",
      });
    },
    uploadInput: async (id: string, file: File): Promise<Record<string, unknown>> => {
      const form = new FormData();
      form.append("file", file);
      return request<Record<string, unknown>>(`/api/inspections/${id}/upload`, {
        method: "POST",
        body: form,
      });
    },
    /**
     * Frames sampled from a video input, each with the statistics measured while
     * decoding it, plus which frame the agent chose to analyse.
     */
    frames: async (id: string): Promise<InspectionFrames> => {
      return request<InspectionFrames>(`/api/inspections/${id}/frames`);
    },
    frameImageUrl: (inspectionId: string, frameId: string): string => {
      const token = getToken();
      // The frame route is auth-protected, so a bare <img src> would 401. Callers
      // that need the token in the URL get it here; prefer fetchBlobUrl otherwise.
      return `${API_BASE}/api/inspections/${inspectionId}/frames/${frameId}/image${token ? `?token=${encodeURIComponent(token)}` : ""}`;
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

  // ---------- System API ----------
  system: {
    /** What this deployment can actually do, introspected from the running API. */
    capabilities: async (): Promise<SystemCapabilities> => {
      return request<SystemCapabilities>(`/api/system/capabilities`);
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
    /**
     * Continue a paused run. `retry` re-runs the quality gate on the newest
     * capture, `proceed` accepts the current one, `abort` fails the run.
     */
    resumeRun: async (
      id: string,
      response: "retry" | "proceed" | "abort",
    ): Promise<Record<string, unknown>> => {
      return request<Record<string, unknown>>(`/api/agent/runs/${id}/resume`, {
        method: "POST",
        body: JSON.stringify({ response }),
      });
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

  /**
   * Direct OpenCV calls. These endpoints existed on the backend from the start
   * but nothing in the UI could reach them, because `request` always sent
   * `Content-Type: application/json` and multipart uploads therefore failed.
   */
  vision: {
    quality: async (file: File): Promise<VisionQualityResult> => {
      const form = new FormData();
      form.append("file", file);
      return request<VisionQualityResult>("/api/vision/quality", {
        method: "POST",
        body: form,
      });
    },
    align: async (reference: File, image: File): Promise<VisionAlignment> => {
      const form = new FormData();
      form.append("reference", reference);
      form.append("image", image);
      return request<VisionAlignment>("/api/vision/align", { method: "POST", body: form });
    },
    compare: async (
      reference: File,
      image: File,
      diffThreshold?: number,
    ): Promise<VisionChangeDetection> => {
      const form = new FormData();
      form.append("reference", reference);
      form.append("image", image);
      const query =
        diffThreshold === undefined ? "" : `?diff_threshold=${encodeURIComponent(diffThreshold)}`;
      return request<VisionChangeDetection>(`/api/vision/compare${query}`, {
        method: "POST",
        body: form,
      });
    },
    inspect: async (reference: File, image: File): Promise<VisionInspectResult> => {
      const form = new FormData();
      form.append("reference", reference);
      form.append("image", image);
      return request<VisionInspectResult>("/api/vision/inspect", {
        method: "POST",
        body: form,
      });
    },
  },

  /**
   * Live process state. Typed rather than a loose record because the System
   * Health panel used to render hardcoded values under this label.
   */
  health: async (): Promise<SystemHealth> => {
    return request<SystemHealth>("/health");
  },
};

export interface VisionQuality {
  blur_score: number;
  exposure_score: number;
  glare_estimate: number;
  image_coverage: number;
  inspection_suitability: "sufficient" | "insufficient";
  reasons: string[];
  brightness_mean?: number;
  brightness_std?: number;
  saturation_mean?: number;
  edge_density?: number;
  resolution?: [number, number];
}

export interface VisionQualityResult {
  quality: VisionQuality;
}

export interface VisionAlignment {
  status: string;
  matched_keypoints: number;
  inlier_ratio: number;
  reprojection_error: number;
  confidence: number;
  reason: string;
  /** base64 PNG, present when alignment succeeded. */
  aligned_image?: string;
}

/** bbox coordinates are relative 0-1 of the reference frame. */
export interface VisionRegion {
  bbox: [number, number, number, number];
  area_px: number;
  confidence: number;
  mean_intensity: number;
  description: string;
}

export interface VisionChangeDetection {
  status: string;
  num_changed_regions: number;
  total_changed_area: number;
  ssim_score: number;
  mean_abs_diff: number;
  change_fraction: number;
  regions: VisionRegion[];
}

export interface VisionAnomaly {
  severity: string;
  category: string;
  description: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface VisionInspectResult {
  quality: VisionQuality;
  alignment: VisionAlignment;
  change_detection: VisionChangeDetection;
  detections: unknown[];
  anomalies: VisionAnomaly[];
  recommendations: string[];
  overall_confidence: number;
  processing_time_ms: number;
  /** category -> filename -> base64 PNG. */
  evidence?: Record<string, Record<string, string>>;
}

export interface SystemHealth {
  status: string;
  app: string;
  version: string;
  opencv: string;
  database: "connected" | "disconnected";
  schema_revision: string;
}

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
