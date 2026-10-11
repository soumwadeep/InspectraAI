"use client";

import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useBenchmarks, useSystemHealth } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";
import { entry, stagger } from "@/lib/motion/presets";
import { Gauge, AlertCircle, Database, Server, Cpu, Clock } from "@/components/icons";

/** Copied from the error message in `components/mission/system-health-panel.tsx`. */
const BACKEND_START_COMMAND = "python3 -m uvicorn app.main:app --port 8000";

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

export default function BenchmarksPage() {
  const {
    data: benchmarks,
    isLoading,
    isError,
    error: benchmarksError,
  } = useBenchmarks();
  const {
    data: health,
    isLoading: healthLoading,
    isError: healthIsError,
    error: healthError,
  } = useSystemHealth();

  const runCount = benchmarks?.length ?? 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-display font-bold text-gradient-hero">
          Performance Benchmarks
        </h1>
        <p className="mt-1 text-secondary-text">
          No verified benchmark dataset exists yet, so this page reports only what the API can
          actually return: the OpenCV build the server is running, and the rows stored in{" "}
          <code className="font-mono">benchmark_runs</code>.
        </p>
      </motion.div>

      {/* Query failures are stated, not hidden behind an empty chart */}
      {(isError || healthIsError) && (
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {isError && (
            <OfflineNotice
              endpoint="GET /api/benchmarks"
              reason={benchmarksError?.message}
            />
          )}
          {healthIsError && (
            <OfflineNotice endpoint="GET /health" reason={healthError?.message} />
          )}
        </motion.div>
      )}

      {/* Runtime facts, read from the live process */}
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
                <Gauge className="h-5 w-5 text-primary" />
                Vision runtime
              </CardTitle>
              <CardDescription>
                Read live from <code className="font-mono">GET /health</code> — not a benchmark
                result
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
                      <p className="font-medium break-all text-primary-text">{health.opencv}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg bg-surface/30 p-3">
                    <Server className="h-5 w-5 shrink-0 text-secondary-text" />
                    <div className="min-w-0">
                      <p className="text-xs text-secondary-text">Application</p>
                      <p className="font-medium break-all text-primary-text">
                        {health.app} {health.version}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-surface/30 p-3">
                    <div className="flex items-center gap-3">
                      <Database className="h-5 w-5 shrink-0 text-secondary-text" />
                      <span className="text-sm text-secondary-text">Database</span>
                    </div>
                    <Badge
                      variant={health.database === "connected" ? "success" : "critical"}
                    >
                      {health.database}
                    </Badge>
                  </div>
                  <Row label="Schema revision" value={health.schema_revision} />
                </>
              ) : healthIsError ? (
                <p className="text-sm text-critical">
                  No runtime version to report —{" "}
                  <code className="font-mono">GET /health</code> failed
                  {healthError?.message ? `: ${healthError.message}` : "."} See the notice above.
                </p>
              ) : (
                <p className="text-sm text-warning">
                  The request finished without returning a health payload, so there is no runtime
                  version to report. Reload this page; if it repeats, the API is not serving{" "}
                  <code className="font-mono">/health</code>.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={entry.rise}>
          <Card className="border-border/50 bg-surface-elevated/30">
            <CardHeader>
              <CardTitle className="text-primary-text flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-warning" />
                Why there are no numbers here
              </CardTitle>
              <CardDescription>
                What was removed from this page, and why it could not have been true
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-secondary-text">
              <p>
                <span className="font-medium text-primary-text">COOL is not installed.</span> The
                backend depends on <code className="font-mono">opencv-python-headless</code> and
                no file under <code className="font-mono">backend/app</code> references COOL,
                contrib, or UMat. The per-operation COOL-vs-standard latency table and the
                x86-64 vs Graviton2 comparison chart on this page were fabricated and are gone,
                along with the &quot;AWS Graviton2&quot; environment block.
              </p>
              <p>
                <span className="font-medium text-primary-text">No labelled ground truth.</span>{" "}
                <code className="font-mono">
                  backend/app/vision/metrics.py::calculate_precision_recall
                </code>{" "}
                needs predicted and ground-truth boxes; nothing in the project supplies them, so
                the Precision / Recall / F1 / false-positive figures removed here had no source.
              </p>
              <p>
                <span className="font-medium text-primary-text">
                  <code className="font-mono">POST /api/benchmarks/run</code> is not a
                  measurement.
                </span>{" "}
                It imports the vision modules and writes hardcoded &quot;passed&quot; strings without
                opening an image. That is why this page deliberately has no Run benchmark
                button: pressing it would record a pass that never happened.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Run history — the only listable real data */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text flex items-center gap-2">
              <Clock className="h-5 w-5 text-secondary" />
              Stored benchmark runs
            </CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading from GET /api/benchmarks"
                : `${runCount} run${runCount === 1 ? "" : "s"} returned by GET /api/benchmarks`}
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
                <p className="text-sm font-medium text-primary-text">
                  The run list is empty.
                </p>
                <p className="mt-1 text-sm text-secondary-text">
                  A real benchmark run requires a labelled ground-truth dataset, which does not
                  exist yet — there is no annotated defect corpus in{" "}
                  <code className="font-mono">backend/storage</code> and nothing in the API can
                  produce one. Until it exists, there is no latency or accuracy figure to list.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-warning">
                  Rows below are whatever the{" "}
                  <code className="font-mono">POST /api/benchmarks/run</code> handler recorded.
                  That handler hardcodes its &quot;passed&quot; markers without processing an image, so a
                  row is proof the endpoint was called — not evidence of a measurement.
                </p>
                {benchmarks?.map((run) => (
                  <motion.div
                    key={run.id}
                    className="glass rounded-lg p-4"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-primary-text">{run.name}</p>
                        {run.description && (
                          <p className="text-sm text-secondary-text">{run.description}</p>
                        )}
                        <p className="mt-1 break-all text-xs text-secondary-text">
                          <code className="font-mono">{run.id}</code> · recorded{" "}
                          {formatDate(run.createdAt)}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 font-mono">
                        {run.durationMs} ms
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(run.results).map(([key, value]) => (
                        <Badge key={key} variant="default" className="font-mono">
                          {key}:{" "}
                          {typeof value === "object" ? JSON.stringify(value) : String(value)}
                        </Badge>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
