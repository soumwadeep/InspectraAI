/**
 * Read-side helpers for the Agent Activity console.
 *
 * House rule for this page, and the reason these helpers exist: a value is only
 * ever rendered if an API response carried it. Where the backend has no value the
 * UI says so explicitly instead of substituting a plausible one, and nothing here
 * derives a number that is not either returned directly or an arithmetic sum of
 * returned values (always labelled as derived).
 *
 * Field names follow `lib/types.ts` (the camelCase adapters in `lib/api.ts`), not
 * the backend's snake_case, except in the inspection-payload parser below, which
 * deliberately reads the raw `GET /api/inspections/{id}` body because the typed
 * `Finding` adapter drops the evidence rows' `evidence_type` and `caption`.
 */
import type { AgentRun, AgentStep, AgentToolCall, BadgeVariant } from "@/lib/types";

/** `action_type` the state machine writes for a pure state edge (no tool runs). */
export const STATE_TRANSITION_ACTION = "state_transition";

/** Written by `VisionAgent.resume()` when a human answers a paused run. */
export const HUMAN_RESPONSE_ACTION = "human_response";

/**
 * `adaptAgentStep` in lib/api.ts maps a null `tool_name` to this literal. State
 * edges, `sample_video_frames` and `human_response` all have no tool, so the
 * placeholder must never be rendered as if it were a tool name.
 */
export const NULL_TOOL_PLACEHOLDER = "unknown";

export const runStatusVariant: Record<AgentRun["status"], BadgeVariant> = {
  running: "info",
  completed: "success",
  failed: "critical",
  paused: "warning",
};

export const runStatusDot: Record<
  AgentRun["status"],
  "online" | "offline" | "processing" | "warning" | "idle"
> = {
  running: "processing",
  completed: "online",
  failed: "offline",
  paused: "warning",
};

/**
 * `AgentStep["action"]` is declared as a started/completed/failed union, but the
 * backend's `action_type` column stores the action that ran (`align_with_reference`,
 * `state_transition`, …). Widening to `string` here keeps every comparison honest
 * without pretending the declared union matches the wire.
 */
export function stepAction(step: AgentStep): string {
  return String(step.action);
}

export function isStateTransition(step: AgentStep): boolean {
  return stepAction(step) === STATE_TRANSITION_ACTION;
}

export function isHumanStep(step: AgentStep): boolean {
  return (
    step.isHumanInteraction === true ||
    stepAction(step) === HUMAN_RESPONSE_ACTION ||
    stepAction(step) === "request_human_input"
  );
}

/** The real `tool_name`, or null when the step ran no tool. */
export function stepTool(step: AgentStep): string | null {
  if (!step.tool || step.tool === NULL_TOOL_PLACEHOLDER) return null;
  return step.tool;
}

/** `{"from": "start", "to": "quality-check"}` on a state edge. */
export function stateEdge(step: AgentStep): { from: string; to: string } | null {
  const args = step.arguments as { from?: unknown; to?: unknown } | undefined;
  if (!args || typeof args.from !== "string" || typeof args.to !== "string") return null;
  return { from: args.from, to: args.to };
}

export interface StepMeasurement {
  /** Verbatim key from the step text, e.g. `inlier ratio`. */
  label: string;
  /** Verbatim value, e.g. `99.9%`. Never reparsed or rounded. */
  value: string;
}

/**
 * Splits the `key=value` measurements the tools write into their step text —
 * "Alignment: success, 1612 keypoints, inlier ratio=99.9%, reprojection
 * error=0.00px" — into chips.
 *
 * Substring extraction only: both halves are the exact characters the API
 * returned, so a chip can never disagree with the sentence above it. Values that
 * are not in `key=value` form ("1612 keypoints", "1 regions") stay in the prose
 * and are not promoted into chips.
 */
const MEASUREMENT_PATTERN = /([A-Za-z][A-Za-z ._-]{1,28}?)=([^\s,;()]+)/g;

export function parseMeasurements(text: string | undefined): StepMeasurement[] {
  if (!text) return [];
  const measurements: StepMeasurement[] = [];
  for (const match of text.matchAll(MEASUREMENT_PATTERN)) {
    const label = match[1].trim();
    const value = match[2].trim();
    if (label.length === 0 || value.length === 0) continue;
    measurements.push({ label, value });
  }
  return measurements;
}

/**
 * Counts over the returned trace. Derived, and every caller labels it as such —
 * there is no progress endpoint, so nothing here implies completion.
 */
export interface TraceSummary {
  toolSteps: number;
  stateEdges: number;
  humanSteps: number;
  failedToolCalls: number;
  /** Sum of the non-null `duration_ms` values on the returned steps. */
  recordedStepMs: number;
}

