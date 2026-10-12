"use client";

/**
 * The run list — a selector, not a spreadsheet.
 *
 * Every cell is a field the run list endpoint returned. Two things that used to sit
 * in this table are gone on purpose: the budget column rendered `n / 20`, and 20 was
 * never returned by anything (the ceiling the agent states in its own final report is
 * 100), and the row action linked to `/dashboard/agent/{id}`, a route that does not
 * exist. Selection now happens in place and is mirrored to `?run=` so a run is
 * shareable.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";

import {
  budgetCeilingFromTrace,
  formatServerStamp,
  isStateTransition,
  runStatusVariant,
  stepAction,
} from "@/components/agent/agent-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { entry, stagger } from "@/lib/motion/presets";
import { AlertTriangle, RefreshCw, Search } from "@/components/icons";
import type { AgentRun } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RunListProps {
  runs: AgentRun[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
}

export function RunList({
  runs,
  selectedId,
  onSelect,
  isLoading,
  errorMessage,
  onRetry,
}: RunListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter((run) =>
      [run.id, run.inspectionId, run.equipmentName ?? "", run.status, stepActionsKey(run)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [runs, query]);

  const pausedCount = runs.filter((run) => run.status === "paused").length;

  return (
    <div className="panel flex h-full flex-col rounded-xl">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-kicker uppercase text-secondary-text">
            Agent runs {isLoading ? "(…)" : `(${runs.length})`}
          </p>
          {pausedCount > 0 && (
            <Badge variant="warning" className="text-[10px]">
              {pausedCount} awaiting input
            </Badge>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary-text" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by run, inspection, equipment, status, action…"
            className="pl-8 text-xs"
            aria-label="Filter agent runs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-3">
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        )}

        {!isLoading && errorMessage && (
          <div className="space-y-3 p-1">
            <p className="flex items-start gap-2 text-sm text-critical-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {errorMessage}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Retry request
            </Button>
          </div>
        )}

        {!isLoading && !errorMessage && runs.length === 0 && (
          <p className="p-2 text-sm text-secondary-text">
            No agent runs exist for this organization yet. The list fills as soon as an
            inspection reaches the agent loop.
          </p>
        )}

        {!isLoading && !errorMessage && runs.length > 0 && filtered.length === 0 && (
          <p className="p-2 text-sm text-secondary-text">
            {runs.length} run(s) returned, none matching “{query}”.
          </p>
        )}

        {!isLoading && !errorMessage && (
          <motion.ul
            className="space-y-2"
            variants={stagger.rail}
            initial="hidden"
            animate="visible"
          >
            {filtered.map((run) => (
              <RunListItem
                key={run.id}
                run={run}
                selected={run.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </motion.ul>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="border-t border-border px-4 py-2 telemetry text-[10px] text-secondary-text">
          showing {filtered.length} of {runs.length} returned runs
        </p>
      )}
    </div>
  );
}

function stepActionsKey(run: AgentRun): string {
  return run.steps.map((step) => stepAction(step)).join(" ");
}

function RunListItem({
  run,
  selected,
  onSelect,
}: {
  run: AgentRun;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const edges = run.steps.filter((step) => isStateTransition(step)).length;
  const ceiling = budgetCeilingFromTrace(run.steps);

  return (
    <motion.li variants={entry.boot}>
      <button
        type="button"
        onClick={() => onSelect(run.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "w-full rounded-lg border p-3 text-left transition-colors",
          selected
            ? "border-primary/60 bg-primary/5"
            : "border-border bg-surface/30 hover:border-border-hover hover:bg-surface/50",
          run.status === "paused" && !selected && "border-warning/40",
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 truncate">
            <StatusMark run={run} />
            <span className="truncate text-sm font-medium text-primary-text">
              {run.equipmentName && run.equipmentName !== "Unknown"
                ? run.equipmentName
                : "equipment not returned"}
            </span>
          </span>
          <Badge variant={runStatusVariant[run.status]} className="shrink-0 text-[10px]">
            {run.status}
          </Badge>
        </span>

        <span className="mt-2 block truncate telemetry text-[11px] text-secondary-text">
          {run.id}
        </span>

        <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 telemetry text-[11px] sm:grid-cols-3">
          <Field label="iterations" value={String(run.iterations)} />
          <Field
            label="budget used"
            value={ceiling ? `${run.budgetUsed} / ${ceiling}` : String(run.budgetUsed)}
          />
          <Field label="steps" value={String(run.steps.length)} />
          <Field label="tool calls" value={String(run.toolCalls.length)} />
          <Field label="state edges" value={String(edges)} />
          <Field label="started" value={formatServerStamp(run.startTime) ?? "not returned"} />
        </span>
      </button>
    </motion.li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="block min-w-0">
      <span className="block text-[9px] uppercase text-secondary-text/70">{label}</span>
      <span className="block truncate text-primary-text">{value}</span>
    </span>
  );
}

function StatusMark({ run }: { run: AgentRun }) {
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        run.status === "running" && "bg-primary",
        run.status === "completed" && "bg-success",
        run.status === "failed" && "bg-critical",
        run.status === "paused" && "bg-warning",
      )}
      aria-hidden
    />
  );
}
