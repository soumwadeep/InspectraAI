"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { entry, stagger } from "@/lib/motion/presets";
import type { CountedGroup, ReportModel, ReportSourceState, SectionScope } from "./report-data";

function num(value: number | undefined, digits = 3): string {
  if (value === undefined) return "not measured";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

function TallyRow({ title, groups }: { title: string; groups: CountedGroup[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 text-sm">
      <span className="text-kicker uppercase text-secondary-text">{title}</span>
      {groups.length === 0 ? (
        <span className="text-warning">none in window</span>
      ) : (
        groups.map((group) => (
          <Badge key={group.name} variant="outline" className="telemetry">
            {group.name} · {group.count}
          </Badge>
        ))
      )}
    </div>
  );
}

function SectionShell({
  index,
  title,
  empty,
  unavailable,
  children,
}: {
  index: string;
  title: string;
  empty: boolean;
  unavailable?: ReportSourceState;
  children: React.ReactNode;
}) {
  return (
    <motion.section variants={entry.boot}>
      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">
            <span className="telemetry mr-2 text-secondary-text">{index}</span>
            {title}
          </CardTitle>
          {unavailable?.failed ? (
            <CardDescription className="text-critical">
              <code className="font-mono">{unavailable.endpoint}</code> failed while building this
              report. The section is missing data — it is not showing zero.
            </CardDescription>
          ) : empty ? (
            <CardDescription className="text-warning">
              No rows in this window — nothing to report, which is stated rather than drawn as
              zeros.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {unavailable?.failed ? (
            <p className="text-sm text-secondary-text">
              Retry once the API answers this endpoint again; until then this section carries no
              claims.
            </p>
          ) : (
            children
          )}
        </CardContent>
      </Card>
    </motion.section>
  );
}

/**
 * How many rows a section covers, phrased by provenance: a SQL count is the
 * whole organization in the window, a list-page count is only what a capped
 * endpoint returned, and saying so is the difference between a figure and a
 * misleading one.
 */
function WindowLine({ scope }: { scope: SectionScope }) {
  return (
    <p className="telemetry text-sm text-secondary-text">
      {scope.counted_by === "sql"
        ? `${scope.inWindow} row(s) counted in SQL over the whole organization`
        : `${scope.inWindow} of ${scope.total} returned rows in window`}
      {scope.undated > 0 ? ` · ${scope.undated} row(s) had no readable timestamp and were excluded` : ""}
    </p>
  );
}

/**
 * On-screen report. Every number is a count, tally or quantile of the rows the
 * API returned for this organization in the selected window; headings are fixed
 * labels, never generated prose.
 */
export function ReportDocument({ model }: { model: ReportModel }) {
  const { inspections, findings, tickets, agentRuns, benchmarks } = model;

  return (
    <motion.div
      className="space-y-5"
      variants={stagger.rail}
      initial="hidden"
      animate="visible"
    >
      {/* Scope header */}
      <motion.div variants={entry.boot}>
        <Card className="border-primary/25">
          <CardHeader>
            <CardTitle className="text-primary-text">Scope</CardTitle>
            <CardDescription>
              {model.organization
                ? `Organization ${model.organization.id} · requested by ${model.organization.email} (${model.organization.role})`
                : "No session user record was available, so the organization is whatever the stored token maps to server-side."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-secondary-text">
            <p>
              <span className="text-kicker uppercase">Window</span> {model.window.label}
              {model.serverScope?.window_start
                ? ` — from ${model.serverScope.window_start.slice(0, 10)} to generation time, counted server-side`
                : model.windowStart
                  ? ` — from ${model.windowStart.toISOString().slice(0, 10)} to generation time`
                  : " — every row the sources returned"}
            </p>
            <p>
              <span className="text-kicker uppercase">Generated</span>{" "}
              <span className="telemetry">
                {model.serverScope?.generated_at ?? model.generatedAt.toISOString()}
              </span>{" "}
              ({model.serverScope ? "API clock" : "browser clock — the API did not answer"})
            </p>
            <p className="text-xs">
              {model.serverScope ? (
                <>
                  Inspections, findings, tickets and agent runs are{" "}
                  {model.serverScope.aggregation.toLowerCase()}. Benchmark metrics read{" "}
                  <code className="font-mono">GET /api/benchmarks</code>, which is uncapped and
                  newest-first.
                </>
              ) : (
                <>Built from rows returned by <code className="font-mono">GET /api/inspections</code>,{" "}
                <code className="font-mono">/api/findings</code>, <code className="font-mono">/api/tickets</code>,{" "}
                <code className="font-mono">/api/agent/runs</code> and <code className="font-mono">/api/benchmarks</code>.
                Those endpoints cap their lists (API defaults: findings 100, tickets 100, inspections
                50, agent runs 50), so this report covers the rows those calls returned — a history
                longer than the cap is truncated at the cap, and each section states how many rows
                were available. <code className="font-mono">/api/benchmarks</code> has no cap and is
                newest-first.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <SectionShell
        index="01"
        title="Inspections"
        empty={inspections.scope.inWindow === 0}
        unavailable={model.sources.inspections}
      >
        <WindowLine
          scope={inspections.scope}
          
          
        />
        <TallyRow title="Status" groups={inspections.byStatus} />
        <p className="text-sm text-secondary-text">
          <span className="text-kicker uppercase">Measured duration</span>{" "}
          {inspections.durations.measured === 0
            ? "no completed row in the window carried a duration"
            : `${inspections.durations.measured} measured · min ${num(
                inspections.durations.min_ms,
                1,
              )} ms · median ${num(inspections.durations.median_ms, 1)} ms · max ${num(
                inspections.durations.max_ms,
                1,
              )} ms`}
        </p>
      </SectionShell>

      <SectionShell
        index="02"
        title="Findings"
        empty={findings.scope.inWindow === 0}
        unavailable={model.sources.findings}
      >
        <WindowLine
          scope={findings.scope}
          
          
        />
        <TallyRow title="Severity" groups={findings.bySeverity} />
        <TallyRow title="Category" groups={findings.byCategory} />
        <TallyRow title="Verification" groups={findings.byVerification} />
        <TallyRow title="Resolution state" groups={findings.byResolutionState} />
      </SectionShell>

      <SectionShell
        index="03"
        title="Maintenance tickets"
        empty={tickets.scope.inWindow === 0}
        unavailable={model.sources.tickets}
      >
        <WindowLine
          scope={tickets.scope}
          
          
        />
        <TallyRow title="Status" groups={tickets.byStatus} />
        <TallyRow title="Priority" groups={tickets.byPriority} />
        <p className="text-sm text-secondary-text">
          <span className="text-kicker uppercase">Overdue</span> {tickets.overdue} (due_date before
          generation time, status not closed)
        </p>
      </SectionShell>

      <SectionShell
        index="04"
        title="Agent runs"
        empty={agentRuns.scope.inWindow === 0}
        unavailable={model.sources.agentRuns}
      >
        <WindowLine
          scope={agentRuns.scope}
          
          
        />
        <TallyRow title="Status" groups={agentRuns.byStatus} />
        <p className="telemetry text-sm text-secondary-text">
          {agentRuns.total_iterations} iterations · {num(agentRuns.total_budget_used, 1)} budget
          units · {agentRuns.total_tool_calls} tool calls (sums over the rows in window)
        </p>
        <p className="text-sm text-secondary-text">
          <span className="text-kicker uppercase">Run span</span>{" "}
          {agentRuns.durations.measured === 0
            ? "no run in the window returned both start and end times"
            : `${agentRuns.durations.measured} measured · min ${num(
                agentRuns.durations.min_ms,
                1,
              )} ms · median ${num(agentRuns.durations.median_ms, 1)} ms · max ${num(
                agentRuns.durations.max_ms,
                1,
              )} ms`}
        </p>
      </SectionShell>

      <SectionShell
        index="05"
        title="Benchmark runs"
        empty={benchmarks.runs.inWindow.length === 0}
        unavailable={model.sources.benchmarks}
      >
        {benchmarks.runs.inWindow.length > 0 && (
          <>
            {/* Benchmarks stay a list read on purpose: the section needs the row
                objects to parse the latest run's metrics, and /api/benchmarks is
                uncapped and newest-first, so "returned rows" is accurate here. */}
            <WindowLine
              scope={{
                inWindow: benchmarks.runs.inWindow.length,
                total: benchmarks.runs.totalReturned,
                undated: benchmarks.runs.undated,
                counted_by: "list-page",
              }}
            />
            {benchmarks.latest ? (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                <p className="font-medium text-primary-text">
                  Newest run in window: {benchmarks.latest.name}
                </p>
                <p className="mt-1 text-xs text-secondary-text">
                  Measured on a labelled <span className="text-primary-text">synthetic</span> corpus
                  ({num(benchmarks.latest.pairs)} pairs, seed {num(benchmarks.latest.seed)}) — these
                  are not accuracy figures for real plant imagery.
                </p>
                <p className="telemetry mt-2 text-secondary-text">
                  precision {num(benchmarks.latest.precision)} · recall {num(benchmarks.latest.recall)}{" "}
                  · F1 {num(benchmarks.latest.f1_score)} · mean IoU {num(benchmarks.latest.mean_iou)}
                </p>
                <p className="telemetry text-secondary-text">
                  category accuracy {num(benchmarks.latest.accuracy)} ({num(benchmarks.latest.correct)}{" "}
                  of {num(benchmarks.latest.scored)}) · pipeline {num(benchmarks.latest.pipeline_ms, 1)}{" "}
                  ms · per-pair {num(benchmarks.latest.per_pair_ms, 1)} ms
                </p>
              </div>
            ) : (
              <p className="text-sm text-warning">
                The newest run in the window stored no parseable results.
              </p>
            )}
          </>
        )}
      </SectionShell>
    </motion.div>
  );
}
