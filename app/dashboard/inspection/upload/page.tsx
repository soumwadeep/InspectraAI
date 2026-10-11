"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  FileImage,
  Scan,
  UploadCloud,
  X,
} from "@/components/icons";
import { useEquipment } from "@/lib/hooks";
import {
  api,
  storageUrl,
  VisionInspectResult,
  VisionQuality,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

type Phase = "idle" | "uploading" | "analyzing" | "done" | "error";

interface RunResult {
  quality: VisionQuality;
  inspection: VisionInspectResult;
  elapsedMs: number;
  inspectionId: string;
}

const PHASES: Array<{ key: Phase; label: string; detail: string }> = [
  { key: "uploading", label: "Record", detail: "Create inspection, store input" },
  { key: "analyzing", label: "OpenCV 5", detail: "Quality, alignment, change detection" },
  { key: "done", label: "Results", detail: "Regions, evidence, recommendations" },
];

export default function UploadInspectPage() {
  const { data: equipment, isLoading: equipmentLoading } = useEquipment();
  const { toast } = useToast();

  const [equipmentId, setEquipmentId] = useState("");
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const selected = equipment?.find((item) => item.id === equipmentId);
  const hasStoredReference = (selected?.referenceImages?.length ?? 0) > 0;
  const busy = phase === "uploading" || phase === "analyzing";

  const addFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    // One image per run: /api/vision/inspect compares a single capture against
    // the reference, and accepting more implied a batch capability that does not
    // exist on the backend.
    setCurrentFile(files[0]);
    setResult(null);
    setError(null);
  }, []);

  const addReference = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    setReferenceFile(files[0]);
  }, []);

  async function resolveReferenceFile(): Promise<File | null> {
    if (!selected) return null;

    if (referenceFile) {
      // Persist it, so the next inspection of this asset has a stored target
      // instead of silently re-uploading the same file every run.
      await api.equipment.uploadReferenceImage(selected.id, referenceFile);
      return referenceFile;
    }
    const stored = selected.referenceImages?.[0];
    if (!stored) return null;

    const response = await fetch(storageUrl(stored.storagePath));
    if (!response.ok) {
      throw new Error(
        `Stored reference image could not be loaded (HTTP ${response.status})`,
      );
    }
    const blob = await response.blob();
    return new File([blob], stored.filename, {
      type: blob.type || "image/jpeg",
    });
  }

  async function handleRun() {
    if (!selected || !currentFile) {
      setError("Select equipment and provide an inspection image first.");
      return;
    }

    setError(null);
    setResult(null);

    try {
      setPhase("uploading");
      const inspection = await api.inspections.create(selected.id);

      const reference = await resolveReferenceFile();
      if (!reference) {
        throw new Error(
          `${selected.name} has no reference image. Add one below or on the equipment page.`,
        );
      }

      setPhase("analyzing");
      const started = performance.now();
      await api.inspections.uploadInput(inspection.id, currentFile);
      const quality = await api.vision.quality(currentFile);
      const inspected = await api.vision.inspect(reference, currentFile);
      const elapsedMs = Math.round(performance.now() - started);

      setResult({
        quality: quality.quality,
        inspection: inspected,
        elapsedMs,
        inspectionId: inspection.id,
      });
      setPhase("done");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
  }

  function reset() {
    setPhase("idle");
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display font-bold text-gradient-hero">Inspection studio</h1>
        <p className="mt-1 text-secondary-text">
          Compare an inspection image against an equipment reference using the
          OpenCV 5 pipeline. Every number below comes from a real call.
        </p>
      </div>

      {/* Phase rail: driven by the actual request stage, not a simulated timer. */}
      <div className="flex items-center gap-3">
        {PHASES.map((step, index) => {
          const order = ["uploading", "analyzing", "done"];
          const activeIndex = order.indexOf(phase);
          const isDone = phase === "done" || (activeIndex > -1 && activeIndex > index);
          const isCurrent = phase === step.key;
          return (
            <div key={step.key} className="flex flex-1 items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  isCurrent && "bg-primary text-background",
                  isDone && "bg-success/20 text-success",
                  !isCurrent && !isDone && "bg-surface-elevated text-secondary-text",
                )}
              >
                {isDone ? <CheckCircle className="h-4 w-4" /> : index + 1}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-primary-text">{step.label}</p>
                <p className="truncate text-xs text-secondary-text">{step.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">1 · Equipment</CardTitle>
            <CardDescription>
              Supplies the reference image the inspection is aligned to.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {equipmentLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (equipment?.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-border bg-surface/30 p-4 text-sm">
                <p className="text-secondary-text">No equipment registered yet.</p>
                <Button size="sm" className="mt-3" asChild>
                  <Link href="/dashboard/equipment">Go to equipment</Link>
                </Button>
              </div>
            ) : (
              <>
                <Select
                  value={equipmentId}
                  onChange={(event) => {
                    setEquipmentId(event.target.value);
                    setReferenceFile(null);
                    reset();
                  }}
                >
                  <option value="">Select equipment…</option>
                  {(equipment ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {item.category}
                    </option>
                  ))}
                </Select>

                {selected && (
                  <div className="flex items-center justify-between rounded-lg bg-surface/30 p-3 text-xs">
                    <span className="text-secondary-text">Reference image</span>
                    {hasStoredReference ? (
                      <span className="text-success">
                        {selected.referenceImages?.[0]?.filename}
                      </span>
                    ) : (
                      <span className="text-warning">None stored</span>
                    )}
                  </div>
                )}

                {!hasStoredReference && selected && (
                  <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                    <p className="text-xs text-secondary-text">
                      Upload one now — it is stored against the equipment and used
                      for every later inspection of this asset.
                    </p>
                    <input
                      ref={referenceInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => addReference(event.target.files)}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => referenceInputRef.current?.click()}
                      >
                        Choose reference image
                      </Button>
                      {referenceFile && (
                        <span className="truncate text-xs text-primary-text">
                          {referenceFile.name}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">2 · Inspection image</CardTitle>
            <CardDescription>Drop a capture or choose a file.</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => addFiles(event.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addFiles(event.dataTransfer.files);
              }}
              className="flex h-40 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/50 bg-surface/30 text-center transition-colors hover:border-primary/50 hover:bg-surface/50"
            >
              <UploadCloud className="h-10 w-10 text-secondary-text/50" />
              <span className="mt-2 text-sm text-secondary-text">
                Drag an image here or click to browse
              </span>
            </button>

            {currentFile && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-border/50 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileImage className="h-4 w-4 shrink-0 text-secondary-text" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-primary-text">{currentFile.name}</p>
                    <p className="text-xs text-secondary-text tabular-nums">
                      {(currentFile.size / 1024).toFixed(0)} KB ·{" "}
                      {(currentFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentFile(null);
                    reset();
                  }}
                  className="rounded-full bg-critical/20 p-1 text-critical hover:bg-critical/30"
                  aria-label="Remove selected image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              {result && (
                <Button variant="outline" size="sm" onClick={reset}>
                  Start over
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleRun}
                disabled={busy || !selected || !currentFile}
              >
                {busy ? (
                  <>
                    <Scan className="mr-2 h-4 w-4 animate-pulse" />
                    {phase === "uploading" ? "Recording…" : "Analyzing…"}
                  </>
                ) : (
                  <>
                    <Scan className="mr-2 h-4 w-4" />
                    Run OpenCV analysis
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-critical/40">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
              <div>
                <p className="text-sm font-medium text-primary-text">Analysis failed</p>
                <p className="mt-1 text-sm text-secondary-text">{error}</p>
                <p className="mt-2 text-xs text-secondary-text">
                  The inspection record may already exist; nothing was invented to
                  replace the missing result.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {busy && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      )}

      {result && <AnalysisResults result={result} />}
    </div>
  );
}

function AnalysisResults({ result }: { result: RunResult }) {
  const { quality, inspection, elapsedMs, inspectionId } = result;
  const insufficient = quality.inspection_suitability === "insufficient";
  const anomalies = inspection.anomalies ?? [];

  return (
    <div className="space-y-4">
      <Card className={insufficient ? "border-warning/40" : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary-text">
            Image quality
            <Badge variant={insufficient ? "warning" : "success"}>
              {quality.inspection_suitability}
            </Badge>
          </CardTitle>
          <CardDescription>
            Laplacian variance, HSV glare and edge coverage measured on the uploaded
            bytes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Blur score" value={quality.blur_score.toFixed(1)} hint="min 100" />
            <Metric label="Exposure" value={quality.exposure_score.toFixed(3)} hint="0–1" />
            <Metric label="Glare" value={quality.glare_estimate.toFixed(4)} hint="specular fraction" />
            <Metric label="Coverage" value={quality.image_coverage.toFixed(3)} hint="subject area" />
          </div>

          {quality.reasons.length > 0 && (
            <ul className="space-y-1">
              {quality.reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2 text-sm text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Alignment to reference</CardTitle>
            <CardDescription>ORB features matched, then RANSAC homography.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Status" value={inspection.alignment.status} />
              <Metric label="Confidence" value={inspection.alignment.confidence.toFixed(3)} />
              <Metric label="Keypoints matched" value={String(inspection.alignment.matched_keypoints)} />
              <Metric label="Inlier ratio" value={inspection.alignment.inlier_ratio.toFixed(3)} />
              <Metric
                label="Reprojection error"
                value={`${inspection.alignment.reprojection_error.toFixed(2)} px`}
              />
              <Metric label="Regions found" value={String(inspection.change_detection.num_changed_regions)} />
            </div>
            {inspection.alignment.reason && (
              <p className="text-sm text-secondary-text">{inspection.alignment.reason}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Change detection</CardTitle>
            <CardDescription>
              Absolute difference, thresholded, morphologically cleaned, then contoured.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Status" value={inspection.change_detection.status} />
              <Metric label="Change fraction" value={inspection.change_detection.change_fraction.toFixed(4)} />
              <Metric label="Mean absolute diff" value={inspection.change_detection.mean_abs_diff.toFixed(2)} />
              <Metric
                label="Similarity (SSIM)"
                value={inspection.change_detection.ssim_score.toFixed(4)}
                hint="1.0 means structurally identical"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface/30 p-3 text-xs">
              <span className="text-secondary-text">Processing time</span>
              <span className="font-mono tabular-nums text-primary-text">
                server {inspection.processing_time_ms.toFixed(0)} ms · client {elapsedMs} ms
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">Detected regions</CardTitle>
          <CardDescription>
            Coordinates are relative to the reference frame, so they scale with any
            display size.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {anomalies.length === 0 ? (
            <p className="text-sm text-secondary-text">
              No regions above the difference threshold. This is a real result, not a
              missing one.
            </p>
          ) : (
            <div className="space-y-2">
              {anomalies.slice(0, 12).map((anomaly, index) => (
                <div
                  key={`${anomaly.description}-${index}`}
                  className="flex items-start justify-between gap-4 rounded-lg bg-surface/30 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary-text">
                      {anomaly.category}
                    </p>
                    <p className="truncate text-xs text-secondary-text">{anomaly.description}</p>
                    <p className="mt-1 font-mono text-[11px] text-secondary-text tabular-nums">
                      x {anomaly.bbox.x.toFixed(3)} y {anomaly.bbox.y.toFixed(3)} w{" "}
                      {anomaly.bbox.width.toFixed(3)} h {anomaly.bbox.height.toFixed(3)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={anomaly.severity as "critical" | "warning" | "info"}>
                      {anomaly.severity}
                    </Badge>
                    <span className="font-mono text-xs text-secondary-text tabular-nums">
                      {(anomaly.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
              {anomalies.length > 12 && (
                <p className="text-xs text-secondary-text">
                  {anomalies.length - 12} further regions not shown.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {inspection.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary-text">
              <Bot className="h-4 w-4 text-secondary" />
              Pipeline recommendations
            </CardTitle>
            <CardDescription>
              Produced by the vision engine from the measurements above. The agent
              loop that acts on these lands in Phase 3.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {inspection.recommendations.map((recommendation) => (
                <li
                  key={recommendation}
                  className="rounded-lg bg-surface/30 p-3 text-sm text-secondary-text"
                >
                  {recommendation}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-secondary-text">
              Inspection <span className="font-mono">{inspectionId.slice(0, 8)}</span>{" "}
              was created and its input image uploaded before analysis ran.
            </p>
          </CardContent>
        </Card>
      )}

      {result.inspection.evidence && (
        <EvidenceGallery evidence={result.inspection.evidence} />
      )}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-surface/30 p-3">
      <p className="text-[11px] uppercase tracking-wide text-secondary-text">{label}</p>
      <p className="mt-1 truncate font-mono text-sm text-primary-text tabular-nums" title={hint}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-secondary-text">{hint}</p>}
    </div>
  );
}

function EvidenceGallery({ evidence }: { evidence: NonNullable<VisionInspectResult["evidence"]> }) {
  const groups = Object.entries(evidence);
  const labels: Record<string, string> = {
    annotated: "Annotated frames",
    cropped: "Region crops",
    comparison: "Comparison overlay",
    diff: "Difference masks",
  };

  return (
    <div className="space-y-4">
      {groups.map(([category, files]) => {
        const entries = Object.entries(files);
        if (entries.length === 0) return null;
        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="text-primary-text">
                {labels[category] ?? category}
              </CardTitle>
              <CardDescription>
                Encoded by OpenCV during this run and returned as base64 PNG.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {entries.slice(0, 12).map(([filename, base64]) => (
                  <figure key={filename} className="overflow-hidden rounded-lg border border-border">
                    <img
                      src={`data:image/png;base64,${base64}`}
                      alt={`${category}: ${filename}`}
                      className="aspect-video w-full object-cover"
                      loading="lazy"
                    />
                    <figcaption className="truncate bg-surface/50 px-2 py-1 text-[10px] text-secondary-text">
                      {filename}
                    </figcaption>
                  </figure>
                ))}
              </div>
              {entries.length > 12 && (
                <p className="mt-2 text-xs text-secondary-text">
                  {entries.length - 12} more not shown.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
