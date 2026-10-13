"use client";

/**
 * One inspection, as the pipeline recorded it.
 *
 * The Inspection History table has had an Eye button linking here since the first
 * commit, but the route did not exist, so clicking a row 404'd. `GET
 * /api/inspections/{id}` already returns everything this page shows —
 * { inspection, findings, observations, agent_run } — so no new endpoint was
 * needed, only a page.
 *
 * Every value is read from that payload. Where the row is null the page says
 * "not returned" rather than guessing, because this screen exists so an operator
 * can audit a decision, and an invented number in an audit view is worse than a
 * blank one.
 */
import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";

import { EvidenceGallery } from "@/components/agent/evidence-gallery";
import {
  formatServerStamp,
  parseInspectionPayload,
  runStatusVariant,
} from "@/components/agent/agent-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { AlertTriangle, ArrowLeft, Bot, Clock3, Package } from "@/components/icons";
import { useEquipmentDetail, useInspectionDetail } from "@/lib/hooks";
import { entry } from "@/lib/motion/presets";
import { formatDurationMs } from "@/lib/utils";

export default function InspectionDetailPage() {
  const params = useParams();
  const inspectionId = (params.id as string) ?? "";

  const detail = useInspectionDetail(inspectionId);
  const raw = (detail.data ?? null) as Record<string, unknown> | null;

  const inspection = (raw?.inspection ?? null) as Record<string, unknown> | null;
  const agentRun = (raw?.agent_run ?? null) as Record<string, unknown> | null;
  const observations = Array.isArray(raw?.observations)
    ? (raw!.observations as Record<string, unknown>[])
    : [];

  const findings = useMemo(() => parseInspectionPayload(raw), [raw]);

  const equipmentId = (inspection?.equipment_id as string) ?? "";
  const equipment = useEquipmentDetail(equipmentId);

  if (detail.isLoading && !inspection) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center py-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <AlertTriangle className="h-12 w-12 text-warning/60" />
        <p className="mt-4 text-secondary-text">
          {detail.isError
            ? "The API rejected this request — the inspection may belong to another organization."
            : "No inspection with this id was returned."}
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/dashboard/history">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Inspection History
          </Link>
        </Button>
      </motion.div>
    );
  }

  const status = String(inspection.status ?? "unknown");
  const durationMs = typeof inspection.duration_ms === "number" ? inspection.duration_ms : null;
  const agentRunId = (inspection.agent_run_id as string) ?? "";
  const steps = Array.isArray(agentRun?.steps)
    ? (agentRun!.steps as Record<string, unknown>[])
    : [];

  return (
    <motion.div className="space-y-6" variants={entry.boot} initial="hidden" animate="visible">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/history">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Inspection History
          </Link>
        </Button>
        {agentRunId ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/agent?run=${encodeURIComponent(agentRunId)}`}>
              <Bot className="mr-2 h-4 w-4" />
              Open in Agent Activity
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-display truncate text-primary-text">
                {equipment.data?.name ?? "Loading equipment…"}
              </CardTitle>
              <CardDescription>
                <code className="font-mono text-xs">{inspection.id as string}</code>
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <StatusDot
                status={
                  status === "completed"
                    ? "online"
                    : status === "failed"
                      ? "offline"
                      : status === "awaiting-evidence"
                        ? "warning"
                        : "processing"
                }
                showPulse={status === "processing"}
              />
              <Badge variant={status === "completed" ? "success" : status === "failed" ? "critical" : "info"}>
                {status}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Equipment" value={equipment.data ? (
              <Link href={`/dashboard/equipment/${equipmentId}`} className="text-primary hover:underline">
                {equipment.data.name}
              </Link>
            ) : null} />
            <Field
              label="Measured duration"
              icon={<Clock3 className="h-3 w-3" />}
              value={durationMs === null ? null : formatDurationMs(durationMs)}
            />
            <Field label="Started" value={formatServerStamp(inspection.started_at as string)} />
            <Field label="Ended" value={formatServerStamp(inspection.ended_at as string)} />
            <Field label="Inspector id" value={(inspection.inspector_id as string) ?? null} mono />
            <Field label="Agent run id" value={agentRunId || null} mono />
            <Field label="Findings raised" value={String(findings.length)} />
            <Field label="Observations" value={String(observations.length)} />
          </div>
        </CardContent>
      </Card>

      {agentRun ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Run summary</CardTitle>
            <CardDescription>
              The compact <code className="font-mono">agent_run</code> block returned by{" "}
              <code className="font-mono">GET /api/inspections/{"{id}"}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-2">
                <span className="text-kicker uppercase text-secondary-text">status</span>
                <Badge variant={runStatusVariant[(String(agentRun.status) as keyof typeof runStatusVariant) ?? ""] ?? "outline"}>
                  {String(agentRun.status ?? "not returned")}
                </Badge>
              </span>
              <Metric label="iterations" value={agentRun.iterations} />
              <Metric label="budget used" value={agentRun.budget_used} />
              <Metric label="final action" value={agentRun.final_action} />
            </div>
            {steps.length > 0 ? (
              <>
                {/* This route returns a compact step projection (step_number, action,
                    tool, description, result, duration_ms) — not the full AgentStep
                    document the Agent Activity page renders, which also carries the
                    stored arguments, evidence ref and human-interaction flag. Feeding
                    the compact rows to StepTrace would have left those columns blank
                    and read as an empty trace, so they are shown as what they are. */}
                <p className="mb-3 text-xs text-secondary-text">
                  Compact projection. The full trace, with each step&rsquo;s stored
                  arguments and evidence references, is on the Agent Activity page.
                </p>
                <ol className="space-y-2">
                  {steps.map((step, index) => (
                    <li
                      key={`${String(step.step_number ?? index)}`}
                      className="flex items-start gap-3 rounded-lg border border-border bg-surface/30 px-3 py-2"
                    >
                      <span className="telemetry mt-0.5 w-6 shrink-0 text-[10px] text-secondary-text">
                        {String(step.step_number ?? "—")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary-text">
                            {String(step.action ?? "not returned")}
                          </span>
                          {typeof step.duration_ms === "number" ? (
                            <span className="telemetry text-[10px] text-secondary-text">
                              {step.duration_ms} ms
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-secondary-text">
                          {String(step.description ?? "not returned")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-sm text-secondary-text">
                No steps were returned on this payload. The full trace is on the Agent
                Activity page.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Run summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-secondary-text">
              <code className="font-mono">agent_run</code> is null — no agent run is
              attached to this inspection, so there is no trace to show. This is stated
              rather than drawn as an empty trace.
            </p>
          </CardContent>
        </Card>
      )}

      <EvidenceGallery
        findings={findings}
        isLoading={detail.isLoading}
        errorMessage={detail.isError ? "the inspection request failed" : null}
        inspectionId={inspectionId}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">
            Vision observations ({observations.length})
          </CardTitle>
          <CardDescription>
            Rows from <code className="font-mono">vision_observations</code> — each one a
            region the pipeline measured and stored, attributed to the run that produced it.
            The numbers are the detector&rsquo;s, not a summary of them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {observations.length === 0 ? (
            <p className="text-sm text-secondary-text">
              No observations were recorded for this inspection.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-3 text-kicker uppercase text-secondary-text">type</th>
                    <th className="pb-2 pr-3 text-kicker uppercase text-secondary-text">category</th>
                    <th className="pb-2 pr-3 text-kicker uppercase text-secondary-text">bbox (relative)</th>
                    <th className="pb-2 pr-3 text-kicker uppercase text-secondary-text">confidence</th>
                    <th className="pb-2 pr-3 text-kicker uppercase text-secondary-text">measured</th>
                    <th className="pb-2 text-kicker uppercase text-secondary-text">recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {observations.map((row, index) => {
                    const details =
                      row.details_json && typeof row.details_json === "object"
                        ? (row.details_json as Record<string, unknown>)
                        : null;
                    const measured =
                      details?.measured && typeof details.measured === "object"
                        ? (details.measured as Record<string, unknown>)
                        : null;
                    return (
                      <tr key={String(row.id ?? index)} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs text-primary-text">
                          {String(row.observation_type ?? "not returned")}
                        </td>
                        <td className="py-2 pr-3 text-xs text-primary-text">
                          {row.category ? String(row.category) : "—"}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs tabular-nums text-secondary-text">
                          {bboxLabel(row)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs tabular-nums text-primary-text">
                          {typeof row.confidence === "number" ? row.confidence.toFixed(4) : "not returned"}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[11px] text-secondary-text">
                          {measured ? measuredSummary(measured) : details ? "no measured block" : "not returned"}
                        </td>
                        <td className="py-2 text-xs text-secondary-text">
                          {formatServerStamp(row.created_at as string) ?? "not returned"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Relative bbox, exactly as stored — the columns are separate so nothing is recomputed. */
function bboxLabel(row: Record<string, unknown>): string {
  const keys = ["bbox_x", "bbox_y", "bbox_width", "bbox_height"] as const;
  const values = keys.map((key) => row[key]);
  if (values.some((value) => typeof value !== "number")) return "not returned";
  return `x ${(values[0] as number).toFixed(3)} y ${(values[1] as number).toFixed(3)} · ${(values[2] as number).toFixed(3)}×${(values[3] as number).toFixed(3)}`;
}

function measuredSummary(measured: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(measured)) {
    if (typeof value !== "number") continue;
    parts.push(`${key} ${Number.isInteger(value) ? value : value.toFixed(4)}`);
  }
  return parts.length ? parts.join(" · ") : "empty measured block";
}

function Field({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="flex items-center gap-1.5 text-kicker uppercase text-secondary-text">
        {icon}
        {label}
      </p>
      {value === null || value === undefined || value === "" ? (
        <p className="text-sm text-secondary-text/70">not returned</p>
      ) : (
        <p className={`truncate text-sm font-medium text-primary-text ${mono ? "font-mono text-xs" : ""}`}>
          {value}
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-kicker uppercase text-secondary-text">{label}</span>
      <span className="font-mono text-sm tabular-nums text-primary-text">
        {value === null || value === undefined ? "not returned" : String(value)}
      </span>
    </span>
  );
}
