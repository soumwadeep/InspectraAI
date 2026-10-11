"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnalyticsOverview, useSystemHealth } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type RowState = "online" | "offline" | "uninstrumented";

interface Row {
  label: string;
  value: string;
  state: RowState;
  /** Explains a row that has no measurement behind it. */
  note?: string;
}

const stateDot: Record<RowState, string> = {
  online: "bg-success",
  offline: "bg-critical",
  uninstrumented: "bg-secondary-text/50",
};

const stateText: Record<RowState, string> = {
  online: "text-success",
  offline: "text-critical",
  uninstrumented: "text-secondary-text",
};

/**
 * Process state read from `/health` and the analytics overview.
 *
 * Anything nothing measures is labelled "not instrumented". This panel used to
 * show "Processing Queue — 2 pending" and "Agent Workers — 3 active" as literals
 * on an app with no queue and no worker pool.
 */
export function SystemHealthPanel() {
  const { data: health, isLoading, isError } = useSystemHealth();
  const { data: analytics } = useAnalyticsOverview();

  const migrationsMissing = health?.schema_revision.startsWith("migrations") ?? false;
  const processingMode = analytics?.system_health?.processing_mode;
  const redisConfigured = analytics?.system_health?.redis === true;

  const rows: Row[] = [
    {
      label: "Vision Engine",
      value: health ? "Responding" : "Unreachable",
      state: health ? "online" : "offline",
    },
    {
      label: "Database",
      value: health?.database === "connected" ? "Connected" : "Disconnected",
      state: health?.database === "connected" ? "online" : "offline",
    },
    {
      label: "Schema revision",
      value: health?.schema_revision ?? "—",
      state: migrationsMissing ? "offline" : "online",
      note: migrationsMissing
        ? "Run: python3 -m scripts.bootstrap_db from backend/"
        : undefined,
    },
    { label: "OpenCV", value: health?.opencv ?? "—", state: health?.opencv ? "online" : "offline" },
    {
      label: "Processing",
      value: processingMode === "configured" ? "Broker configured" : "In-process",
      state: "online",
      note: "Inspections run inside the API request; there is no worker pool",
    },
    {
      label: "Queue depth",
      value: "Not instrumented",
      state: "uninstrumented",
      note: "No job queue exists, so there is nothing to report",
    },
    {
      label: "Redis",
      value: redisConfigured ? "Configured" : "Not configured",
      state: redisConfigured ? "online" : "uninstrumented",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-primary-text">System Health</CardTitle>
        <p className="text-sm text-secondary-text">Read live from the API process</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-secondary-text">Checking services…</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-lg bg-surface/50 p-3"
              title={row.note}
            >
              <span className="text-sm text-secondary-text">{row.label}</span>
              <span className="flex items-center gap-2 text-right">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    stateDot[row.state],
                    row.state === "online" && "animate-pulse-glow",
                  )}
                  aria-hidden
                />
                <span className={cn("text-xs font-medium", stateText[row.state])}>
                  {row.value}
                </span>
              </span>
            </div>
          ))
        )}
        {isError && (
          <p className="text-xs text-critical">
            The API is not reachable. Start it from <code className="font-mono">backend/</code> with{" "}
            <code className="font-mono">python3 -m uvicorn app.main:app --port 8000</code>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
