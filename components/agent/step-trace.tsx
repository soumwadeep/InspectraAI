"use client";

/**
 * The persisted trace, in the order the state machine wrote it.
 *
 * Two row kinds, deliberately not interchangeable visually: a tool step (an action
 * that ran OpenCV work, has a measured `duration_ms` and a `decision` naming the
 * state the rule chose) and a `state_transition` edge (a bare state-machine move
 * with no tool and no measurement, drawn as a connector rather than a card). The
 * backend interleaves them, so the edge rows are what make the retry loops legible.
 */
import { motion } from "framer-motion";

import { AuthImage } from "@/components/agent/auth-image";
import {
  isHumanStep,
  isStateTransition,
  parseMeasurements,
  stateEdge,
  stepAction,
  stepTool,
} from "@/components/agent/agent-data";
import { Badge } from "@/components/ui/badge";
import { entry, stagger } from "@/lib/motion/presets";
import type { AgentStep } from "@/lib/types";
import { cn, formatDurationMs } from "@/lib/utils";

interface StepTraceProps {
  steps: AgentStep[];
}

export function StepTrace({ steps }: StepTraceProps) {
  if (steps.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-secondary-text">
        This run returned no steps. Either it has not entered its loop yet or the
        trace was persisted without them — nothing here can be shown until the API
        returns rows.
      </p>
    );
  }

  const toolSteps = steps.filter((step) => !isStateTransition(step)).length;
  const edges = steps.length - toolSteps;

  return (
    <div className="space-y-3">
      <p className="telemetry text-[11px] text-secondary-text">
        {toolSteps} action step(s) · {edges} state edge(s) · shown in stored
        step_number order
      </p>

      {/* `stagger.rail` rather than `sequence`: a trace can be 15+ rows and a
          0.12s stride leaves the panel half-empty for two seconds. */}
      <motion.ol
        className="space-y-1.5"
        variants={stagger.rail}
        initial="hidden"
        animate="visible"
      >
        {steps.map((step) =>
          isStateTransition(step) ? (
            <StateEdgeRow key={`edge-${step.step}`} step={step} />
          ) : (
            <ActionRow key={`action-${step.step}`} step={step} />
          ),
        )}
      </motion.ol>
    </div>
  );
}

function ActionRow({ step }: { step: AgentStep }) {
  const action = stepAction(step);
  const tool = stepTool(step);
  const human = isHumanStep(step);
  const measurements = parseMeasurements(step.description);
  const duration = typeof step.duration === "number" ? step.duration : null;
  const summaryDiffers =
    !!step.resultSummary && step.resultSummary !== step.description;

  return (
    <motion.li
      variants={entry.rise}
      className={cn(
        "rounded-lg border p-4",
        human
          ? "border-warning/40 bg-warning/5"
          : "border-border bg-surface/30 hover:border-border-hover",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="telemetry text-xs font-semibold text-primary">
          {String(step.step).padStart(2, "0")}
        </span>
        <code className="text-xs font-semibold text-primary-text">{action}</code>

        {tool ? (
          <Badge variant="outline" className="telemetry text-[10px]">
            tool: {tool}
          </Badge>
        ) : (
          <Badge variant="outline" className="telemetry text-[10px]">
            no tool registered
          </Badge>
        )}

        {human && (
          <Badge variant="warning" className="text-[10px]">
            human interaction
          </Badge>
        )}

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {duration !== null ? (
            <span className="telemetry text-[11px] text-secondary-text">
              {duration} ms
              {duration >= 1000 ? ` (${formatDurationMs(duration)})` : ""}
            </span>
          ) : (
            <span className="telemetry text-[11px] text-secondary-text/60">
              duration_ms not returned
            </span>
          )}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-primary-text">
        {step.description}
      </p>

      {measurements.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {measurements.map((measurement, index) => (
            <li
              // The same key can legitimately appear twice in one sentence
              // (two attempts, two regions), so the position keeps keys stable.
              key={`${measurement.label}-${measurement.value}-${index}`}
              className="inline-flex items-baseline gap-1.5 rounded border border-primary/20 bg-primary/5 px-2 py-1"
            >
              <span className="text-kicker uppercase text-secondary-text">
                {measurement.label}
              </span>
              <span className="telemetry text-xs font-semibold text-primary">
                {measurement.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="telemetry text-[11px] text-secondary-text">
          decision:{" "}
          {step.decision ? (
            <span className="font-semibold text-success">→ {step.decision}</span>
          ) : (
            <span className="text-secondary-text/70">none recorded on this step</span>
          )}
        </span>
        {step.reason && (
          <span className="telemetry text-[11px] text-secondary-text">
            reason: <span className="text-primary-text">{step.reason}</span>
          </span>
        )}
        {summaryDiffers && (
          <span className="telemetry text-[11px] text-secondary-text">
            result_summary: <span className="text-primary-text">{step.resultSummary}</span>
          </span>
        )}
      </div>

      {step.evidenceRef && (
        <div className="mt-3 flex items-start gap-3">
          <AuthImage
            storagePath={step.evidenceRef}
            alt={`Evidence artifact written by step ${step.step}`}
            frameClassName="w-32 shrink-0 sm:w-40"
          />
          <div className="min-w-0 space-y-1">
            <p className="text-kicker uppercase text-secondary-text">
              evidence_ref on this step
            </p>
            <p className="telemetry break-all text-[11px] text-secondary-text">
              {step.evidenceRef}
            </p>
            <p className="text-[11px] text-secondary-text/80">
              Read from the stored path the step wrote, not from a finding — this
              artifact exists before any finding does.
            </p>
          </div>
        </div>
      )}

      {step.arguments && Object.keys(step.arguments).length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer list-none text-kicker uppercase text-secondary-text hover:text-primary-text">
            arguments as stored
          </summary>
          <pre className="telemetry mt-2 max-h-64 overflow-auto rounded border border-border bg-bg-deep/40 p-3 text-[11px] leading-relaxed text-secondary-text">
            {JSON.stringify(step.arguments, null, 2)}
          </pre>
        </details>
      )}
    </motion.li>
  );
}

/**
 * A state-machine edge: no tool, no measurement, no decision of its own. Kept in
 * the trace because the ordering is the argument for why the run paused.
 */
function StateEdgeRow({ step }: { step: AgentStep }) {
  const edge = stateEdge(step);

  return (
    <motion.li
      variants={entry.fade}
      className="flex items-center gap-3 py-0.5 pl-4"
      title="State-machine edge — no tool ran for this step"
    >
      <span aria-hidden className="h-3 w-px bg-border-hover" />
      <span aria-hidden className="h-1.5 w-1.5 rotate-45 border border-accent-readable/60 bg-accent/20" />
      <span className="telemetry text-[11px] text-accent-readable">
        {edge ? `${edge.from} → ${edge.to}` : step.description}
      </span>
      <span className="text-kicker uppercase text-secondary-text/60">
        state edge
      </span>
      {typeof step.duration === "number" && step.duration > 0 && (
        <span className="telemetry text-[10px] text-secondary-text/60">
          {step.duration} ms
        </span>
      )}
    </motion.li>
  );
}
