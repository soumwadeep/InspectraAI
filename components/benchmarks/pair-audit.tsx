"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMeasured, NOT_MEASURED, type PairAudit as PairAuditRow } from "./benchmark-results";

/**
 * Renders one pair as an SVG with ground-truth boxes (cyan, dashed) and raw
 * detector predictions (success green, solid). The response coordinates are
 * relative 0-1; the viewBox scales them by 100 so stroke widths behave like
 * ordinary drawing units. No pixel geometry is invented — the panel is just a
 * coordinate plane.
 */
function PairFrame({ pair }: { pair: PairAuditRow }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-28 w-full rounded-md border border-border bg-surface/60"
      role="img"
      aria-label={`Audit frame for ${pair.label}: ${pair.ground_truths.length} ground-truth box(es), ${pair.predictions.length} prediction(s)`}
    >
      <rect x="0" y="0" width="100" height="100" fill="transparent" />
      {pair.ground_truths.map((gt, index) => {
        const [x1, y1, x2, y2] = gt.box;
        const width = Math.max((x2 - x1) * 100, 0);
        const height = Math.max((y2 - y1) * 100, 0);
        return (
          <rect
            key={`gt-${index}`}
            x={x1 * 100}
            y={y1 * 100}
            width={width}
            height={height}
            fill="rgb(var(--color-primary) / 0.08)"
            stroke="rgb(var(--color-primary))"
            strokeWidth="0.7"
            strokeDasharray="2.2 1.4"
          >
            <title>{`Ground truth: ${gt.category} [${gt.box.map((n) => n.toFixed(3)).join(", ")}]`}</title>
          </rect>
        );
      })}
      {pair.predictions.map((pred, index) => {
        const [x1, y1, x2, y2] = pred.box;
        const width = Math.max((x2 - x1) * 100, 0);
        const height = Math.max((y2 - y1) * 100, 0);
        return (
          <rect
            key={`pred-${index}`}
            x={x1 * 100}
            y={y1 * 100}
            width={width}
            height={height}
            fill="none"
            stroke="rgb(var(--color-success))"
            strokeWidth="0.7"
          >
            <title>
              {`Prediction${pred.category ? `: ${pred.category}` : ""}${
                pred.confidence !== undefined ? ` (confidence ${pred.confidence.toFixed(4)})` : ""
              } [${pred.box.map((n) => n.toFixed(3)).join(", ")}]`}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-secondary-text">
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-3 w-6 border border-dashed border-primary bg-primary/10"
        />
        Ground-truth box (labelled corpus input)
      </span>
      <span className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-3 w-6 border border-success" />
        Raw detector prediction
      </span>
      <span>Hover a rectangle for its exact relative coordinates.</span>
    </div>
  );
}

export function PairAudit({
  pairs,
  hasPerPair,
}: {
  pairs: PairAuditRow[];
  hasPerPair: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-primary-text">Per-pair audit</CardTitle>
        <CardDescription>
          The <code className="font-mono">per_pair</code> rows the API returned for this run.
          Ground-truth boxes and raw predictions are drawn from their relative 0-1 coordinates;
          the counts beside each pair are the API&apos;s per-pair detection metrics. Use this to
          check the aggregate above against the rows it came from.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasPerPair ? (
          <p className="text-sm text-warning">
            This stored run did not return a <code className="font-mono">per_pair</code> array, so
            there is nothing to audit. Newer runs include it.
          </p>
        ) : pairs.length === 0 ? (
          <p className="text-sm text-warning">
            The <code className="font-mono">per_pair</code> array was present but empty (or its
            entries did not carry parseable rows).
          </p>
        ) : (
          <>
            <Legend />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pairs.map((pair, index) => {
                const key = `${pair.label}-${index}`;
                const isOpen = expanded === key;
                return (
                  <div key={key} className="rounded-lg border border-border bg-surface/30 p-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="w-full text-left"
                      aria-expanded={isOpen}
                    >
                      <p className="truncate font-mono text-xs text-primary-text">{pair.label}</p>
                      <PairFrame pair={pair} />
                    </button>
                    <dl className="telemetry mt-2 space-y-0.5 text-xs text-secondary-text">
                      <div className="flex justify-between gap-2">
                        <dt>GT boxes</dt>
                        <dd className="text-primary-text">
                          {pair.ground_truth_count !== undefined
                            ? `${pair.ground_truths.length} drawn of ${pair.ground_truth_count} reported`
                            : `${pair.ground_truths.length} drawn`}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Predictions</dt>
                        <dd className="text-primary-text">{pair.predictions.length}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>TP / FP / FN</dt>
                        <dd className="text-primary-text">
                          {fmtMeasured(pair.detection.true_positives)} /{" "}
                          {fmtMeasured(pair.detection.false_positives)} /{" "}
                          {fmtMeasured(pair.detection.false_negatives)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>SSIM / mean abs diff</dt>
                        <dd className="text-primary-text">
                          {pair.hasMeasured
                            ? `${fmtMeasured(pair.ssim_score)} / ${fmtMeasured(pair.mean_abs_diff)}`
                            : NOT_MEASURED}
                        </dd>
                      </div>
                    </dl>
                    {isOpen && (
                      <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-xs">
                        {pair.ground_truths.length === 0 && pair.predictions.length === 0 ? (
                          <p className="text-secondary-text">
                            No ground-truth or prediction boxes returned for this pair.
                          </p>
                        ) : null}
                        {pair.ground_truths.map((gt, i) => (
                          <p key={`gt-${i}`} className="font-mono text-secondary-text">
                            <span className="text-primary">GT</span> {gt.category} @{" "}
                            {gt.box.map((n) => n.toFixed(4)).join(", ")}
                          </p>
                        ))}
                        {pair.predictions.map((pred, i) => (
                          <p key={`pred-${i}`} className="font-mono text-secondary-text">
                            <span className="text-success">PRED</span>{" "}
                            {pred.category ?? "uncategorized"}{" "}
                            {pred.confidence !== undefined
                              ? `(conf ${pred.confidence.toFixed(4)})`
                              : "(no confidence returned)"}{" "}
                            @ {pred.box.map((n) => n.toFixed(4)).join(", ")}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
