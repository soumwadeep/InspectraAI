"use client";

/**
 * The persisted `agent_tool_calls` rows for a run.
 *
 * These are separate records from the steps: one row per tool that the executor
 * actually called, each with its own measured wall time, success flag and full
 * result document. A `state_transition` step never appears here because no tool ran,
 * which is exactly why the step trace and this table are two views of the run.
 */
import { motion } from "framer-motion";

import { formatServerStamp } from "@/components/agent/agent-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { entry, stagger } from "@/lib/motion/presets";
import { Table } from "@/components/ui/table";
import type { AgentToolCall } from "@/lib/types";
import { Activity } from "@/components/icons";

interface ToolCallsPanelProps {
  toolCalls: AgentToolCall[];
}

export function ToolCallsPanel({ toolCalls }: ToolCallsPanelProps) {
  const failed = toolCalls.filter((call) => call.success === false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Activity className="h-4 w-4 text-secondary-text" />
          <CardTitle className="text-primary-text">Tool calls as recorded</CardTitle>
          <Badge variant={failed.length ? "critical" : "outline"} className="text-[10px]">
            {toolCalls.length} row(s), {failed.length} marked unsuccessful
          </Badge>
        </div>
        <CardDescription>
          One persisted row per tool the executor invoked, with its measured{" "}
          <code className="telemetry text-xs">duration_ms</code> and result document.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {toolCalls.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-secondary-text">
            No tool-call rows were returned for this run. A run that paused before its
            first tool, or a state-machine-only sequence, legitimately has none.
          </p>
        ) : (
          <Table className="min-w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 text-kicker uppercase text-secondary-text">Tool</th>
                <th className="py-2 pr-3 text-kicker uppercase text-secondary-text">
                  duration_ms
                </th>
                <th className="py-2 pr-3 text-kicker uppercase text-secondary-text">Success</th>
                <th className="py-2 pr-3 text-kicker uppercase text-secondary-text">
                  Started (UTC)
                </th>
                <th className="py-2 text-kicker uppercase text-secondary-text">
                  Result summary
                </th>
              </tr>
            </thead>
            <motion.tbody
              className="divide-y divide-border/60"
              variants={stagger.rail}
              initial="hidden"
              animate="visible"
            >
              {toolCalls.map((call) => (
                <motion.tr
                  key={call.id}
                  variants={entry.boot}
                  className="align-top"
                  title={
                    call.stepId
                      ? `step_id ${call.stepId}`
                      : "this tool call row carries no step_id"
                  }
                >
                  <td className="py-2 pr-3">
                    <code className="text-xs font-medium text-primary">{call.tool}</code>
                    {call.completedAt && (
                      <p className="telemetry mt-0.5 text-[10px] text-secondary-text/70">
                        completed {formatServerStamp(call.completedAt)}
                      </p>
                    )}
                  </td>
                  <td className="py-2 pr-3 telemetry text-xs text-primary-text">
                    {typeof call.duration === "number" ? `${call.duration} ms` : "not returned"}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge
                      variant={call.success ? "success" : "critical"}
                      className="telemetry text-[10px]"
                    >
                      {call.success ? "true" : "false"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 telemetry text-[11px] text-secondary-text">
                    {formatServerStamp(call.startedAt) ?? "not returned"}
                  </td>
                  <td className="py-2">
                    <p className="text-xs leading-relaxed text-primary-text">
                      {call.resultSummary ?? "no result_summary returned"}
                    </p>
                    {call.resultJson && Object.keys(call.resultJson).length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer list-none telemetry text-[10px] uppercase text-secondary-text hover:text-primary-text">
                          result_json
                        </summary>
                        <pre className="telemetry mt-1 max-h-52 overflow-auto rounded border border-border bg-bg-deep/40 p-2 text-[10px] leading-relaxed text-secondary-text">
                          {JSON.stringify(call.resultJson, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
