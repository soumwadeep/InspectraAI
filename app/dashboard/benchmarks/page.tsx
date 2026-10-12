"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { useBenchmarks, useSystemHealth } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { entry, stagger } from "@/lib/motion/presets";
import { AlertCircle, Clock, Cpu, Database, Gauge, Server } from "@/components/icons";
import type { BenchmarkRun } from "@/lib/types";
import { RunForm, type BenchmarkRunBody } from "@/components/benchmarks/run-form";
import { RunResultsPanel } from "@/components/benchmarks/run-results";
import { CapabilitiesPanel } from "@/components/analytics/capabilities-panel";
import { fmtMeasured, parseBenchmarkResults } from "@/components/benchmarks/benchmark-results";

/** Copied from the error message in `components/mission/system-health-panel.tsx`. */
const BACKEND_START_COMMAND = "python3 -m uvicorn app.main:app --port 8000";

function OfflineNotice({ endpoint, reason }: { endpoint: string; reason?: string }) {
  return (
    <div className="rounded-lg bg-critical/10 p-4 text-critical">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <p className="text-sm font-medium">
          <code className="font-mono">{endpoint}</code> failed
          {reason ? `: ${reason}` : " — the API did not answer."}
        </p>
      </div>
      <p className="mt-2 text-xs">
        If the backend process is not running, start it from{" "}
        <code className="font-mono">backend/</code> with{" "}
        <code className="font-mono">{BACKEND_START_COMMAND}</code>, then reload this page.
      </p>
      <p className="mt-1 text-xs">
        A 401/403 means the request reached the API but the stored token was rejected.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg bg-surface/30 p-3">
      <span className="text-sm text-secondary-text">{label}</span>
      <span className="break-all text-right text-sm font-medium text-primary-text">
        {value}
      </span>
    </div>
  );
}

function RunListItem({
  run,
  selected,
  onSelect,
}: {
  run: BenchmarkRun;
  selected: boolean;
  onSelect: () => void;
}) {
  const parsed = useMemo(() => parseBenchmarkResults(run.results), [run]);
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={
        selected
          ? "glass w-full rounded-lg p-4 text-left ring-1 ring-primary/60"
          : "glass w-full rounded-lg p-4 text-left transition-colors hover:border-border-hover"
      }
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-primary-text">{run.name}</p>
          {run.description && (
            <p className="truncate text-sm text-secondary-text">{run.description}</p>
          )}
          <p className="mt-1 break-all text-xs text-secondary-text">
            <code className="font-mono">{run.id}</code> · recorded {formatDate(run.createdAt)}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 telemetry">
          {run.durationMs} ms
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {parsed.hasAnyMeasurement ? (
          <>
            <Badge variant="info" className="telemetry">
              pairs {fmtMeasured(parsed.corpus.pairs)} · seed {fmtMeasured(parsed.corpus.seed)}
            </Badge>
            <Badge variant="outline" className="telemetry">
              P {fmtMeasured(parsed.detection.precision)} · R {fmtMeasured(parsed.detection.recall)}{" "}
              · F1 {fmtMeasured(parsed.detection.f1_score)}
            </Badge>
            <Badge variant="outline" className="telemetry">
              IoU {fmtMeasured(parsed.detection.mean_iou)} · acc {fmtMeasured(parsed.classification.accuracy)}
            </Badge>
          </>
        ) : (
          <Badge variant="warning">
            stored row carries no numeric results — treated as not measured
          </Badge>
        )}
      </div>
    </motion.button>
  );
}

