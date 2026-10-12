"use client";

/**
 * Agent Activity console.
 *
 * This page reports the persisted trace of an inspection run: the ordered steps the
 * rule-based state machine wrote, the measurements each step recorded, the artifacts
 * it produced, and — for a run that stopped and asked — the resume control that
 * continues it from the snapshot on `agent_runs.context_json`.
 *
 * The no-fabrication rule this page is written against: a number, score, percentage
 * or status is rendered only if an API response carried it. Where a value is absent
 * the panel says "not returned" instead of filling the gap, and because the pipeline
 * is one blocking call with no progress endpoint, a live run gets an indeterminate
 * marker rather than a percentage bar. Counts that are arithmetic over returned rows
 * (steps, state edges, summed durations) are labelled as derived.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

import {
  isHumanStep,
  outcomeString,
  parseInspectionPayload,
  readFinalOutcome,
  stepAction,
  type ResumeChoice,
} from "@/components/agent/agent-data";
import { EvidenceGallery } from "@/components/agent/evidence-gallery";
import { FinalOutcomePanel } from "@/components/agent/final-outcome-panel";
import { ResumePanel } from "@/components/agent/resume-panel";
import { RunHeader } from "@/components/agent/run-header";
import { RunList } from "@/components/agent/run-list";
import { StepTrace } from "@/components/agent/step-trace";
import { ToolCallsPanel } from "@/components/agent/tool-calls-panel";
import { ExportButton } from "@/components/mission/export-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomBarChart } from "@/components/charts/bar-chart";
import {
  Activity,
  AlertOctagon,
  Bot,
  CheckCircle,
  HelpCircle,
  Plus,
  Workflow,
} from "@/components/icons";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import { useAgentRun, useAgentRuns, useInspectionDetail } from "@/lib/hooks";
import { entry, stagger } from "@/lib/motion/presets";
import type { AgentRun } from "@/lib/types";

const RUN_EXPORT_COLUMNS = [
  "id",
  "inspectionId",
  "equipmentName",
  "status",
  "iterations",
  "budgetUsed",
  "toolCount",
  "startTime",
  "endTime",
  "finalAction",
];

const STEP_EXPORT_COLUMNS = [
  "step",
  "action",
  "tool",
  "decision",
  "reason",
  "description",
  "duration",
  "timestamp",
  "evidenceRef",
  "isHumanInteraction",
];

export default function AgentPage() {
  // `?run=` is read with the hook, so the console needs a Suspense boundary rather
  // than opting the whole route into client-side rendering.
  return (
    <Suspense fallback={<ConsoleFallback />}>
      <AgentConsole />
    </Suspense>
  );
}

function ConsoleFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-6 lg:grid-cols-12">
        <Skeleton className="h-[60vh] lg:col-span-4" />
        <Skeleton className="h-[60vh] lg:col-span-8" />
      </div>
    </div>
  );
}

function AgentConsole() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const runsQuery = useAgentRuns();
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);

  const requestedId = searchParams.get("run");
  const [selectedId, setSelectedId] = useState<string | null>(requestedId);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<ResumeChoice | null>(null);

  useEffect(() => {
    if (requestedId) setSelectedId(requestedId);
  }, [requestedId]);

  // Nothing deep-linked: follow the newest returned run so the detail pane is never
  // blank for no reason.
  useEffect(() => {
    if (!selectedId && runs.length > 0) setSelectedId(runs[0].id);
  }, [runs, selectedId]);

  const selectRun = useCallback(
    (id: string) => {
      setSelectedId(id);
      setResumeNotice(null);
      router.replace(`/dashboard/agent?run=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router],
  );

  const listRow = useMemo(
    () => runs.find((run) => run.id === selectedId) ?? null,
    [runs, selectedId],
  );

  const detailQuery = useAgentRun(selectedId ?? "");

  /**
   * The run-level record is preferred: it is refetched on demand and is the only
   * response that carries `final_outcome`. The list row already holds the same steps
   * inline, so it fills the pane while the detail request is in flight. Equipment name
   * only exists on the list response, so it is merged back in.
   */
  const run: AgentRun | null = useMemo(() => {
    if (detailQuery.data) {
      return {
        ...detailQuery.data,
        equipmentName: detailQuery.data.equipmentName ?? listRow?.equipmentName,
      };
    }
    return listRow;
  }, [detailQuery.data, listRow]);

  const inspectionId = run?.inspectionId ?? null;
  const inspectionQuery = useInspectionDetail(inspectionId ?? "");
  const findings = useMemo(
    () => parseInspectionPayload(inspectionQuery.data),
    [inspectionQuery.data],
  );

  /**
   * The question a paused run asked. `final_outcome.awaiting` is the authoritative
   * field, but it does not reach the browser today (see agent-data.ts), so the
   * `request_human_input` step's own description is used — same sentence, persisted
   * separately, and the panel names which source it read.
   */
  const pauseReason = useMemo(() => {
    if (!run) return null;
    const awaiting = outcomeString(readFinalOutcome(run), "awaiting");
    if (awaiting) return { text: awaiting, source: "final_outcome.awaiting" };
    for (let index = run.steps.length - 1; index >= 0; index -= 1) {
      const step = run.steps[index];
      if (isHumanStep(step) && stepAction(step) === "request_human_input" && step.description) {
        return { text: step.description, source: `step ${step.step} (request_human_input)` };
      }
    }
    for (let index = run.steps.length - 1; index >= 0; index -= 1) {
      const step = run.steps[index];
      if (isHumanStep(step) && step.description) {
        return { text: step.description, source: `step ${step.step} (${stepAction(step)})` };
      }
    }
    return null;
  }, [run]);

  const resumeMutation = useMutation<Record<string, unknown>, Error, ResumeChoice>({
    mutationFn: (choice) => {
      if (!selectedId) return Promise.reject(new Error("No run is selected."));
      return api.agent.resumeRun(selectedId, choice);
    },
    onSuccess: (data, choice) => {
      const status = typeof data.status === "string" ? data.status : "unknown";
      const message =
        typeof data.message === "string" ? data.message : "Resume accepted by the API.";
      setResumeNotice(`${message} · response: ${choice} · run status now: ${status}`);
      toast({
        title: `Agent answered with “${choice}”`,
        description: `The run is now ${status}. The trace has been refetched.`,
      });
      // The snapshot continues in place, so steps are appended to the same run row:
      // every query this page reads has to be re-validated or the pane shows an
      // answer the reviewer has already given.
      queryClient.invalidateQueries({ queryKey: ["agent-run", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["agent-runs"] });
      if (inspectionId) {
        queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      }
      queryClient.invalidateQueries({ queryKey: ["findings"] });
    },
    onError: (error) => {
      setResumeNotice(null);
      toast({
        variant: "destructive",
        title: "Resume rejected",
        description: error.message,
      });
    },
    onSettled: () => setPendingChoice(null),
  });

  const handleResume = useCallback(
    (choice: ResumeChoice) => {
      setPendingChoice(choice);
      resumeMutation.mutate(choice);
    },
    [resumeMutation],
  );

  const refreshTrace = useCallback(() => {
    void runsQuery.refetch();
    if (selectedId) void queryClient.invalidateQueries({ queryKey: ["agent-run", selectedId] });
    if (inspectionId) {
      void queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
    }
  }, [queryClient, runsQuery, selectedId, inspectionId]);

  const toolInvocationData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of runs) {
      for (const call of item.toolCalls) {
        counts.set(call.tool, (counts.get(call.tool) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tool, invocations]) => ({ tool, invocations }));
  }, [runs]);

  const completedCount = runs.filter((item) => item.status === "completed").length;
  const pausedCount = runs.filter((item) => item.status === "paused").length;
  const failedCount = runs.filter((item) => item.status === "failed").length;

  return (
    <div className="space-y-6">
      <motion.header
        className="flex flex-wrap items-start justify-between gap-4"
        variants={entry.boot}
        initial="hidden"
        animate="visible"
      >
        <div>
          <h1 className="text-display font-bold text-gradient-hero">Agent Activity</h1>
          <p className="mt-1 max-w-3xl text-sm text-secondary-text">
            The persisted trace of each inspection run: every action the rule-based
            planner took, the OpenCV values it took them from, the artifacts it wrote,
            and the human-in-the-loop control for a run that paused to ask.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton rows={runs} columns={RUN_EXPORT_COLUMNS} name="agent-runs" />
          <Button asChild size="sm">
            <Link href="/dashboard/inspection/upload">
              <Plus className="mr-2 h-4 w-4" />
              New inspection
            </Link>
          </Button>
        </div>
      </motion.header>

      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={stagger.rail}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={entry.boot}>
          <MetricCard
            title="Runs returned"
            value={runsQuery.isLoading ? "—" : runs.length}
            change="from GET /api/agent/runs"
            trend="neutral"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <Activity className="h-4 w-4 text-primary" />
              </div>
            }
          />
        </motion.div>
        <motion.div variants={entry.boot}>
          <MetricCard
            title="Completed"
            value={runsQuery.isLoading ? "—" : completedCount}
            change={
              runsQuery.isLoading
                ? "awaiting the run list response"
                : `${completedCount} of ${runs.length} returned runs`
            }
            trend="neutral"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <CheckCircle className="h-4 w-4 text-success" />
              </div>
            }
          />
        </motion.div>
        <motion.div variants={entry.boot}>
          <MetricCard
            title="Paused — awaiting input"
            value={runsQuery.isLoading ? "—" : pausedCount}
            change={
              runsQuery.isLoading
                ? "awaiting the run list response"
                : pausedCount > 0
                  ? "answerable in the console below"
                  : "no run is asking for input"
            }
            trend="neutral"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <HelpCircle className="h-4 w-4 text-warning" />
              </div>
            }
          />
        </motion.div>
        <motion.div variants={entry.boot}>
          <MetricCard
            title="Failed"
            value={runsQuery.isLoading ? "—" : failedCount}
            change={
              runsQuery.isLoading
                ? "awaiting the run list response"
                : `${failedCount} of ${runs.length} returned runs`
            }
            trend="neutral"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <AlertOctagon className="h-4 w-4 text-critical" />
              </div>
            }
          />
        </motion.div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4 xl:col-span-3">
          <div className="h-[30rem] lg:sticky lg:top-0 lg:h-[calc(100vh-8rem)]">
            <RunList
              runs={runs}
              selectedId={selectedId}
              onSelect={selectRun}
              isLoading={runsQuery.isLoading}
              errorMessage={
                runsQuery.isError && runsQuery.error
                  ? `Run list request failed: ${runsQuery.error.message}`
                  : null
              }
              onRetry={() => void runsQuery.refetch()}
            />
          </div>
        </div>

        <div className="space-y-6 lg:col-span-8 xl:col-span-9">
          {!runsQuery.isLoading && runs.length === 0 && !runsQuery.isError && (
            <Card>
              <CardHeader>
                <CardTitle className="text-primary-text">No agent runs yet</CardTitle>
                <CardDescription>
                  The agent writes a run row, its steps and its tool calls as soon as an
                  inspection is executed. Nothing is shown here until that happens — an
                  empty console is the honest state, not a placeholder.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm">
                  <Link href="/dashboard/inspection/upload">
                    <Plus className="mr-2 h-4 w-4" />
                    Start an inspection
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {run ? (
            <>
              <RunHeader
                run={run}
                source={detailQuery.data ? "run detail" : "run list"}
                isFetching={detailQuery.isFetching}
                onRefresh={refreshTrace}
              />

              {detailQuery.isError && detailQuery.error && (
                <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-secondary-text">
                  The run detail request failed ({detailQuery.error.message}). The trace
                  shown is the copy the run list response already carried inline, so
                  run-level fields may be missing from it.
                </p>
              )}

              {run.status === "paused" && (
                <ResumePanel
                  runId={run.id}
                  pauseReason={pauseReason?.text ?? null}
                  pauseReasonSource={pauseReason?.source ?? null}
                  pending={resumeMutation.isPending}
                  pendingChoice={pendingChoice}
                  errorMessage={
                    resumeMutation.isError ? resumeMutation.error.message : null
                  }
                  resultMessage={resumeNotice}
                  onResume={handleResume}
                />
              )}

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Workflow className="h-4 w-4 text-secondary-text" />
                      <CardTitle className="text-primary-text">Step trace</CardTitle>
                    </div>
                    <CardDescription>
                      Ordered by the stored <code className="telemetry text-xs">step_number</code>.
                      Action rows carry measured values and the decision they produced;
                      the thin connector rows are pure state-machine edges, interleaved
                      exactly as the loop wrote them.
                    </CardDescription>
                  </div>
                  <ExportButton
                    rows={run.steps}
                    columns={STEP_EXPORT_COLUMNS}
                    name={`agent-trace-${run.id.slice(0, 8)}`}
                  />
                </CardHeader>
                <CardContent>
                  {/* Keyed by run so switching runs replays the trace entrance rather
                      than leaving rows frozen in the previous run's order. */}
                  <StepTrace key={run.id} steps={run.steps} />
                </CardContent>
              </Card>

              <FinalOutcomePanel run={run} />

              <ToolCallsPanel toolCalls={run.toolCalls} />

              <EvidenceGallery
                findings={findings}
                isLoading={inspectionQuery.isLoading}
                errorMessage={
                  inspectionQuery.isError && inspectionQuery.error
                    ? `Inspection request failed: ${inspectionQuery.error.message}`
                    : null
                }
                inspectionId={inspectionId}
              />
            </>
          ) : (
            !runsQuery.isLoading &&
            runs.length > 0 &&
            !runsQuery.isError && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-primary-text">
                    {requestedId ? "Run not in this response" : "Select a run"}
                  </CardTitle>
                  <CardDescription>
                    {requestedId ? (
                      <>
                        <code className="telemetry text-xs">{requestedId}</code> was
                        deep-linked but is not among the{" "}
                        {runs.length} run(s) the list endpoint returned — it belongs to
                        another organization or is older than the limit.
                      </>
                    ) : (
                      "Pick a run on the left to read its trace."
                    )}
                  </CardDescription>
                </CardHeader>
              </Card>
            )
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="h-4 w-4 text-secondary-text" />
            <CardTitle className="text-primary-text">
              Tool invocations across the returned runs
            </CardTitle>
            <Badge variant="outline" className="telemetry text-[10px]">
              derived count
            </Badge>
          </div>
          <CardDescription>
            Histogrammed from the persisted <code className="telemetry text-xs">agent_tool_calls</code>{" "}
            rows those runs returned. State-machine edges are not tool calls and are
            excluded, so the bars count tools that actually ran.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runsQuery.isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : toolInvocationData.length === 0 ? (
            <p className="text-sm text-secondary-text">
              No tool-call rows were returned for these runs, so there is nothing to
              count.
            </p>
          ) : (
            <CustomBarChart
              data={toolInvocationData}
              xKey="tool"
              bars={[{ key: "invocations", name: "Invocations", color: "#38BDF8" }]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
