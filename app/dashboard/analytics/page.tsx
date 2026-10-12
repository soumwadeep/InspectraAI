"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { ExportButton } from "@/components/mission/export-button";
import { MeasuredBarChart } from "@/components/analytics/measured-bar-chart";
import { MeasuredPieChart } from "@/components/analytics/measured-pie-chart";
import { CapabilitiesPanel } from "@/components/analytics/capabilities-panel";
import { CustomLineChart } from "@/components/charts/line-chart";
import { chartPalette } from "@/components/charts/chart-theme";
import {
  Activity,
  AlertTriangle,
  Clock,
  Package,
  Scan,
  ShieldCheck,
  Wrench,
} from "@/components/icons";
import {
  useAgentRuns,
  useAnalyticsOverview,
  useEquipment,
  useFindings,
  useInspections,
} from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import type { AgentRun, BadgeVariant, FindingStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { entry, stagger } from "@/lib/motion/presets";

/**
 * `GET /api/analytics/overview?days=N` applies `days` to
 * `inspection_activity_trend` only. Every counter in that payload is cumulative
 * for the organisation, so this page labels the trend with the window and the
 * counters with "all time" instead of implying they are scoped to it.
 */
const TREND_WINDOW_DAYS = 30;

const BACKEND_START_COMMAND = "python3 -m uvicorn app.main:app --port 8000";

/**
 * Detection quality is deliberately absent from this page. `POST /api/benchmarks/run`
 * now performs real measurements, but only over a labelled *synthetic* corpus —
 * those figures live on the Benchmarks page with their scope stated. Nothing on
 * this page presents a quality percentage, because none is derived from real
 * plant imagery.
 *
 * Chart note: bar and pie animations here go through `components/analytics/`
 * wrappers that gate recharts `isAnimationActive` on `useReducedMotion()` — the
 * pattern `components/charts/line-chart.tsx` already follows, since
 * `MotionConfig reducedMotion="user"` does not reach recharts.
 */

/** Buckets for the measured `duration_ms` of completed inspections. */
const LATENCY_BUCKETS: ReadonlyArray<{ label: string; upperBoundMs: number }> = [
  { label: "<1s", upperBoundMs: 1_000 },
  { label: "1-2s", upperBoundMs: 2_000 },
  { label: "2-3s", upperBoundMs: 3_000 },
  { label: "3-5s", upperBoundMs: 5_000 },
  { label: "5-10s", upperBoundMs: 10_000 },
  { label: ">10s", upperBoundMs: Number.POSITIVE_INFINITY },
];

const REVIEW_STATE_LABELS: Record<FindingStatus, string> = {
  "pending-review": "Pending review",
  confirmed: "Confirmed",
  rejected: "Rejected",
  "needs-evidence": "Needs evidence",
  "in-progress": "In progress",
  resolved: "Resolved",
};

const SEVERITY_BADGE: Record<string, BadgeVariant> = {
  critical: "critical",
  warning: "warning",
  info: "info",
  success: "success",
};

const RUN_STATUS_BADGE: Record<AgentRun["status"], BadgeVariant> = {
  running: "info",
  completed: "success",
  failed: "critical",
  paused: "warning",
};

function formatDuration(ms: number): string {
  return ms < 1_000 ? `${Math.round(ms)} ms` : `${(ms / 1_000).toFixed(1)} s`;
}

/** Groups real durations into the buckets above; empty buckets are dropped. */
function bucketLatencies(durationsMs: number[]) {
  const counts = LATENCY_BUCKETS.map((bucket) => ({ range: bucket.label, count: 0 }));
  for (const ms of durationsMs) {
    const index = LATENCY_BUCKETS.findIndex((bucket) => ms < bucket.upperBoundMs);
    const target = counts[index === -1 ? counts.length - 1 : index];
    if (target) target.count += 1;
  }
  return counts.filter((bucket) => bucket.count > 0);
}

function IconTile({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-surface-elevated p-2">{children}</div>;
}

/**
 * Every section distinguishes three outcomes: the call is still running, the
 * call failed, or the call succeeded and genuinely returned nothing. Collapsing
 * the last two into one blank panel is what makes a dead backend look like an
 * empty product.
 */
function ApiFailure({
  endpoint,
  error,
  variant = "inline",
}: {
  endpoint: string;
  error: Error | null;
  variant?: "banner" | "inline";
}) {
  const status = error instanceof ApiError ? error.status : undefined;
  const isAuthFailure = status === 401 || status === 403;
  const detail = error?.message ? `Backend said: ${error.message}.` : "No response body was returned.";

  const instructions = isAuthFailure ? (
    <p className="text-secondary-text">
      The backend rejected the session token. Sign in again at{" "}
      <code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-xs text-primary-text">
        /login
      </code>{" "}
      so a fresh token is stored.
    </p>
  ) : (
    <p className="text-secondary-text">
      Start the backend from <code className="font-mono text-primary-text">backend/</code>:{" "}
      <code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-xs text-primary-text">
        {BACKEND_START_COMMAND}
      </code>
    </p>
  );

  if (variant === "inline") {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-primary-text">
            Could not load this section — <code className="font-mono">{endpoint}</code> failed
            {status ? ` (HTTP ${status})` : ""}.
          </p>
          <p className="text-secondary-text">{detail}</p>
          {instructions}
        </div>
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-lg border border-critical/40 bg-critical/5 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-critical" />
        <div className="space-y-2">
          <p className="text-base font-semibold text-primary-text">
            Analytics API unreachable — these figures are not zero, they are missing
          </p>
          <p className="text-sm text-secondary-text">
            <code className="font-mono">{endpoint}</code> failed{status ? ` with HTTP ${status}` : ""}. {detail}
            {" "}This panel, the counters, the category and status breakdowns, the activity trend, the
            priority-findings list and the agent activity feed all read that one endpoint.
          </p>
          {isAuthFailure ? (
            instructions
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-secondary-text">
                Nothing is listening yet, so start the backend from <code className="font-mono">backend/</code>:
              </p>
              <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-sm text-primary-text">
                {BACKEND_START_COMMAND}
              </pre>
              <p className="text-xs text-secondary-text">
                The browser calls <code className="font-mono">/backend-api</code> on this same
                origin; the Next.js server forwards it to{" "}
                <code className="font-mono">BACKEND_ORIGIN</code>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyMessage({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-surface/40 p-6 text-center">
      <p className="text-sm font-medium text-primary-text">{message}</p>
      {hint ? <p className="max-w-sm text-xs text-secondary-text">{hint}</p> : null}
    </div>
  );
}

interface PanelProps<T> {
  rows: T[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** Endpoint the section reads, quoted in the failure message. */
  endpoint: string;
  /** Wording for a successful call that returned no rows. */
  emptyMessage: string;
  emptyHint?: string;
  skeletonClassName?: string;
  /** Called only when there are rows to draw, so `rows` is never empty here. */
  children: (rows: T[]) => ReactNode;
}

/** Resolves loading / error / empty / data for one card body. */
function Panel<T>({
  rows,
  isLoading,
  isError,
  error,
  endpoint,
  emptyMessage,
  emptyHint,
  skeletonClassName = "h-[300px] w-full",
  children: renderRows,
}: PanelProps<T>) {
  if (isError) return <ApiFailure endpoint={endpoint} error={error} />;
  if (isLoading) return <Skeleton className={skeletonClassName} />;
  if (rows.length === 0) return <EmptyMessage message={emptyMessage} hint={emptyHint} />;
  return <>{renderRows(rows)}</>;
}

export default function AnalyticsPage() {
  const {
    data: analytics,
    isLoading: analyticsLoading,
    isError: analyticsFailed,
    error: analyticsError,
  } = useAnalyticsOverview(TREND_WINDOW_DAYS);

  const {
    data: findings,
    isLoading: findingsLoading,
    isError: findingsFailed,
    error: findingsError,
  } = useFindings();

  const {
    data: inspections,
    isLoading: inspectionsLoading,
    isError: inspectionsFailed,
    error: inspectionsError,
  } = useInspections();

  const {
    data: agentRuns,
    isLoading: agentRunsLoading,
    isError: agentRunsFailed,
    error: agentRunsError,
  } = useAgentRuns();

  const { data: equipment, isError: equipmentFailed } = useEquipment();

  // ---- Derived from `GET /api/analytics/overview` -------------------------

  /** Days inside the trend window that actually contain inspections. */
  const activeTrendDays = (analytics?.inspection_activity_trend ?? []).filter(
    (day) => day.count > 0,
  );

  /**
   * Real period comparison: the last 7 day-buckets against the 7 before them.
   * Both sides come from `inspection_activity_trend`, so the delta is measured,
   * not asserted. Suppressed unless the window holds 14 buckets and at least one
   * of them contains an inspection — a "+0" line over an empty system would look
   * like a measured trend when it is only an absence of activity.
   */
  const trendCounts = (analytics?.inspection_activity_trend ?? []).map((day) => day.count);
  const last7 = trendCounts.slice(-7).reduce((sum, count) => sum + count, 0);
  const previous7 = trendCounts.slice(-14, -7).reduce((sum, count) => sum + count, 0);
  const inspectionsDelta = last7 - previous7;
  const hasComparisonWindow = trendCounts.length >= 14 && last7 + previous7 > 0;

  const findingsByCategory = Object.entries(analytics?.finding_categories ?? {}).map(
    ([category, count]) => ({ name: category, value: count }),
  );

  const equipmentStatusBreakdown = Object.entries(analytics?.equipment_status ?? {}).map(
    ([status, count]) => ({ name: status, value: count }),
  );

  // ---- Derived from `GET /api/findings` ----------------------------------

  const findingsSample = findings ?? [];

  const reviewOutcomes = Object.entries(
    findingsSample.reduce<Record<string, number>>((accumulator, finding) => {
      const state = finding.resolutionState;
      accumulator[state] = (accumulator[state] ?? 0) + 1;
      return accumulator;
    }, {}),
  ).map(([state, count]) => ({
    name: REVIEW_STATE_LABELS[state as FindingStatus] ?? state,
    value: count,
  }));

  /** Daily counts for the findings in the sample; days without findings are absent. */
  const findingsPerDay = Object.entries(
    findingsSample.reduce<Record<string, number>>((accumulator, finding) => {
      const day = finding.createdAt.slice(0, 10);
      accumulator[day] = (accumulator[day] ?? 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  /**
   * Sample captions must never read "0 of 0 records" when the call itself
   * failed — that presents a broken backend as an empty database.
   */
  const findingsSampleNote = findingsFailed
    ? "The sample is unavailable because GET /api/findings failed."
    : `Built from the ${findingsSample.length} finding(s) returned by GET /api/findings. That endpoint caps its list at 100 records and applies no ordering, so past 100 this is a sample rather than the full history.`;

  // ---- Derived from `GET /api/inspections` -------------------------------

  const timedDurationsMs = (inspections ?? [])
    .map((inspection) => inspection.duration ?? 0)
    .filter((ms) => ms > 0);
  const latencyBuckets = bucketLatencies(timedDurationsMs);

  const inspectionsSampleNote = inspectionsFailed
    ? "The sample is unavailable because GET /api/inspections failed."
    : `${timedDurationsMs.length} of ${inspections?.length ?? 0} inspection(s) returned by GET /api/inspections report a duration. That endpoint caps its list at 50 records and applies no ordering.`;

  // ---- Derived from `GET /api/agent/runs` --------------------------------

  const toolUtilization = (() => {
    const invocations: Record<string, number> = {};
    const succeeded: Record<string, number> = {};
    for (const run of agentRuns ?? []) {
      for (const call of run.toolCalls) {
        invocations[call.tool] = (invocations[call.tool] ?? 0) + 1;
        if (call.success) succeeded[call.tool] = (succeeded[call.tool] ?? 0) + 1;
      }
    }
    return Object.entries(invocations)
      .map(([tool, count]) => ({
        tool,
        invocations: count,
        succeeded: succeeded[tool] ?? 0,
      }))
      .sort((a, b) => b.invocations - a.invocations);
  })();

  const runStatusSummary = Object.entries(
    (agentRuns ?? []).reduce<Record<string, number>>((accumulator, run) => {
      accumulator[run.status] = (accumulator[run.status] ?? 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([status, count]) => `${count} ${status}`)
    .join(" · ");

  const agentRunsSampleNote = agentRunsFailed
    ? "The run sample is unavailable because GET /api/agent/runs failed."
    : `${(agentRuns ?? []).length} run(s) read from GET /api/agent/runs, which returns up to 50 runs newest first.`;

  // ---- Equipment name lookup for priority findings ----------------------

  const equipmentNames = new Map((equipment ?? []).map((record) => [record.id, record.name]));
  const equipmentLabel = (id: string) => equipmentNames.get(id) ?? `Equipment ${id.slice(0, 8)}`;

  const health = analytics?.system_health;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-display font-bold text-gradient-hero">
              Analytics &amp; Performance
            </h1>
            <p className="mt-1 max-w-2xl text-secondary-text">
              Every figure on this page is computed from the backend API and labelled with the
              endpoint it came from. Nothing is estimated, seeded or hardcoded.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                Activity window: last {TREND_WINDOW_DAYS} days
              </Badge>
              <Badge variant="outline">Counters: all time</Badge>
              <Badge variant="warning">
                No detection-accuracy figures here — benchmark metrics are measured on a synthetic
                corpus only (Benchmarks page)
              </Badge>
            </div>
          </div>
          {findings && !findingsFailed ? (
            <ExportButton
              rows={findings}
              columns={[
                "id",
                "equipmentId",
                "inspectionId",
                "category",
                "severity",
                "confidence",
                "verificationStatus",
                "resolutionState",
                "createdAt",
              ]}
              name="findings"
            />
          ) : null}
        </div>
      </motion.div>

      {/* Primary failure banner: this endpoint feeds most of the page. */}
      {analyticsFailed ? (
        <ApiFailure
          endpoint="GET /api/analytics/overview"
          error={analyticsError}
          variant="banner"
        />
      ) : null}

      {/* Summary cards — all values read straight off the overview payload. */}
      {analyticsLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[124px] w-full" />
          ))}
        </div>
      ) : analytics ? (
        <>
          <motion.div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            variants={stagger.rail}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={entry.boot}>
              <MetricCard
                title="Inspections recorded"
                value={analytics.total_inspections}
                change={
                  hasComparisonWindow
                    ? `${inspectionsDelta > 0 ? "+" : ""}${inspectionsDelta} vs the previous 7 days`
                    : undefined
                }
                trend={
                  !hasComparisonWindow || inspectionsDelta === 0
                    ? "neutral"
                    : inspectionsDelta > 0
                      ? "up"
                      : "down"
                }
                icon={
                  <IconTile>
                    <Scan className="h-4 w-4 text-primary" />
                  </IconTile>
                }
              />
            </motion.div>
            <motion.div variants={entry.boot}>
              <MetricCard
                title="Equipment monitored"
                value={analytics.total_equipment}
                icon={
                  <IconTile>
                    <Package className="h-4 w-4 text-primary" />
                  </IconTile>
                }
              />
            </motion.div>
            <motion.div variants={entry.boot}>
              <MetricCard
                title="Findings awaiting review"
                value={analytics.pending_review}
                icon={
                  <IconTile>
                    <Clock className="h-4 w-4 text-warning" />
                  </IconTile>
                }
              />
            </motion.div>
            <motion.div variants={entry.boot}>
              <MetricCard
                title="Confirmed findings"
                value={analytics.confirmed_findings}
                icon={
                  <IconTile>
                    <ShieldCheck className="h-4 w-4 text-success" />
                  </IconTile>
                }
              />
            </motion.div>
            <motion.div variants={entry.boot}>
              <MetricCard
                title="Open maintenance tickets"
                value={analytics.open_tickets}
                change={`${analytics.completed_tickets} closed`}
                trend="neutral"
                icon={
                  <IconTile>
                    <Wrench className="h-4 w-4 text-primary" />
                  </IconTile>
                }
              />
            </motion.div>
            <motion.div variants={entry.boot}>
              <MetricCard
                title="Avg. inspection duration"
                value={analytics.avg_processing_ms > 0 ? formatDuration(analytics.avg_processing_ms) : "—"}
                change={
                  analytics.avg_processing_ms > 0
                    ? "Mean of duration_ms > 0"
                    : "No inspection has recorded a duration yet"
                }
                trend="neutral"
                icon={
                  <IconTile>
                    <Activity className="h-4 w-4 text-primary" />
                  </IconTile>
                }
              />
            </motion.div>
          </motion.div>

          <p className="text-xs text-secondary-text">
            Source: <code className="font-mono">GET /api/analytics/overview</code>. These counters are
            cumulative for your organisation; the <code className="font-mono">days</code> parameter
            scopes only the inspection activity trend below.
          </p>
        </>
      ) : null}

      {/* Charts row 1 — both from the overview payload. */}
      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Inspection activity — last {TREND_WINDOW_DAYS} days
            </CardTitle>
            <CardDescription>
              Inspections counted by start date. Days with no inspections are omitted rather than
              drawn as zero bars.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Panel
              rows={activeTrendDays}
              isLoading={analyticsLoading}
              isError={analyticsFailed}
              error={analyticsError}
              endpoint="GET /api/analytics/overview"
              emptyMessage={`No inspections were started in the last ${TREND_WINDOW_DAYS} days.`}
              emptyHint="Running an inspection adds a point here; older inspections sit outside this window."
            >
              {(rows) => (
                <MeasuredBarChart
                  data={rows}
                  xKey="date"
                  bars={[{ key: "count", name: "Inspections", color: chartPalette.primary }]}
                />
              )}
            </Panel>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Findings by category</CardTitle>
            <CardDescription>
              Every finding stored for this organisation, grouped by detection category in{" "}
              <code className="font-mono">finding_categories</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Panel
              rows={findingsByCategory}
              isLoading={analyticsLoading}
              isError={analyticsFailed}
              error={analyticsError}
              endpoint="GET /api/analytics/overview"
              emptyMessage="No findings have been recorded yet."
              emptyHint="Findings appear once an inspection has completed its analysis pass."
              skeletonClassName="h-[240px] w-full"
            >
              {(rows) => <MeasuredPieChart data={rows} />}
            </Panel>
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts row 2 — overview payload plus real reviewer decisions. */}
      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Equipment status mix</CardTitle>
            <CardDescription>
              Non-archived equipment grouped by status in{" "}
              <code className="font-mono">equipment_status</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Panel
              rows={equipmentStatusBreakdown}
              isLoading={analyticsLoading}
              isError={analyticsFailed}
              error={analyticsError}
              endpoint="GET /api/analytics/overview"
              emptyMessage="No equipment is registered yet."
              emptyHint="Register equipment to populate this breakdown."
              skeletonClassName="h-[240px] w-full"
            >
              {(rows) => <MeasuredPieChart data={rows} />}
            </Panel>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Reviewer decisions on findings</CardTitle>
            <CardDescription>
              Count of findings per <code className="font-mono">resolution_state</code>.{" "}
              {findingsSampleNote}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Panel
              rows={reviewOutcomes}
              isLoading={findingsLoading}
              isError={findingsFailed}
              error={findingsError}
              endpoint="GET /api/findings"
              emptyMessage="No findings have been reviewed yet."
              emptyHint="Review a finding on the Findings page to record a decision."
              skeletonClassName="h-[240px] w-full"
            >
              {(rows) => <MeasuredPieChart data={rows} />}
            </Panel>
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts row 3 — measured durations and real tool invocations. */}
      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Measured inspection duration
            </CardTitle>
            <CardDescription>
              Inspections bucketed by measured wall-clock time; rows still carrying{" "}
              <code className="font-mono">duration_ms = 0</code> are excluded because they never
              reached completion. {inspectionsSampleNote}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Panel
              rows={latencyBuckets}
              isLoading={inspectionsLoading}
              isError={inspectionsFailed}
              error={inspectionsError}
              endpoint="GET /api/inspections"
              emptyMessage="No inspection has recorded a completion time yet."
              emptyHint="Duration is measured wall-clock time and is written when a run finishes."
            >
              {(rows) => (
                <MeasuredBarChart
                  data={rows}
                  xKey="range"
                  bars={[{ key: "count", name: "Inspections", color: chartPalette.secondary }]}
                />
              )}
            </Panel>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Agent tool invocations</CardTitle>
            <CardDescription>
              Real <code className="font-mono">tool_calls</code> rows, grouped by tool name.{" "}
              {agentRunsSampleNote}
              {runStatusSummary ? ` Run states: ${runStatusSummary}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Panel
              rows={toolUtilization}
              isLoading={agentRunsLoading}
              isError={agentRunsFailed}
              error={agentRunsError}
              endpoint="GET /api/agent/runs"
              emptyMessage="No agent run has invoked a tool yet."
              emptyHint="Tool calls are written as each inspection's agent works through its budget."
            >
              {(rows) => (
                <MeasuredBarChart
                  data={rows}
                  xKey="tool"
                  bars={[
                    { key: "invocations", name: "Invocations", color: chartPalette.primary },
                    { key: "succeeded", name: "Succeeded", color: chartPalette.success },
                  ]}
                />
              )}
            </Panel>
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts row 4 — daily findings curve and live backend state. */}
      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Findings raised per day</CardTitle>
            <CardDescription>
              Daily counts keyed on <code className="font-mono">created_at</code>; dates without
              findings are not plotted. {findingsSampleNote}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Panel
              rows={findingsPerDay}
              isLoading={findingsLoading}
              isError={findingsFailed}
              error={findingsError}
              endpoint="GET /api/findings"
              emptyMessage="No findings have been raised yet."
              emptyHint="This curve needs at least one stored finding."
              skeletonClassName="h-[260px] w-full"
            >
              {(rows) => (
                <CustomLineChart
                  data={rows}
                  xKey="date"
                  lines={[{ key: "count", name: "Findings raised", color: chartPalette.accentReadable }]}
                />
              )}
            </Panel>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Backend component state</CardTitle>
            <CardDescription>
              Read from <code className="font-mono">system_health</code> on{" "}
              <code className="font-mono">GET /api/analytics/overview</code>
              , which reports the process as it runs rather than a configured ideal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsFailed ? (
              <ApiFailure
                endpoint="GET /api/analytics/overview"
                error={analyticsError}
              />
            ) : analyticsLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : health ? (
              <ul className="space-y-3">
                <li className="flex items-center justify-between rounded-lg bg-surface/20 p-3">
                  <span className="text-sm text-secondary-text">Database</span>
                  <span className="flex items-center gap-2 text-sm text-primary-text">
                    <StatusDot status={health.database ? "online" : "offline"} />
                    {health.database ? "Connected" : "Not reachable"}
                  </span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-surface/20 p-3">
                  <span className="text-sm text-secondary-text">OpenCV runtime version</span>
                  <span className="font-mono text-sm text-primary-text">{health.opencv}</span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-surface/20 p-3">
                  <span className="text-sm text-secondary-text">Redis</span>
                  <span className="flex items-center gap-2 text-sm text-primary-text">
                    <StatusDot status={health.redis ? "online" : "idle"} />
                    {health.redis ? "Broker URL configured" : "No broker configured"}
                  </span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-surface/20 p-3">
                  <span className="text-sm text-secondary-text">Processing mode</span>
                  <span className="font-mono text-sm text-primary-text">{health.processing_mode}</span>
                </li>
                <li className="pt-1 text-xs text-secondary-text">
                  Redis reflects configuration only — nothing currently enqueues jobs, so a configured
                  broker is not a claim that a queue is running.
                </li>
              </ul>
            ) : (
              <EmptyMessage
                message="No component state was returned."
                hint="The overview call succeeded but its system_health field was absent."
              />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Honest inventory of what the deployment claims it can do. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65 }}
      >
        <CapabilitiesPanel />
      </motion.div>

      {/* Real record lists the overview payload already returns. */}
      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Critical findings awaiting a decision
            </CardTitle>
            <CardDescription>
              The 10 newest critical findings whose <code className="font-mono">resolution_state</code>{" "}
              is pending-review or in-progress, read from{" "}
              <code className="font-mono">priority_findings</code>.{" "}
              {equipmentFailed
                ? "Equipment names could not be loaded from GET /api/equipment, so IDs are shown."
                : "Names resolve through GET /api/equipment, which returns up to 50 records; anything outside that shows its ID."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Panel
              rows={analytics?.priority_findings ?? []}
              isLoading={analyticsLoading}
              isError={analyticsFailed}
              error={analyticsError}
              endpoint="GET /api/analytics/overview"
              emptyMessage="No critical findings are waiting for review."
              emptyHint="Critical findings appear here the moment an inspection records one."
              skeletonClassName="h-[220px] w-full"
            >
              {(rows) => (
                <ul className="space-y-2">
                  {rows.map((finding) => (
                    <li
                      key={finding.id}
                      className="flex items-start justify-between gap-3 rounded-lg bg-surface/20 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-primary-text">
                          {finding.category}
                        </p>
                        <p className="truncate text-xs text-secondary-text">
                          {equipmentLabel(finding.equipment_id)} · raised {formatDate(finding.created_at)}
                        </p>
                      </div>
                      <Badge variant={SEVERITY_BADGE[finding.severity] ?? "outline"}>
                        {finding.severity}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Recent agent activity</CardTitle>
            <CardDescription>
              The 10 newest agent runs joined to your inspections, read from{" "}
              <code className="font-mono">agent_activity_feed</code>. Iterations are counted per run
              and budget is the unitless tool cost the workflow charges. No budget percentage is
              shown because the limit itself is a code default that the API does not return.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Panel
              rows={analytics?.agent_activity_feed ?? []}
              isLoading={analyticsLoading}
              isError={analyticsFailed}
              error={analyticsError}
              endpoint="GET /api/analytics/overview"
              emptyMessage="No agent runs have been recorded yet."
              emptyHint="Runs are logged as inspections move through the state machine."
              skeletonClassName="h-[220px] w-full"
            >
              {(rows) => (
                <ul className="space-y-2">
                  {rows.map((run) => (
                    <li
                      key={run.run_id}
                      className="flex items-start justify-between gap-3 rounded-lg bg-surface/20 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-primary-text">
                          {run.equipment}
                        </p>
                        <p className="truncate text-xs text-secondary-text">
                          {run.iterations} iteration(s) · {run.budget_used.toFixed(1)} budget units ·{" "}
                          {run.started_at ? formatDate(run.started_at) : "Start time not recorded"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          RUN_STATUS_BADGE[run.status as AgentRun["status"]] ?? "outline"
                        }
                      >
                        {run.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
