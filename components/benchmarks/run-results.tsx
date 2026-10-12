"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "@/components/icons";
import { entry, stagger } from "@/lib/motion/presets";
import type { BenchmarkRun } from "@/lib/types";
import {
  categoryBreakdown,
  fmtMeasured,
  NOT_MEASURED,
  parseBenchmarkResults,
} from "./benchmark-results";
import { PairAudit } from "./pair-audit";

/** One telemetry readout: label + measured value, or an explicit absent state. */
function Readout({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const measured = value !== NOT_MEASURED;
  return (
    <div className="rounded-lg bg-surface/30 p-3">
      <p className="text-kicker uppercase text-secondary-text">{label}</p>
      <p
        className={
          measured
            ? "mt-1 font-display text-2xl font-bold tabular-nums text-primary-text"
            : "mt-1 text-sm font-medium text-warning"
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-secondary-text">{hint}</p> : null}
    </div>
  );
}

export function RunResultsPanel({ run }: { run: BenchmarkRun }) {
  const results = useMemo(() => parseBenchmarkResults(run.results), [run.results]);
  const categories = useMemo(
    () => (results.hasPerPair ? categoryBreakdown(results.per_pair) : []),
    [results],
  );

  const { corpus, detection, classification, timing } = results;
  const reproducible = corpus.pairs !== undefined && corpus.seed !== undefined;

  return (
    <motion.div
      className="space-y-6"
      variants={stagger.rail}
      initial="hidden"
      animate="visible"
    >
      {/* Corpus scope — the rule the whole page exists to enforce. */}
      <motion.div variants={entry.boot}>
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium text-primary-text">
              Synthetic-corpus measurement — not accuracy on real plant imagery
            </p>
            <p className="mt-1 text-secondary-text">
              Every figure below was measured by the real detection pipeline against a labelled
              synthetic corpus generated for this run.
              {reproducible ? (
                <>
                  {" "}
                  Re-run it with{" "}
                  <span className="telemetry text-primary-text">pairs = {corpus.pairs}</span> and{" "}
                  <span className="telemetry text-primary-text">seed = {corpus.seed}</span>
                  {corpus.iou_threshold !== undefined ? (
                    <>
                      {" "}at{" "}
                      <span className="telemetry text-primary-text">
                        IoU ≥ {fmtMeasured(corpus.iou_threshold)}
                      </span>
                    </>
                  ) : null}
                  , against the corpus generator that produced it. The seed fixes the
                  layout and defect placements, but a change to how the panel or the
                  defects are drawn alters the corpus and therefore these numbers —
                  runs stored before such a change are not expected to reproduce.
                </>
              ) : (
                " The run did not return its pair count or seed, so it cannot be reproduced from what is stored."
              )}
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={entry.boot}>
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">{run.name}</CardTitle>
            <CardDescription>
              {run.description ? `${run.description} · ` : ""}
              Stored run <code className="font-mono">{run.id}</code> ·{" "}
              <span className="telemetry">duration_ms {fmtMeasured(run.durationMs)}</span> as
              recorded by the API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!results.hasAnyMeasurement && (
              <p className="text-sm text-warning">
                This stored row carries no numeric results — the API returned{" "}
                <code className="font-mono">results_json</code> without measurement fields, so
                there is nothing to show. Treat it as a record that the endpoint was called, not
                as a measurement.
              </p>
            )}

            <div>
              <p className="text-kicker uppercase text-secondary-text">Detection</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Readout
                  label="Precision"
                  value={fmtMeasured(detection.precision)}
                  hint="TP / (TP + FP) over corpus matches"
                />
                <Readout
                  label="Recall"
                  value={fmtMeasured(detection.recall)}
                  hint="TP / (TP + FN) over corpus matches"
                />
                <Readout
                  label="F1"
                  value={fmtMeasured(detection.f1_score)}
                  hint="Returned by the API, not recomputed"
                />
                <Readout
                  label="Mean IoU"
                  value={fmtMeasured(detection.mean_iou)}
                  hint="Overlap of matched boxes"
                />
                <Readout label="True positives" value={fmtMeasured(detection.true_positives)} />
                <Readout label="False positives" value={fmtMeasured(detection.false_positives)} />
                <Readout label="False negatives" value={fmtMeasured(detection.false_negatives)} />
                <Readout
                  label="Matched localisations"
                  value={fmtMeasured(detection.matched_localisations)}
                />
              </div>
            </div>

            <div>
              <p className="text-kicker uppercase text-secondary-text">
                Category classification
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Readout
                  label="Accuracy"
                  value={
                    classification.accuracy !== undefined
                      ? fmtMeasured(classification.accuracy)
                      : "Not measured"
                  }
                  hint={
                    classification.correct !== undefined && classification.scored !== undefined
                      ? `${classification.correct} of ${classification.scored} matched boxes scored`
                      : "No classification block returned"
                  }
                />
                <Readout label="Correct" value={fmtMeasured(classification.correct)} />
                <Readout label="Scored" value={fmtMeasured(classification.scored)} />
              </div>
            </div>

            <div>
              <p className="text-kicker uppercase text-secondary-text">Timing</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Readout label="Pipeline ms" value={fmtMeasured(timing.pipeline_ms)} />
                <Readout label="Per-pair ms" value={fmtMeasured(timing.per_pair_ms)} />
                <Readout
                  label="Wall ms"
                  value={fmtMeasured(corpus.wall_ms)}
                  hint="corpus.wall_ms from the response"
                />
                <Readout label="Run duration ms" value={fmtMeasured(run.durationMs)} />
              </div>
            </div>

            <div>
              <p className="text-kicker uppercase text-secondary-text">Corpus</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Readout label="Pairs" value={fmtMeasured(corpus.pairs)} />
                <Readout label="Seed" value={fmtMeasured(corpus.seed)} />
                <Readout
                  label="Resolution"
                  value={
                    corpus.resolution
                      ? `${corpus.resolution[0]} × ${corpus.resolution[1]}`
                      : NOT_MEASURED
                  }
                />
                <Readout
                  label="Ground-truth defects"
                  value={fmtMeasured(corpus.ground_truth_defects)}
                />
                <Readout label="Clean pairs" value={fmtMeasured(corpus.clean_pairs)} />
                <Readout
                  label="Clean pairs with FP"
                  value={fmtMeasured(corpus.pairs_with_false_positive_on_clean_input)}
                  hint="False positives raised on defect-free input"
                />
                <Readout
                  label="Offset range px"
                  value={fmtMeasured(corpus.geometric_offset_range_px)}
                />
                <Readout label="IoU threshold" value={fmtMeasured(corpus.iou_threshold)} />
              </div>
            </div>

            {results.hasPerPair && categories.length > 0 && (
              <div>
                <p className="text-kicker uppercase text-secondary-text">
                  Category breakdown
                </p>
                <p className="mt-1 text-xs text-secondary-text">
                  Counted from the <code className="font-mono">per_pair</code> audit rows this run
                  returned: ground-truth boxes per category versus boxes the detector predicted
                  with that label. The API does not return which prediction matched which
                  ground-truth box, so this is a label-count comparison, not per-category
                  precision. Where predicted trails ground truth, recall is being lost on that
                  category.
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-secondary-text">
                        <th className="pr-4 py-2 font-medium">Category</th>
                        <th className="pr-4 py-2 font-medium">Ground-truth boxes</th>
                        <th className="pr-4 py-2 font-medium">Predicted boxes</th>
                        <th className="py-2 font-medium">Gap (measured − predicted)</th>
                      </tr>
                    </thead>
                    <tbody className="telemetry">
                      {categories.map((row) => {
                        const gap = row.ground_truth_boxes - row.predicted_boxes;
                        return (
                          <tr key={row.category} className="border-t border-border/50">
                            <td className="pr-4 py-2 font-mono text-primary-text">
                              {row.category}
                            </td>
                            <td className="pr-4 py-2 tabular-nums text-primary-text">
                              {row.ground_truth_boxes}
                            </td>
                            <td className="pr-4 py-2 tabular-nums text-primary-text">
                              {row.predicted_boxes}
                            </td>
                            <td className="py-2 tabular-nums">
                              {gap === 0 ? (
                                <Badge variant="success">0</Badge>
                              ) : (
                                <Badge variant={gap > 0 ? "warning" : "info"}>
                                  {gap > 0 ? `−${gap} missed` : `+${-gap} extra labels`}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {results.hasPerPair && categories.length === 0 && (
              <p className="text-sm text-warning">
                The run returned an empty <code className="font-mono">per_pair</code> list, so no
                category breakdown could be derived.
              </p>
            )}

            {run.config && Object.keys(run.config).length > 0 && (
              <div>
                <p className="text-kicker uppercase text-secondary-text">Stored config</p>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface/40 p-3 font-mono text-xs text-secondary-text">
                  {JSON.stringify(run.config, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={entry.rise}>
        <PairAudit pairs={results.per_pair} hasPerPair={results.hasPerPair} />
      </motion.div>
    </motion.div>
  );
}