export function summarizeTrace(steps: AgentStep[], toolCalls: AgentToolCall[]): TraceSummary {
  let toolSteps = 0;
  let stateEdges = 0;
  let humanSteps = 0;
  let recordedStepMs = 0;

  for (const step of steps) {
    if (isStateTransition(step)) {
      stateEdges += 1;
    } else {
      toolSteps += 1;
    }
    if (isHumanStep(step)) humanSteps += 1;
    if (typeof step.duration === "number" && step.duration > 0) {
      recordedStepMs += step.duration;
    }
  }

  return {
    toolSteps,
    stateEdges,
    humanSteps,
    failedToolCalls: toolCalls.filter((call) => call.success === false).length,
    recordedStepMs,
  };
}

// ------------------------------------------------------------------ final outcome

/**
 * `GET /api/agent/runs/{id}` returns `run.final_outcome` and lib/api.ts declares
 * it on `BackendAgentRunDetail`, but `adaptAgentRunDetail` does not copy it onto
 * `AgentRun`, so today the console receives nothing and says so. Probing both the
 * camelCase and snake_case spellings means the panel fills itself the moment that
 * adapter carries the field — with no fabricated fallback in the meantime.
 */
export function readFinalOutcome(
  run: AgentRun | null | undefined,
): Record<string, unknown> | null {
  if (!run) return null;
  const candidate = run as unknown as {
    finalOutcome?: unknown;
    final_outcome?: unknown;
  };
  const outcome = candidate.finalOutcome ?? candidate.final_outcome;
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return null;
  return outcome as Record<string, unknown>;
}

