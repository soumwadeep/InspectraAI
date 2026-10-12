/**
 * Report assembly from rows the API already returned.
 *
 * A report section is only ever a grouping of real rows: counts, min/median/max
 * over measured durations, tallies of statuses. There is no summary prose here
 * that is not literally derived from the rows in scope, and a section with no
 * rows says so explicitly. Row sources (with their API default caps) are listed
 * in the scope section so a reader knows the report covers the rows the
 * endpoints returned, not an unbounded history.
 */

import type { AgentRun, BenchmarkRun, Finding, Inspection, MaintenanceTicket } from "@/lib/types";
import { parseBenchmarkResults } from "@/components/benchmarks/benchmark-results";

export interface ReportWindow {
  /** Days counted back from generation time; `null` means all returned rows. */
  days: number | null;
  label: string;
}

export const REPORT_WINDOWS: ReportWindow[] = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: null, label: "All returned rows" },
];

export interface CountedGroup {
  name: string;
  count: number;
}

export interface DurationStats {
  /** Rows that actually carried a measured duration > 0. */
  measured: number;
  min_ms?: number;
  median_ms?: number;
  max_ms?: number;
}

export interface WindowedRows<T> {
  inWindow: T[];
  /** Rows whose timestamp was missing or unparseable — never silently dropped. */
  undated: number;
  totalReturned: number;
}

export interface InspectionSection {
  inspections: WindowedRows<Inspection>;
  byStatus: CountedGroup[];
  durations: DurationStats;
}

export interface FindingsSection {
  findings: WindowedRows<Finding>;
  bySeverity: CountedGroup[];
  byCategory: CountedGroup[];
  byVerification: CountedGroup[];
  byResolutionState: CountedGroup[];
}

export interface TicketsSection {
  tickets: WindowedRows<MaintenanceTicket>;
  byStatus: CountedGroup[];
  byPriority: CountedGroup[];
  /** Open items whose due date passed before the report was generated. */
  overdue: number;
}

export interface AgentRunsSection {
  runs: WindowedRows<AgentRun>;
  byStatus: CountedGroup[];
  total_iterations: number;
  total_budget_used: number;
  total_tool_calls: number;
  durations: DurationStats;
}

export interface BenchmarkSection {
  runs: WindowedRows<BenchmarkRun>;
  /** Latest run in window, parsed; undefined when there is none. */
  latest?: {
    id: string;
    name: string;
    createdAt: string;
    pairs?: number;
    seed?: number;
    precision?: number;
    recall?: number;
    f1_score?: number;
    mean_iou?: number;
    accuracy?: number;
    correct?: number;
    scored?: number;
    pipeline_ms?: number;
    per_pair_ms?: number;
  };
}

export type ReportSourceKey = "inspections" | "findings" | "tickets" | "agentRuns" | "benchmarks";

export interface ReportSourceState {
  endpoint: string;
  /** True when the API call failed: the section must show the failure, never a zero. */
  failed: boolean;
}

export interface ReportModel {
  generatedAt: Date;
  window: ReportWindow;
  windowStart: Date | null;
  organization: { id: string; email: string; role: string } | null;
  sources: Record<ReportSourceKey, ReportSourceState>;
  inspections: InspectionSection;
  findings: FindingsSection;
  tickets: TicketsSection;
  agentRuns: AgentRunsSection;
  benchmarks: BenchmarkSection;
}

export interface ReportInputs {
  window: ReportWindow;
  generatedAt: Date;
  organization: { id: string; email: string; role: string } | null;
  sourceErrors: Record<ReportSourceKey, boolean>;
  inspections: Inspection[] | null;
  findings: Finding[] | null;
  tickets: MaintenanceTicket[] | null;
  agentRuns: AgentRun[] | null;
  benchmarks: BenchmarkRun[] | null;
}