export default function BenchmarksPage() {
  const queryClient = useQueryClient();
  const {
    data: runs,
    isLoading,
    isFetching,
    isError,
    error: listError,
  } = useBenchmarks();

  const {
    data: health,
    isLoading: healthLoading,
    isError: healthIsError,
    error: healthError,
  } = useSystemHealth();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Newest first from the API; default the detail view to the most recent run.
  useEffect(() => {
    if (selectedId === null && runs && runs.length > 0) {
      setSelectedId(runs[0].id);
    }
  }, [runs, selectedId]);

  // Detail is rendered from the row `GET /api/benchmarks` already returns in full
  // (it embeds `results_json`), so no second request is needed. `api.benchmarks.get`
  // is now usable too — the detail route used to answer with `config`/`results`
  // while the list returns `config_json`/`results_json`, and has been made to share
  // `BenchmarkRunRead` so one resource no longer has two field spellings.

  const runMutation = useMutation<Record<string, unknown>, Error, BenchmarkRunBody>({
    mutationFn: (body) =>
      api.benchmarks.run({
        name: body.name,
        description: body.description,
        config: body.config,
      }),
    onSuccess: (res) => {
      const id = typeof res.id === "string" ? res.id : null;
      queryClient.invalidateQueries({ queryKey: ["benchmarks"] });
      if (id) setSelectedId(id);
    },
  });

  const selectedRun = runs?.find((run) => run.id === selectedId) ?? null;

  // Estimate basis: measured per-pair time of the newest stored run that has one.
  const lastPerPairMs = useMemo(() => {
    for (const run of runs ?? []) {
      const parsed = parseBenchmarkResults(run.results);
      if (parsed.timing.per_pair_ms !== undefined) return parsed.timing.per_pair_ms;
    }
    return undefined;
  }, [runs]);

  const runCount = runs?.length ?? 0;

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-display font-bold text-gradient-hero">Performance Benchmarks</h1>
        <p className="mt-1 max-w-3xl text-secondary-text">
          A run executes the real detection pipeline against a labelled{" "}
          <span className="text-primary-text">synthetic</span> corpus and stores what it measured.
          Every figure on this page comes from a stored run&apos;s{" "}
          <code className="font-mono">results_json</code> — nothing is displayed unless the API
          returned it, and these numbers never describe real plant imagery.
        </p>
      </motion.div>

      {isError && <OfflineNotice endpoint="GET /api/benchmarks" reason={listError?.message} />}
      {healthIsError && <OfflineNotice endpoint="GET /health" reason={healthError?.message} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RunForm
          isPending={runMutation.isPending}
          error={runMutation.error ? runMutation.error.message : null}
          lastPerPairMs={lastPerPairMs}
          onRun={(body) => runMutation.mutate(body)}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary-text">
              <Gauge className="h-5 w-5 text-secondary" />
              What these numbers are — and are not
            </CardTitle>
            <CardDescription>Read this before quoting any figure below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-secondary-text">
            <p>
              <span className="font-medium text-primary-text">Scope.</span> The corpus is generated
              from the seed: reference images with labelled defect boxes, plus clean pairs that
              carry no defects. Precision, recall, F1, IoU and category accuracy are measured
              against those boxes and apply to that corpus only.
            </p>
            <p>
              <span className="font-medium text-primary-text">Reproducibility.</span> A run stores
              its pair count, seed and IoU threshold; re-running with the same values regenerates
              the same corpus.
            </p>
            <p>
              <span className="font-medium text-primary-text">Weaknesses stay visible.</span> The
              category breakdown compares ground-truth counts with predicted counts per category,
              and the per-pair audit draws every returned box, so any aggregate can be checked
              against the rows it came from.
            </p>
            <p>
              <span className="font-medium text-primary-text">Stored rows pre-dating measurement.</span>{" "}
              Earlier versions of <code className="font-mono">POST /api/benchmarks/run</code> wrote
              hardcoded &quot;passed&quot; strings. Such rows render here as &quot;no numeric
              results&quot;; they are proof the endpoint was called, never evidence of a
              measurement.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Run history */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text flex items-center gap-2">
              <Clock className="h-5 w-5 text-secondary" />
              Stored runs
            </CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading from GET /api/benchmarks"
                : `${runCount} run${runCount === 1 ? "" : "s"} returned by GET /api/benchmarks (newest first, organization-scoped, no server cap)`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : isError ? (
              <p className="text-sm text-secondary-text">
                No run list is available because the request failed; the notice above explains how
                to bring the API up.
              </p>
            ) : runCount === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4">
                <p className="text-sm font-medium text-primary-text">No runs recorded yet.</p>
                <p className="mt-1 text-sm text-secondary-text">
                  Use the form above. A measurement run takes several seconds per handful of pairs
                  and writes one row to <code className="font-mono">benchmark_runs</code>.
                </p>
              </div>
            ) : (
              runs?.map((run) => (
                <RunListItem
                  key={run.id}
                  run={run}
                  selected={run.id === selectedId}
                  onSelect={() => setSelectedId(run.id)}
                />
              ))
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Detail of the selected run */}
      {selectedId !== null && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-title font-semibold text-primary-text">Run detail</h2>
            <span className="text-xs text-secondary-text">
              rendered from the{" "}
              <code className="font-mono">results_json</code> of the row returned by{" "}
              <code className="font-mono">GET /api/benchmarks</code>
            </span>
          </div>
          {selectedRun ? (
            <RunResultsPanel run={selectedRun} />
          ) : isFetching ? (
            <Skeleton className="h-[320px] w-full" />
          ) : (
            <p className="text-sm text-warning">
              The selected run id is not present in the list the API returned, so nothing is
              shown for it.
            </p>
          )}
        </motion.div>
      )}

      {/* Runtime facts — live introspection, never presented as results */}
      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        variants={stagger.sequence}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={entry.rise}>
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                Vision runtime
              </CardTitle>
              <CardDescription>
                Read live from <code className="font-mono">GET /health</code> — process state, not a
                benchmark result
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {healthLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : health ? (
                <>
                  <div className="flex items-center gap-3 rounded-lg bg-surface/30 p-3">
                    <Cpu className="h-5 w-5 shrink-0 text-secondary-text" />
                    <div className="min-w-0">
                      <p className="text-xs text-secondary-text">OpenCV in the API process</p>
                      <p className="break-all font-medium text-primary-text">{health.opencv}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg bg-surface/30 p-3">
                    <Server className="h-5 w-5 shrink-0 text-secondary-text" />
                    <div className="min-w-0">
                      <p className="text-xs text-secondary-text">Application</p>
                      <p className="break-all font-medium text-primary-text">
                        {health.app} {health.version}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-surface/30 p-3">
                    <div className="flex items-center gap-3">
                      <Database className="h-5 w-5 shrink-0 text-secondary-text" />
                      <span className="text-sm text-secondary-text">Database</span>
                    </div>
                    <span className="flex items-center gap-2 text-sm text-primary-text">
                      <StatusDot status={health.database === "connected" ? "online" : "offline"} />
                      {health.database}
                    </span>
                  </div>
                  <Row label="Schema revision" value={health.schema_revision} />
                </>
              ) : healthIsError ? (
                <p className="text-sm text-critical">
                  No runtime version to report — <code className="font-mono">GET /health</code>{" "}
                  failed{healthError?.message ? `: ${healthError.message}` : "."} See the notice
                  above.
                </p>
              ) : (
                <p className="text-sm text-warning">
                  The request finished without returning a health payload, so there is no runtime
                  version to report.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={entry.rise}>
          <CapabilitiesPanel />
        </motion.div>
      </motion.div>
    </div>
  );
}