export function outcomeString(
  outcome: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = outcome?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function outcomeNumber(
  outcome: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = outcome?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function outcomeBoolean(
  outcome: Record<string, unknown> | null,
  key: string,
): boolean | null {
  const value = outcome?.[key];
  return typeof value === "boolean" ? value : null;
}

export function outcomeRecord(
  outcome: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  const value = outcome?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function outcomeStringList(
  outcome: Record<string, unknown> | null,
  key: string,
): string[] | null {
  const value = outcome?.[key];
  if (!Array.isArray(value)) return null;
  const items = value.filter((entry): entry is string => typeof entry === "string");
  return items.length > 0 ? items : null;
}

/**
 * The budget ceiling is not a field on the run; the `finalize_inspection` step
 * states it in prose ("using 10.0/100 budget"). Reading it back out is the only
 * way to show a denominator without inventing one.
 */
export function budgetCeilingFromTrace(steps: AgentStep[]): string | null {
  const pattern = /using\s+[\d.]+\/(\d+(?:\.\d+)?)\s+budget/i;
  for (const step of steps) {
    const match = pattern.exec(step.description ?? "");
    if (match) return match[1];
  }
  return null;
}

// ---------------------------------------------------------------- evidence

export interface EvidenceRow {
  id: string;
  findingId: string;
  evidenceType: string;
  storagePath: string;
  caption: string | null;
  /** `metadata_json.region_index`, when the row carries it. */
  regionIndex: number | null;
}

export interface RunFinding {
  id: string;
  category: string;
  description: string;
  severity: string | null;
  detectionMethod: string | null;
  confidence: number | null;
  verificationStatus: string | null;
  evidence: EvidenceRow[];
}

/**
 * `adaptFinding` collapses evidence to `storage_path[]`, losing the type and
 * caption this page needs, and `AgentRun` has no findings at all. So this parses
 * the raw body of `GET /api/inspections/{id}` (`api.inspections.get` hands it back
 * unadapted as a `Record<string, unknown>`), keeping only fields that are actually
 * strings/numbers and dropping anything else.
 */
export function parseInspectionPayload(
  raw: Record<string, unknown> | null | undefined,
): RunFinding[] {
  const findings = raw?.findings;
  if (!Array.isArray(findings)) return [];

  const parsed: RunFinding[] = [];
  for (const entry of findings) {
    if (!entry || typeof entry !== "object") continue;
    const finding = entry as Record<string, unknown>;
    if (typeof finding.id !== "string") continue;

    const evidenceRows: EvidenceRow[] = [];
    if (Array.isArray(finding.evidence)) {
      for (const item of finding.evidence) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (typeof row.id !== "string" || typeof row.storage_path !== "string") continue;
        const meta =
          row.metadata_json && typeof row.metadata_json === "object" && !Array.isArray(row.metadata_json)
            ? (row.metadata_json as Record<string, unknown>)
            : null;
        evidenceRows.push({
          id: row.id,
          findingId: finding.id,
          evidenceType: typeof row.evidence_type === "string" ? row.evidence_type : "unlabelled",
          storagePath: row.storage_path,
          caption: typeof row.caption === "string" && row.caption.length > 0 ? row.caption : null,
          regionIndex:
            meta && typeof meta.region_index === "number" && Number.isFinite(meta.region_index)
              ? meta.region_index
              : null,
        });
      }
    }

    parsed.push({
      id: finding.id,
      category: typeof finding.category === "string" ? finding.category : "uncategorised",
      description: typeof finding.description === "string" ? finding.description : "",
      severity: typeof finding.severity === "string" ? finding.severity : null,
      detectionMethod:
        typeof finding.detection_method === "string" ? finding.detection_method : null,
      confidence:
        typeof finding.confidence === "number" && Number.isFinite(finding.confidence)
          ? finding.confidence
          : null,
      verificationStatus:
        typeof finding.verification_status === "string" ? finding.verification_status : null,
      evidence: evidenceRows,
    });
  }

  return parsed;
}

/**
 * Human-readable names for the `evidence_type` values this pipeline writes.
 * Unknown or legacy spellings fall back to the stored string rather than being
 * mapped onto a nearby label.
 */
const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  annotated: "Annotated region",
  cropped: "Region crop",
  // One legacy row in the dev database is spelled `crop`; same artifact.
  crop: "Region crop",
  comparison: "Reference beside capture",
  annotated_reference: "All regions on the reference",
  diff_overlay: "Change-energy overlay",
  diff_mask_raw: "Binary change mask",
};

export function evidenceTypeLabel(evidenceType: string): string {
  return EVIDENCE_TYPE_LABELS[evidenceType] ?? evidenceType;
}

/**
 * Severity arrives as a plain string on the raw inspection payload, so an unknown
 * value must not index a `Record<Severity, …>` and produce `undefined` styling.
 */
const SEVERITY_VARIANTS: Record<string, BadgeVariant> = {
  critical: "critical",
  warning: "warning",
  info: "info",
  success: "success",
};

export function severityVariant(severity: string | null): BadgeVariant {
  if (!severity) return "outline";
  return SEVERITY_VARIANTS[severity] ?? "outline";
}

/** Counts of each `evidence_type` across the returned findings. */
export function countEvidenceByType(findings: RunFinding[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const finding of findings) {
    for (const row of finding.evidence) {
      totals.set(row.evidenceType, (totals.get(row.evidenceType) ?? 0) + 1);
    }
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

/** Auth-protected evidence route; load through `fetchBlobUrl`, never an `<img src>`. */
export function evidenceBlobPath(findingId: string, evidenceId: string): string {
  return `/api/findings/${findingId}/evidence/${evidenceId}`;
}

// ---------------------------------------------------------------- clock

/**
 * Run and step timestamps are naive UTC strings (`datetime.utcnow().isoformat()`),
 * so `new Date(...)` would shift them by the viewer's offset. They are re-labelled
 * by string surgery and always marked UTC.
 */
export function formatServerStamp(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, , month, day, hour, minute, second] = match;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthName = months[Number(month) - 1] ?? month;
  return `${day} ${monthName} ${hour}:${minute}:${second} UTC`;
}

// ---------------------------------------------------------------- resume

export type ResumeChoice = "retry" | "proceed" | "abort";

export interface ResumeOption {
  choice: ResumeChoice;
  label: string;
  detail: string;
  /** Existing tokens only — the three answers get three different weights. */
  cardTone: string;
}

/**
 * What each answer does, written from `VisionAgent.resume()` in
 * `backend/app/agent/workflow.py` rather than from the copy a designer would guess:
 * `retry` wipes the measurements and re-enters the gate, `proceed` writes
 * `inspection_suitability = "accepted_by_human"`, `abort` ends the run as failed.
 */
export const RESUME_OPTIONS: ResumeOption[] = [
  {
    choice: "retry",
    label: "Retry the quality gate",
    detail:
      "Clears the recorded quality, alignment and change measurements, re-selects the newest input for this inspection (video inputs are re-sampled) and runs the gate again from the persisted snapshot.",
    cardTone: "border-primary/30 bg-primary/5",
  },
  {
    choice: "proceed",
    label: "Accept this capture",
    detail:
      "Overrides the gate: the quality record is marked accepted_by_human and the run continues into alignment against the reference image.",
    cardTone: "border-success/30 bg-success/5",
  },
  {
    choice: "abort",
    label: "Abort the run",
    detail:
      "Ends the run as failed. The snapshot is not continued; the abort is written into the trace.",
    cardTone: "border-critical/30 bg-critical/5",
  },
];

export const RESUME_MECHANICS =
  "Every answer appends a human_response step to the trace, then the rule-based loop resumes from the context persisted on the run.";

// ---------------------------------------------------------------- misc

/** A number the API sent, shown without inventing precision. */
export function formatReturnedNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "not returned";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-3)}` : id;
}
