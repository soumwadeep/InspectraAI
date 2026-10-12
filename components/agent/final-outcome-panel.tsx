"use client";

/**
 * The run's recorded outcome.
 *
 * `agent_runs.final_outcome` is where the planner writes what actually happened —
 * which policy decided, which state the loop stopped in, whether it reached `end`,
 * how many alignment attempts it spent and how many findings it created. This panel
 * renders exactly those fields, and says "not returned" when the value never reached
 * the browser. The planner is a deterministic rule-based state machine; nothing here
 * is language-model output and the copy never suggests it is.
 */
import { motion } from "framer-motion";

import {
  outcomeBoolean,
  outcomeNumber,
  outcomeRecord,
  outcomeString,
  outcomeStringList,
  readFinalOutcome,
} from "@/components/agent/agent-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { entry } from "@/lib/motion/presets";
import type { AgentRun } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FinalOutcomePanelProps {
  run: AgentRun | null;
}

export function FinalOutcomePanel({ run }: FinalOutcomePanelProps) {
  const outcome = readFinalOutcome(run);
  const planner = outcomeString(outcome, "planner");
  const finalState = outcomeString(outcome, "final_state");
  const endReached = outcomeBoolean(outcome, "end_reached");
  const iterations = outcomeNumber(outcome, "iterations");
  const alignmentAttempts = outcomeNumber(outcome, "alignment_attempts");
  const findingsCreated = outcomeNumber(outcome, "findings_created");
  const timedOut = outcomeBoolean(outcome, "timed_out");
  const overallConfidence = outcomeNumber(outcome, "overall_confidence");
  const error = outcomeString(outcome, "error");
  const awaiting = outcomeString(outcome, "awaiting");
  const recommendations = outcomeStringList(outcome, "recommendations");
  const videoSampling = outcomeRecord(outcome, "video_sampling");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-primary-text">Recorded outcome</CardTitle>
            <CardDescription>
              <span className="telemetry">final_outcome</span> as persisted on the run
              row — the numbers the rule chose from.
            </CardDescription>
          </div>
          <Badge variant={planner ? "info" : "outline"} className="telemetry text-[10px]">
            {planner ? planner : "planner id not returned"}
          </Badge>
        </div>
        <p className="pt-2 text-xs text-secondary-text">
          The planner is a deterministic rule-based state machine over the OpenCV
          tools. Every branch reads a measured value; no language model is involved,
          and the ids above are the policy that decided, not a model version.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {!outcome && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
            <p className="text-xs font-semibold text-warning">
              No recorded outcome on this response
            </p>
            <p className="mt-1 text-xs leading-relaxed text-secondary-text">
              <code className="telemetry">agent_runs.final_outcome</code> is written
              when the loop stops — on completion, failure and on a pause for human
              input. A run whose row is empty predates that column being populated, so
              every value below reads as not returned rather than being reconstructed
              from the step trace. The run-level fields that{" "}
              <em>are</em> returned still show.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <OutcomeField label="final_state" value={finalState} mono />
          <OutcomeField
            label="end_reached"
            value={endReached === null ? null : String(endReached)}
            tone={endReached === true ? "success" : endReached === false ? "warning" : "muted"}
            mono
          />
          <OutcomeField label="iterations" value={formatNumber(iterations)} />
          <OutcomeField
            label="alignment_attempts"
            value={formatNumber(alignmentAttempts)}
          />
          <OutcomeField
            label="findings_created"
            value={formatNumber(findingsCreated)}
            tone={findingsCreated && findingsCreated > 0 ? "success" : "muted"}
          />
          <OutcomeField
            label="timed_out"
            value={timedOut === null ? null : String(timedOut)}
            tone={timedOut === true ? "critical" : "muted"}
            mono
          />
          <OutcomeField
            label="overall_confidence (1 − changed frame area)"
            value={formatNumber(overallConfidence)}
          />
          <OutcomeField
            label="budget_used (run row)"
            value={run ? String(run.budgetUsed) : null}
          />
          <OutcomeField
            label="final_action (run row)"
            value={run?.finalAction ?? null}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OutcomeText label="error" value={error} tone="critical" />
          <OutcomeText label="awaiting (question put to a human)" value={awaiting} tone="warning" />
        </div>

        {recommendations && (
          <div className="space-y-2">
            <p className="text-kicker uppercase text-secondary-text">
              recommendations recorded on the run
            </p>
            <ul className="space-y-1.5">
              {recommendations.map((recommendation, index) => (
                <motion.li
                  key={`${recommendation.slice(0, 40)}-${index}`}
                  variants={entry.boot}
                  initial="hidden"
                  animate="visible"
                  className="rounded border border-border bg-surface/30 px-3 py-2 text-sm text-primary-text"
                >
                  {recommendation}
                </motion.li>
              ))}
            </ul>
          </div>
        )}

        {videoSampling && (
          <div className="rounded-lg border border-border bg-surface/30 p-3">
            <p className="text-kicker uppercase text-secondary-text">
              video sampling recorded on the run
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              {[
                "frames_requested",
                "frames_decoded",
                "container_frame_count",
                "fps",
                "width",
                "height",
                "selected_frame_index",
              ].map((key) => (
                <div key={key}>
                  <dt className="telemetry text-[10px] uppercase text-secondary-text">
                    {key}
                  </dt>
                  <dd className="telemetry text-xs text-primary-text">
                    {formatNumber(outcomeNumber(videoSampling, key))}
                  </dd>
                </div>
              ))}
            </dl>
            {outcomeString(videoSampling, "selection_reason") && (
              <p className="mt-2 text-xs text-secondary-text">
                Frame choice reason as recorded:{" "}
                <span className="text-primary-text">
                  {outcomeString(videoSampling, "selection_reason")}
                </span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number | null): string | null {
  return value === null ? null : String(value);
}

const toneClasses = {
  success: "text-success",
  warning: "text-warning",
  critical: "text-critical-text",
  muted: "text-primary-text",
} as const;

function OutcomeField({
  label,
  value,
  mono,
  tone = "muted",
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  tone?: keyof typeof toneClasses;
}) {
  return (
    <div className="rounded border border-border bg-surface/30 px-3 py-2">
      <p className="text-kicker uppercase text-secondary-text">{label}</p>
      {value === null ? (
        <p className="mt-0.5 text-sm text-secondary-text/70">not returned</p>
      ) : (
        <p
          className={cn(
            "mt-0.5 break-words text-sm font-semibold",
            mono && "telemetry",
            toneClasses[tone],
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function OutcomeText({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone: keyof typeof toneClasses;
}) {
  return (
    <div className="rounded border border-border bg-surface/30 px-3 py-2">
      <p className="text-kicker uppercase text-secondary-text">{label}</p>
      {value === null ? (
        <p className="mt-0.5 text-sm text-secondary-text/70">not returned</p>
      ) : (
        <p className={cn("mt-0.5 text-sm leading-relaxed", toneClasses[tone])}>{value}</p>
      )}
    </div>
  );
}
