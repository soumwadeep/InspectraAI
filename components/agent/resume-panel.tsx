"use client";

/**
 * Human-in-the-loop control for a `paused` run.
 *
 * `paused` is not an error state: the planner stopped, persisted its context on the
 * run row and asked a question. The three answers below are exactly the ones
 * `POST /api/agent/runs/{id}/resume` accepts, described by what the resume path in
 * `backend/app/agent/workflow.py` actually does with them — not by what a UI would
 * like them to mean. No progress is claimed here either: the pipeline is one
 * blocking call with no progress endpoint, so a running continuation shows an
 * indeterminate marker instead of a fabricated percentage.
 */
import { useState } from "react";
import { motion } from "framer-motion";

import {
  RESUME_MECHANICS,
  RESUME_OPTIONS,
  type ResumeChoice,
} from "@/components/agent/agent-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { entry, stagger } from "@/lib/motion/presets";
import { AlertTriangle, CheckCircle, HelpCircle, RefreshCw, XCircle } from "@/components/icons";
import { cn } from "@/lib/utils";

const optionIcons: Record<ResumeChoice, React.ReactNode> = {
  retry: <RefreshCw className="h-4 w-4" />,
  proceed: <CheckCircle className="h-4 w-4" />,
  abort: <XCircle className="h-4 w-4" />,
};

interface ResumePanelProps {
  runId: string;
  /** The question the run asked, taken from the trace or from final_outcome. */
  pauseReason: string | null;
  /** Which returned field the reason came from, so the source is nameable. */
  pauseReasonSource: string | null;
  pending: boolean;
  pendingChoice: ResumeChoice | null;
  errorMessage: string | null;
  resultMessage: string | null;
  onResume: (choice: ResumeChoice) => void;
}

export function ResumePanel({
  runId,
  pauseReason,
  pauseReasonSource,
  pending,
  pendingChoice,
  errorMessage,
  resultMessage,
  onResume,
}: ResumePanelProps) {
  // Destructive answers need a second click; a paused run is often the only
  // record of a measurement someone is about to discard.
  const [confirming, setConfirming] = useState<ResumeChoice | null>(null);

  function choose(choice: ResumeChoice) {
    if (choice === "abort" && confirming !== "abort") {
      setConfirming("abort");
      return;
    }
    setConfirming(null);
    onResume(choice);
  }

  return (
    <Card className="border-warning/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <HelpCircle className="h-4 w-4 text-warning" />
          <CardTitle className="text-primary-text">Human input requested</CardTitle>
          <Badge variant="warning" className="telemetry text-[10px]">
            paused
          </Badge>
        </div>
        <CardDescription>
          The run stopped itself and wrote its state to{" "}
          <code className="telemetry">agent_runs.context_json</code>. Answering
          continues that snapshot — it does not restart the inspection from scratch.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
          <p className="text-kicker uppercase text-secondary-text">
            The question the agent asked
          </p>
          {pauseReason ? (
            <>
              <p className="mt-1 text-sm leading-relaxed text-primary-text">
                {pauseReason}
              </p>
              <p className="mt-1.5 telemetry text-[10px] text-secondary-text">
                source: {pauseReasonSource} · run {runId.slice(0, 8)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-secondary-text">
              No pause text was returned on this run&rsquo;s steps or final_outcome, so
              there is nothing to quote. The trace below shows the last recorded
              measurement before the pause.
            </p>
          )}
        </div>

        <motion.div
          className="grid grid-cols-1 gap-3 lg:grid-cols-3"
          variants={stagger.rail}
          initial="hidden"
          animate="visible"
        >
          {RESUME_OPTIONS.map((option) => (
            <motion.div
              key={option.choice}
              variants={entry.boot}
              className={cn(
                "flex flex-col rounded-lg border p-3",
                option.cardTone,
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-md p-1.5",
                    option.choice === "retry" && "bg-primary/10 text-primary",
                    option.choice === "proceed" && "bg-success/10 text-success",
                    option.choice === "abort" && "bg-critical/10 text-critical-text",
                  )}
                >
                  {optionIcons[option.choice]}
                </span>
                <p className="text-sm font-semibold text-primary-text">{option.label}</p>
              </div>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-secondary-text">
                {option.detail}
              </p>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant={option.choice === "abort" ? "destructive" : "outline"}
                  onClick={() => choose(option.choice)}
                  disabled={pending}
                  loading={pending && pendingChoice === option.choice}
                  className="w-full"
                >
                  {pending && pendingChoice === option.choice
                    ? "sending…"
                    : option.choice === "abort" && confirming === "abort"
                      ? "Confirm abort"
                      : option.choice === "abort" && confirming !== "abort"
                        ? "Abort (needs confirm)"
                        : `Send ${option.choice}`}
                </Button>
                <p className="mt-1.5 telemetry text-[10px] text-secondary-text/70">
                  POST /api/agent/runs/{"{id}"}/resume · response=&ldquo;
                  {option.choice}&rdquo;
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {confirming === "abort" && !pending && (
          <div className="flex items-start gap-2 rounded border border-critical/30 bg-critical/5 p-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" />
            <p className="text-xs text-secondary-text">
              Abort writes a failed end to the run. Click{" "}
              <span className="text-critical-text">Confirm abort</span> again to send it,
              or answer retry / proceed instead.
            </p>
          </div>
        )}

        <p className="text-xs text-secondary-text">{RESUME_MECHANICS}</p>

        {pending && (
          <div className="flex items-center gap-2 rounded border border-primary/30 bg-primary/5 p-2.5">
            {/* No progress endpoint exists, so this says only that a request is in
                flight. Anything shaped like a percentage would be invented. */}
            <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
            <p className="text-xs text-primary-text">
              Resume request in flight — the response arrives when the continuation
              finishes, which is a single blocking call.
            </p>
          </div>
        )}

        {resultMessage && !pending && (
          <p className="rounded border border-success/30 bg-success/5 p-2.5 telemetry text-xs text-success">
            {resultMessage}
          </p>
        )}

        {errorMessage && (
          <p className="rounded border border-critical/40 bg-critical/5 p-2.5 text-xs text-critical-text">
            {errorMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
