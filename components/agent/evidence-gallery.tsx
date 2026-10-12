"use client";

/**
 * The evidence this run produced.
 *
 * Findings and their evidence rows are read from the raw
 * `GET /api/inspections/{id}` body because `adaptFinding` flattens evidence to a
 * list of storage paths and throws away `evidence_type` and `caption` — the two
 * fields that make an artifact identifiable. Bytes come from the auth-protected
 * evidence route through `fetchBlobUrl`, and only for findings the reviewer has
 * opened: a seven-finding run carries six artifacts each, and fetching 42 images to
 * render a collapsed panel is not a thing this page does.
 */
import { useState } from "react";
import { motion } from "framer-motion";

import {
  countEvidenceByType,
  evidenceBlobPath,
  evidenceTypeLabel,
  formatReturnedNumber,
  parseMeasurements,
  severityVariant,
  type RunFinding,
} from "@/components/agent/agent-data";
import { AuthImage } from "@/components/agent/auth-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { entry, stagger } from "@/lib/motion/presets";
import { ChevronRight, FileImage, AlertTriangle } from "@/components/icons";
import { cn } from "@/lib/utils";

interface EvidenceGalleryProps {
  findings: RunFinding[];
  isLoading: boolean;
  errorMessage: string | null;
  inspectionId: string | null;
}

export function EvidenceGallery({
  findings,
  isLoading,
  errorMessage,
  inspectionId,
}: EvidenceGalleryProps) {
  // Findings arrive after this component mounts, so the default cannot be baked
  // into the initial state: the first finding reads as open unless the reviewer has
  // explicitly toggled it. One finding's artifacts is an honest amount to fetch.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (id: string, index: number) => toggled[id] ?? index === 0;

  const totals = countEvidenceByType(findings);
  const artifactCount = totals.reduce((sum, [, count]) => sum + count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileImage className="h-4 w-4 text-secondary-text" />
          <CardTitle className="text-primary-text">Evidence produced</CardTitle>
          {!isLoading && !errorMessage && (
            <Badge variant={findings.length ? "info" : "outline"} className="text-[10px]">
              {findings.length} finding(s) · {artifactCount} artifact(s)
            </Badge>
          )}
        </div>
        <CardDescription>
          Persisted findings for inspection{" "}
          <code className="telemetry text-xs">{inspectionId ?? "not returned"}</code>, with
          each artifact&rsquo;s stored `evidence_type` and caption.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {errorMessage && !isLoading && (
          <div className="flex items-start gap-3 rounded-lg border border-critical/40 bg-critical/5 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
            <div>
              <p className="text-sm font-medium text-primary-text">
                Findings could not be loaded
              </p>
              <p className="mt-1 text-xs text-secondary-text">{errorMessage}</p>
            </div>
          </div>
        )}

        {!isLoading && !errorMessage && findings.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-secondary-text">
            This inspection has no findings on the record. A run that paused at the
            quality gate, or one whose alignment never succeeded, legitimately produces
            none — the absence is the real state, not a loading gap.
          </p>
        )}

        {totals.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {totals.map(([type, count]) => (
              <li
                key={type}
                className="inline-flex items-baseline gap-1.5 rounded border border-border bg-surface/40 px-2 py-1"
              >
                <span className="telemetry text-[10px] uppercase text-secondary-text">
                  {type}
                </span>
                <span className="telemetry text-xs font-semibold text-primary-text">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        )}

        <motion.div
          className="space-y-3"
          variants={stagger.rail}
          initial="hidden"
          animate="visible"
        >
          {findings.map((finding, index) => (
            <FindingBlock
              key={finding.id}
              finding={finding}
              open={isOpen(finding.id, index)}
              onToggle={() =>
                setToggled((current) => ({
                  ...current,
                  [finding.id]: !(current[finding.id] ?? index === 0),
                }))
              }
            />
          ))}
        </motion.div>
      </CardContent>
    </Card>
  );
}

function FindingBlock({
  finding,
  open,
  onToggle,
}: {
  finding: RunFinding;
  open: boolean;
  onToggle: () => void;
}) {
  const measurements = parseMeasurements(finding.description);

  return (
    <motion.div variants={entry.boot} className="rounded-lg border border-border bg-surface/30">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm font-semibold text-primary-text">{finding.category}</code>
            <Badge variant={severityVariant(finding.severity)} className="text-[10px]">
              {finding.severity ?? "severity not returned"}
            </Badge>
            {finding.verificationStatus && (
              <Badge variant="outline" className="telemetry text-[10px]">
                {finding.verificationStatus}
              </Badge>
            )}
            <span className="telemetry text-[11px] text-secondary-text">
              confidence: {formatReturnedNumber(finding.confidence)}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggle}
            aria-expanded={open}
          >
            <ChevronRight
              className={cn("mr-1.5 h-3.5 w-3.5", open && "rotate-90")}
              aria-hidden
            />
            {open
              ? "Hide artifacts"
              : `Show ${finding.evidence.length} artifact(s)`}
          </Button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-primary-text">
          {finding.description || "No description returned."}
        </p>
        {finding.detectionMethod && (
          <p className="mt-1.5 telemetry text-[11px] text-secondary-text">
            detection_method: {finding.detectionMethod}
          </p>
        )}
        {measurements.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {measurements.map((measurement, index) => (
              <li
                key={`${measurement.label}-${index}`}
                className="inline-flex items-baseline gap-1.5 rounded border border-primary/20 bg-primary/5 px-2 py-0.5"
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
        <p className="mt-2 telemetry text-[10px] text-secondary-text/70">
          {finding.evidence.length} evidence row(s) on this finding
        </p>
      </div>

      {open && (
        <div className="border-t border-border p-4 pt-3">
          {finding.evidence.length === 0 ? (
            <p className="text-xs text-secondary-text">
              This finding was stored without evidence rows, so there is nothing to
              show for it.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {finding.evidence.map((row) => (
                <figure
                  key={row.id}
                  className="flex flex-col gap-2 rounded border border-border bg-bg-deep/30 p-2"
                >
                  <AuthImage
                    apiPath={evidenceBlobPath(finding.id, row.id)}
                    alt={`${evidenceTypeLabel(row.evidenceType)} for ${finding.category}`}
                    frameClassName="shrink-0"
                  />
                  <figcaption className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="telemetry text-[9px]">
                        {row.evidenceType}
                      </Badge>
                      {row.regionIndex !== null && (
                        <span className="telemetry text-[10px] text-secondary-text">
                          region {row.regionIndex}
                        </span>
                      )}
                    </div>
                    <p className="text-xs leading-snug text-primary-text">
                      {evidenceTypeLabel(row.evidenceType)}
                    </p>
                    {row.caption ? (
                      <p className="text-[11px] leading-snug text-secondary-text">
                        {row.caption}
                      </p>
                    ) : (
                      <p className="text-[11px] leading-snug text-secondary-text/60">
                        no caption returned
                      </p>
                    )}
                    <p className="telemetry break-all text-[9px] text-secondary-text/50">
                      {row.storagePath}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
