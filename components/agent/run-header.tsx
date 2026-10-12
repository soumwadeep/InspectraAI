"use client";

/**
 * The selected run's identity block.
 *
 * `agent_runs` has no percentage-complete progress anywhere in the backend, and the
 * pipeline is a single blocking call, so a live run gets an indeterminate marker and
 * the sentence explaining why there is no bar. Nothing here is animated unless the
 * run is genuinely in flight, and that marker is gated on `useReducedMotion()`
 * because framer-motion's `reducedMotion="user"` config does not cover CSS-driven
 * pulses.
 */
import { useReducedMotion } from "framer-motion";
import { motion } from "framer-motion";

import {
  budgetCeilingFromTrace,
  formatServerStamp,
  runStatusDot,
  runStatusVariant,
  summarizeTrace,
} from "@/components/agent/agent-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { RefreshCw } from "@/components/icons";
import type { AgentRun } from "@/lib/types";
import { cn, formatDurationMs } from "@/lib/utils";

interface RunHeaderProps {
  run: AgentRun;
  /** Which response this trace came from, so the reviewer knows what is fresh. */
  source: "run detail" | "run list";
  isFetching: boolean;
  onRefresh: () => void;
}

export function RunHeader({ run, source, isFetching, onRefresh }: RunHeaderProps) {
  const summary = summarizeTrace(run.steps, run.toolCalls);
  const ceiling = budgetCeilingFromTrace(run.steps);
  const wallClock = elapsedBetween(run.startTime, run.endTime);

  return (
    <div className="panel rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusDot status={runStatusDot[run.status]} size="sm" />
            <Badge variant={runStatusVariant[run.status]} className="text-[10px]">
              {run.status}
            </Badge>
            {run.status === "running" && <IndeterminateRunning />}
            <span className="telemetry text-[10px] uppercase text-secondary-text/70">
              trace from {source}
            </span>
          </div>
          <p className="mt-2 break-all telemetry text-sm font-semibold text-primary-text">
            {run.id}
          </p>
          <p className="mt-1 text-xs text-secondary-text">
            {run.equipmentName && run.equipmentName !== "Unknown"
              ? run.equipmentName
              : "equipment name not returned on this response"}
            {" · inspection "}
            <span className="telemetry text-[11px]">{run.inspectionId}</span>
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isFetching}
          title="Re-fetch this run's steps, tool calls and findings"
        >
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isFetching && "animate-spin")} />
          {isFetching ? "refetching" : "Refresh trace"}
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Stat label="iterations" value={String(run.iterations)} />
        <Stat
          label="budget used"
          value={ceiling ? `${run.budgetUsed} of ${ceiling} stated` : String(run.budgetUsed)}
          hint={
            ceiling
              ? "ceiling read out of the run's own final report step"
              : "the run returned no budget ceiling, so none is shown"
          }
        />
        <Stat
          label="final_action"
          value={run.finalAction ?? "null on the run row"}
          muted={!run.finalAction}
        />
        <Stat
          label="started (UTC)"
          value={formatServerStamp(run.startTime) ?? "not returned"}
        />
        <Stat
          label="ended (UTC)"
          value={formatServerStamp(run.endTime) ?? (run.status === "paused" ? "not ended — paused" : "not returned")}
        />
        <Stat
          label="elapsed start→end"
          value={wallClock ?? "not derivable"}
          hint="derived: difference of the two returned timestamps"
        />
        <Stat
          label="steps / state edges"
          value={`${summary.toolSteps} / ${summary.stateEdges}`}
          hint="counted from the returned trace"
        />
        <Stat
          label="recorded step time"
          value={`${summary.recordedStepMs} ms`}
          hint="derived: sum of step duration_ms"
        />
        <Stat
          label="tool call rows"
          value={`${run.toolCalls.length}${
            summary.failedToolCalls ? `, ${summary.failedToolCalls} unsuccessful` : ""
          }`}
        />
        <Stat
          label="human-interaction steps"
          value={String(summary.humanSteps)}
        />
      </dl>

      {isFetching && (
        <p className="mt-3 text-[11px] text-secondary-text">
          Refetching the persisted trace — step rows are appended, never rewritten.
        </p>
      )}
    </div>
  );
}

/** Naive UTC on both ends, so the difference is offset-independent. */
function elapsedBetween(start: string, end?: string): string | null {
  if (!end) return null;
  const startMs = Date.parse(start.endsWith("Z") ? start : `${start}Z`);
  const endMs = Date.parse(end.endsWith("Z") ? end : `${end}Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return formatDurationMs(endMs - startMs);
}

function Stat({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-kicker uppercase text-secondary-text">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm font-semibold",
          muted ? "text-secondary-text/70" : "text-primary-text",
        )}
        title={value}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-[10px] leading-snug text-secondary-text/60">{hint}</p>}
    </div>
  );
}

function IndeterminateRunning() {
  const reduce = useReducedMotion();

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5">
      {reduce ? (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
      ) : (
        <motion.span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-primary"
          animate={{ opacity: [1, 0.25, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
        in flight · no progress endpoint exists
      </span>
    </span>
  );
}