function timestampOf(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function windowRows<T>(
  rows: T[] | null,
  pick: (row: T) => string | undefined,
  windowStart: number | null,
): WindowedRows<T> {
  const list = rows ?? [];
  if (windowStart === null) {
    return { inWindow: list, undated: 0, totalReturned: list.length };
  }
  const inWindow: T[] = [];
  let undated = 0;
  for (const row of list) {
    const at = timestampOf(pick(row));
    if (at === null) {
      undated += 1;
      continue;
    }
    if (at >= windowStart) inWindow.push(row);
  }
  return { inWindow, undated, totalReturned: list.length };
}

/** Sorts a string-keyed tally descending by count, name alphabetical on ties. */
function tally<T>(rows: T[], nameOf: (row: T) => string): CountedGroup[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = nameOf(row);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function durationStats(valuesMs: number[]): DurationStats {
  const sorted = [...valuesMs].filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return { measured: 0 };
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { measured: sorted.length, min_ms: sorted[0], median_ms: median, max_ms: sorted[sorted.length - 1] };
}

export function buildReportModel(input: ReportInputs): ReportModel {
  const windowStart =
    input.window.days === null ? null : input.generatedAt.getTime() - input.window.days * 86_400_000;

  const inspections = windowRows(input.inspections, (row) => row.startTime, windowStart);
  const findings = windowRows(input.findings, (row) => row.createdAt, windowStart);
  const tickets = windowRows(input.tickets, (row) => row.createdAt, windowStart);
  const runs = windowRows(input.agentRuns, (row) => row.startTime, windowStart);
  const benchmarks = windowRows(input.benchmarks, (row) => row.createdAt, windowStart);

  const closedStates = new Set(["closed"]);
  const overdue = tickets.inWindow.filter((ticket) => {
    if (closedStates.has(ticket.status)) return false;
    const due = timestampOf(ticket.dueDate);
    return due !== null && due < input.generatedAt.getTime();
  }).length;

  const runDurations: number[] = [];
  let totalIterations = 0;
  let totalBudget = 0;
  let totalToolCalls = 0;
  for (const run of runs.inWindow) {
    totalIterations += run.iterations;
    totalBudget += run.budgetUsed;
    totalToolCalls += run.toolCalls.length;
    const start = timestampOf(run.startTime);
    const end = timestampOf(run.endTime);
    if (start !== null && end !== null && end > start) runDurations.push(end - start);
  }

  const latestBenchmarkRun = benchmarks.inWindow[0]; // list endpoint returns newest first
  let latest: BenchmarkSection["latest"];
  if (latestBenchmarkRun) {
    const parsed = parseBenchmarkResults(latestBenchmarkRun.results);
    latest = {
      id: latestBenchmarkRun.id,
      name: latestBenchmarkRun.name,
      createdAt: latestBenchmarkRun.createdAt,
      pairs: parsed.corpus.pairs,
      seed: parsed.corpus.seed,
      precision: parsed.detection.precision,
      recall: parsed.detection.recall,
      f1_score: parsed.detection.f1_score,
      mean_iou: parsed.detection.mean_iou,
      accuracy: parsed.classification.accuracy,
      correct: parsed.classification.correct,
      scored: parsed.classification.scored,
      pipeline_ms: parsed.timing.pipeline_ms,
      per_pair_ms: parsed.timing.per_pair_ms,
    };
  }

  return {
    generatedAt: input.generatedAt,
    window: input.window,
    windowStart: windowStart === null ? null : new Date(windowStart),
    organization: input.organization,
    sources: {
      inspections: { endpoint: "GET /api/inspections", failed: input.sourceErrors.inspections },
      findings: { endpoint: "GET /api/findings", failed: input.sourceErrors.findings },
      tickets: { endpoint: "GET /api/tickets", failed: input.sourceErrors.tickets },
      agentRuns: { endpoint: "GET /api/agent/runs", failed: input.sourceErrors.agentRuns },
      benchmarks: { endpoint: "GET /api/benchmarks", failed: input.sourceErrors.benchmarks },
    },
    inspections: {
      inspections,
      byStatus: tally(inspections.inWindow, (row) => row.status),
      durations: durationStats(
        inspections.inWindow.map((row) => row.duration ?? 0),
      ),
    },
    findings: {
      findings,
      bySeverity: tally(findings.inWindow, (row) => row.severity),
      byCategory: tally(findings.inWindow, (row) => row.category),
      byVerification: tally(findings.inWindow, (row) => row.verificationStatus),
      byResolutionState: tally(findings.inWindow, (row) => row.resolutionState),
    },
    tickets: {
      tickets,
      byStatus: tally(tickets.inWindow, (row) => row.status),
      byPriority: tally(tickets.inWindow, (row) => row.priority),
      overdue,
    },
    agentRuns: {
      runs,
      byStatus: tally(runs.inWindow, (row) => row.status),
      total_iterations: totalIterations,
      total_budget_used: totalBudget,
      total_tool_calls: totalToolCalls,
      durations: durationStats(runDurations),
    },
    benchmarks: { runs: benchmarks, latest },
  };
}

/* ------------------------------------------------------------------ */
/* Plain-text rendering                                                */
/* ------------------------------------------------------------------ */

function groups(groupsList: CountedGroup[]): string {
  if (groupsList.length === 0) return "none";
  return groupsList.map((group) => `${group.name}: ${group.count}`).join(", ");
}

function num(value: number | undefined, digits = 3): string {
  if (value === undefined) return "not measured";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

function durationsLine(stats: DurationStats): string {
  if (stats.measured === 0) return "no rows carried a measured duration";
  return (
    `${stats.measured} measured · min ${num(stats.min_ms, 1)} ms · median ${num(
      stats.median_ms,
      1,
    )} ms · max ${num(stats.max_ms, 1)} ms`
  );
}

function windowedLine(label: string, rows: WindowedRows<unknown>, undatedLabel = "undated"): string {
  const base = `${rows.inWindow.length} of ${rows.totalReturned} returned ${label}(s) fell inside the window`;
  return rows.undated > 0 ? `${base}; ${rows.undated} ${undatedLabel} row(s) excluded from windowing` : base;
}

/**
 * Text form of the report. Every line is either a fixed structural label or a
 * number derived from returned rows — nothing is summarised in prose the data
 * does not literally say.
 */
export function reportToText(model: ReportModel): string {
  const lines: string[] = [];
  lines.push("INSPECTRA AI — OPERATIONS REPORT");
  lines.push(`Generated (browser clock): ${model.generatedAt.toISOString()}`);
  lines.push(
    `Window: ${model.window.label}${
      model.windowStart ? ` (from ${model.windowStart.toISOString()})` : ""
    }`,
  );
  lines.push(
    model.organization
      ? `Organization: ${model.organization.id} · requesting user: ${model.organization.email} (${model.organization.role})`
      : "Organization: not signed in — the API scopes every row to the session's organization",
  );
  lines.push(
    "Sources: GET /api/inspections, /api/findings, /api/tickets, /api/agent/runs, /api/benchmarks (API default list caps apply; the report covers only the rows those endpoints returned).",
  );
  lines.push("");

  lines.push("1. INSPECTIONS");
  if (model.sources.inspections.failed) {
    lines.push(`Data unavailable — ${model.sources.inspections.endpoint} failed. Not zero: missing.`);
  } else {
  if (model.inspections.inspections.inWindow.length === 0) {
    lines.push("No inspections were recorded in this window.");
  }
  lines.push(
    windowedLine("inspection", model.inspections.inspections) +
      ` (windowed on started_at)`,
  );
  lines.push(`Statuses — ${groups(model.inspections.byStatus)}`);
  lines.push(`Durations — ${durationsLine(model.inspections.durations)}`);
  }
  lines.push("");

  lines.push("2. FINDINGS");
  if (model.sources.findings.failed) {
    lines.push(`Data unavailable — ${model.sources.findings.endpoint} failed. Not zero: missing.`);
  } else {
  if (model.findings.findings.inWindow.length === 0) {
    lines.push("No findings were recorded in this window.");
  }
  lines.push(windowedLine("finding", model.findings.findings) + " (windowed on created_at)");
  lines.push(`Severity — ${groups(model.findings.bySeverity)}`);
  lines.push(`Category — ${groups(model.findings.byCategory)}`);
  lines.push(`Verification — ${groups(model.findings.byVerification)}`);
  lines.push(`Resolution state — ${groups(model.findings.byResolutionState)}`);
  }
  lines.push("");

  lines.push("3. MAINTENANCE TICKETS");
  if (model.sources.tickets.failed) {
    lines.push(`Data unavailable — ${model.sources.tickets.endpoint} failed. Not zero: missing.`);
  } else {
  if (model.tickets.tickets.inWindow.length === 0) {
    lines.push("No tickets were raised in this window.");
  }
  lines.push(windowedLine("ticket", model.tickets.tickets) + " (windowed on created_at)");
  lines.push(`Statuses — ${groups(model.tickets.byStatus)}`);
  lines.push(`Priorities — ${groups(model.tickets.byPriority)}`);
  lines.push(
    `Overdue (due_date before generation time, status not closed): ${model.tickets.overdue}`,
  );
  }
  lines.push("");

  lines.push("4. AGENT RUNS");
  if (model.sources.agentRuns.failed) {
    lines.push(`Data unavailable — ${model.sources.agentRuns.endpoint} failed. Not zero: missing.`);
  } else {
  if (model.agentRuns.runs.inWindow.length === 0) {
    lines.push("No agent runs were recorded in this window.");
  }
  lines.push(windowedLine("agent run", model.agentRuns.runs) + " (windowed on started_at)");
  lines.push(`Statuses — ${groups(model.agentRuns.byStatus)}`);
  lines.push(
    `Totals — ${model.agentRuns.total_iterations} iterations · ${num(
      model.agentRuns.total_budget_used,
      1,
    )} budget units · ${model.agentRuns.total_tool_calls} tool calls`,
  );
  lines.push(`Run span (started_at→ended_at) — ${durationsLine(model.agentRuns.durations)}`);
  }
  lines.push("");

  lines.push("5. BENCHMARK RUNS (synthetic labelled corpus only — not real plant imagery)");
  if (model.sources.benchmarks.failed) {
    lines.push(`Data unavailable — ${model.sources.benchmarks.endpoint} failed. Not zero: missing.`);
  } else if (model.benchmarks.runs.inWindow.length === 0) {
    lines.push("No benchmark runs were recorded in this window.");
  } else {
    lines.push(
      windowedLine("benchmark run", model.benchmarks.runs) + " (windowed on created_at)",
    );
    const latest = model.benchmarks.latest;
    if (latest) {
      lines.push(`Latest run: ${latest.name} (${latest.id}) at ${latest.createdAt}`);
      lines.push(
        `Corpus scope — pairs ${num(latest.pairs)}, seed ${num(latest.seed)}; these metrics describe that synthetic corpus only`,
      );
      lines.push(
        `Detection — precision ${num(latest.precision)} · recall ${num(
          latest.recall,
        )} · F1 ${num(latest.f1_score)} · mean IoU ${num(latest.mean_iou)}`,
      );
      lines.push(
        `Classification — accuracy ${num(
          latest.accuracy,
        )} (${num(latest.correct)} of ${num(latest.scored)} matched boxes scored)`,
      );
      lines.push(
        `Timing — pipeline ${num(latest.pipeline_ms, 1)} ms · per-pair ${num(
          latest.per_pair_ms,
          1,
        )} ms`,
      );
    } else {
      lines.push("The newest run in the window stored no parseable results.");
    }
  }
  lines.push("");
  lines.push("END — every figure above is a direct read or a count/quantile of rows returned by the listed endpoints.");
  return lines.join("\n");
}
