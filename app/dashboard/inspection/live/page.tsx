"use client";

// Live inspection, built on the browser's own camera instead of invented numbers.
//
// The previous version of this page hardcoded quality metrics, drew two fake
// bounding boxes, printed "FPS: 30" and shipped Stop/refresh buttons with no
// handlers. Every one of those is gone: the frame you see is the frame your
// camera produced, and the metrics are the ones OpenCV measured on the bytes
// that were actually uploaded.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle,
  Info,
  Scan,
  Square,
} from "@/components/icons";
import { useEquipment, useSystemHealth } from "@/lib/hooks";
import type { Equipment } from "@/lib/types";
import {
  api,
  storageUrl,
  VisionInspectResult,
  VisionQuality,
} from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/** Copy-pasteable, because a 422/`Failed to fetch` here usually means the API is down. */
const BACKEND_START_COMMAND = "python3 -m uvicorn app.main:app --port 8000";

type CameraSupport = "checking" | "supported" | "unsupported";

interface Capture {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  bytes: number;
  takenAt: string;
}

interface FpsReading {
  value: number;
  /** Which browser API produced the count — see the note under the video. */
  source: "video-frame-callback" | "request-animation-frame";
}

interface CompareResult {
  result: VisionInspectResult;
  clientMs: number;
  referenceName: string;
  referenceUrl: string;
}

function describeCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Camera permission was denied. Allow it for this site in the browser's address-bar permission menu, then press Start camera again.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No camera was found. Connect or enable a camera and try again.";
      case "NotReadableError":
      case "TrackStartError":
        return "The camera is already in use by another application, so the browser could not read from it.";
      case "OverconstrainedError":
        return "The camera did not accept the requested resolution or facing mode.";
      case "SecurityError":
        return "The browser blocked camera access on security grounds (this page must be served over HTTPS or from localhost).";
      default:
        return `Camera could not start: ${err.message || err.name}`;
    }
  }
  return err instanceof Error ? err.message : "Camera could not start.";
}

function describeApiError(err: unknown): string {
  const base = err instanceof Error ? err.message : "The request failed.";
  if (/failed to fetch|networkerror|load failed/i.test(base)) {
    return `${base} The vision API was not reachable at the configured API URL. Start it with \`cd backend && ${BACKEND_START_COMMAND}\`.`;
  }
  return base;
}

/** Optional fields on VisionQuality are only missing on an older backend build. */
function num(value: number | undefined, digits = 3): string {
  return value === undefined ? "not reported" : value.toFixed(digits);
}

function pct(value: number | undefined, digits = 2): string {
  return value === undefined ? "not reported" : `${(value * 100).toFixed(digits)}%`;
}

export default function LiveInspectionPage() {
  const { toast } = useToast();
  const { data: equipment } = useEquipment();
  const {
    data: health,
    isError: healthFailed,
    error: healthError,
  } = useSystemHealth();

  const [support, setSupport] = useState<CameraSupport>("checking");
  const [isLive, setIsLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fps, setFps] = useState<FpsReading | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);

  const [capture, setCapture] = useState<Capture | null>(null);
  const [quality, setQuality] = useState<VisionQuality | null>(null);
  const [qualityBusy, setQualityBusy] = useState(false);

  const [equipmentId, setEquipmentId] = useState("");
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Guards against a slow response overwriting a newer capture. */
  const runIdRef = useRef(0);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamRef.current = null;
    setIsLive(false);
    setFps(null);
    setFrameSize(null);
  }, []);

  // Feature detection happens after mount: `navigator` does not exist during SSR.
  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
      setSupport("unsupported");
      setNotice(
        window.isSecureContext
          ? "This browser does not implement getUserMedia, so no camera can be opened here. There is no simulated feed behind this panel — inspect a saved photo on the inspection studio page instead."
          : `getUserMedia is only available in a secure context. This page is served from ${window.location.origin} over ${window.location.protocol}; use HTTPS or http://localhost to enable the camera.`,
      );
      return;
    }
    setSupport("supported");
  }, []);

  // Stop the camera when leaving the page. A live MediaStream survives a route
  // change unless every track is stopped explicitly, which keeps the hardware
  // indicator on after the user has gone.
  useEffect(
    () => () => {
      const stream = streamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
      streamRef.current = null;
    },
    [],
  );

  // Attach the stream once the <video> element exists and watch the track for
  // the browser ending it (permission revoked mid-session, device unplugged).
  useEffect(() => {
    if (!isLive) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    video.muted = true;
    video.play().catch((err: unknown) => {
      setNotice(
        `The camera opened but the browser refused to play it: ${
          err instanceof Error ? err.message : "unknown reason"
        }`,
      );
    });

    const track = stream.getVideoTracks()[0];
    const handleEnded = () => {
      stopCamera();
      setNotice("The browser ended the camera track, so the feed is off.");
    };
    track?.addEventListener("ended", handleEnded);

    return () => {
      track?.removeEventListener("ended", handleEnded);
      video.srcObject = null;
    };
  }, [isLive, stopCamera]);

  // Measured frame rate. `requestVideoFrameCallback` counts frames the decoder
  // actually presented; where it is unavailable (Firefox) the fallback counts
  // animation frames, which is the display refresh rate and not the camera.
  useEffect(() => {
    if (!isLive) {
      setFps(null);
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    const hasRvfc = typeof video.requestVideoFrameCallback === "function";
    const source: FpsReading["source"] = hasRvfc
      ? "video-frame-callback"
      : "request-animation-frame";

    let cancelled = false;
    let frames = 0;
    let windowStart = performance.now();
    let rvfcHandle = 0;
    let rafHandle = 0;

    const report = (now: number) => {
      const elapsed = now - windowStart;
      if (elapsed < 500) return;
      setFps({ value: Math.round((frames * 1000) / elapsed), source });
      frames = 0;
      windowStart = now;
    };

    const onVideoFrame = (now: number) => {
      if (cancelled) return;
      frames += 1;
      report(now);
      rvfcHandle = video.requestVideoFrameCallback(onVideoFrame);
    };

    const onAnimation = (now: number) => {
      if (cancelled) return;
      frames += 1;
      report(now);
      rafHandle = requestAnimationFrame(onAnimation);
    };

    if (hasRvfc) {
      rvfcHandle = video.requestVideoFrameCallback(onVideoFrame);
    } else {
      rafHandle = requestAnimationFrame(onAnimation);
    }

    return () => {
      cancelled = true;
      if (rvfcHandle) video.cancelVideoFrameCallback(rvfcHandle);
      if (rafHandle) cancelAnimationFrame(rafHandle);
    };
  }, [isLive]);

  // Release the preview blob URL when a capture is replaced or the page unmounts.
  // Object URLs are not garbage collected with the File, so re-capturing repeatedly
  // would keep every frame's bytes alive for the life of the document.
  useEffect(() => {
    if (!capture) return;
    const url = capture.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [capture]);

  async function startCamera() {
    setNotice(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setIsLive(true);
    } catch (err) {
      stopCamera();
      setNotice(describeCameraError(err));
    } finally {
      setStarting(false);
    }
  }

  function handleStop() {
    stopCamera();
    setNotice(null);
    runIdRef.current += 1;
    setQualityBusy(false);
    setCompareBusy(false);
  }

  function clearCapture() {
    runIdRef.current += 1;
    setCapture(null);
    setQuality(null);
    setCompare(null);
    setApiError(null);
  }

  async function captureAndAnalyze() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setNotice("The camera has not delivered a frame yet. Wait a moment and capture again.");
      return;
    }

    const runId = (runIdRef.current += 1);
    setApiError(null);
    setQuality(null);
    setCompare(null);

    // Native resolution, no downscaling: the backend's resolution threshold is a
    // real quality gate, so resizing here would change the result it reports.
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setApiError("This browser could not create a 2D canvas context to draw the frame into.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("The browser could not encode the captured frame as JPEG."));
      }, "image/jpeg", 0.95);
    }).catch((err: unknown) => {
      setApiError(describeApiError(err));
      return null;
    });

    if (!blob) return;
    if (runId !== runIdRef.current) return;

    // The filename matters: the backend validates the upload extension before it
    // decodes anything, so a blob without a suffix is rejected with HTTP 400.
    const file = new File([blob], `live-capture-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });

    setCapture({
      file,
      previewUrl: URL.createObjectURL(file),
      width: canvas.width,
      height: canvas.height,
      bytes: file.size,
      takenAt: new Date().toISOString(),
    });

    setQualityBusy(true);
    try {
      const response = await api.vision.quality(file);
      if (runId !== runIdRef.current) return;
      setQuality(response.quality);
      toast({
        title: "OpenCV measured the frame",
        description: `Laplacian variance ${response.quality.blur_score.toFixed(
          1,
        )} · suitability ${response.quality.inspection_suitability}.`,
      });
    } catch (err) {
      if (runId !== runIdRef.current) return;
      setApiError(describeApiError(err));
    } finally {
      if (runId === runIdRef.current) setQualityBusy(false);
    }
  }

  async function compareToReference() {
    if (!capture) {
      setApiError("Capture a frame first — there is nothing to compare yet.");
      return;
    }
    const selected = (equipment ?? []).find((item) => item.id === equipmentId);
    const stored = selected?.referenceImages?.[0];
    if (!selected || !stored) {
      setApiError(
        `${selected?.name ?? "This equipment"} has no stored reference image, so alignment and change detection have nothing to work against. Upload one on its equipment page.`,
      );
      return;
    }

    const runId = (runIdRef.current += 1);
    setApiError(null);
    setCompare(null);
    setCompareBusy(true);

    try {
      const response = await fetch(storageUrl(stored.storagePath));
      if (!response.ok) {
        throw new Error(
          `Stored reference image could not be loaded (HTTP ${response.status}). ${BACKEND_START_COMMAND}`,
        );
      }
      const blob = await response.blob();
      const reference = new File([blob], stored.filename, {
        type: blob.type || "image/jpeg",
      });

      const startedAt = performance.now();
      const result = await api.vision.inspect(reference, capture.file);
      const clientMs = Math.round(performance.now() - startedAt);
      if (runId !== runIdRef.current) return;

      setCompare({
        result,
        clientMs,
        referenceName: stored.filename,
        referenceUrl: storageUrl(stored.storagePath),
      });
    } catch (err) {
      if (runId !== runIdRef.current) return;
      setApiError(describeApiError(err));
    } finally {
      if (runId === runIdRef.current) setCompareBusy(false);
    }
  }

  const selectedEquipment = (equipment ?? []).find((item) => item.id === equipmentId);
  const selectedHasReference = (selectedEquipment?.referenceImages?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-display font-bold text-gradient-hero">Live camera capture</h1>
          <p className="mt-1 text-secondary-text">
            Opens your camera with <code className="font-mono text-xs">getUserMedia</code>, draws
            one frame to a canvas at its native resolution and posts those bytes to the OpenCV
            quality endpoint. Nothing on this page is simulated.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!isLive ? (
            <Button
              size="sm"
              onClick={startCamera}
              disabled={support !== "supported" || starting}
            >
              <Camera className="mr-2 h-4 w-4" />
              {starting ? "Waiting for permission…" : support === "supported" ? "Start camera" : "Camera unavailable"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleStop}>
              <Square className="mr-2 h-4 w-4" />
              Stop camera
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={captureAndAnalyze}
            disabled={!isLive || qualityBusy}
          >
            <Scan className="mr-2 h-4 w-4" />
            {qualityBusy ? "Analyzing…" : "Capture and analyze"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-primary-text">Camera</CardTitle>
              <CardDescription>
                {isLive
                  ? "Your browser renders this stream locally. No frame leaves the machine until you capture."
                  : "No camera is running, so there is nothing to display."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isLive ? "success" : "outline"}>
                {isLive ? "CAMERA ON" : starting ? "REQUESTING" : "CAMERA OFF"}
              </Badge>
              {isLive && (
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full bg-success motion-safe:animate-pulse"
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLive ? (
              <div className="overflow-hidden rounded-lg border border-border bg-black/80">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(event) => {
                    const el = event.currentTarget;
                    setFrameSize({ width: el.videoWidth, height: el.videoHeight });
                  }}
                  className="aspect-video w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-surface/30 px-6 text-center">
                <Camera className="h-8 w-8 text-secondary-text/50" />
                <p className="text-sm text-secondary-text">
                  {support === "checking"
                    ? "Checking whether this browser offers a camera API…"
                    : support === "unsupported"
                      ? "Camera unavailable in this browser."
                      : "Camera is off. Press Start camera to request access; the browser asks for permission first."}
                </p>
                {support !== "checking" && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/dashboard/inspection/upload">Inspect a saved photo instead</Link>
                  </Button>
                )}
              </div>
            )}

            {notice && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-sm text-secondary-text">{notice}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-secondary-text">
              <span>
                Frame size:{" "}
                <span className="font-mono tabular-nums text-primary-text">
                  {frameSize ? `${frameSize.width} × ${frameSize.height}` : "not streaming"}
                </span>
              </span>
              <span>
                Measured rate:{" "}
                <span className="font-mono tabular-nums text-primary-text">
                  {fps ? `${fps.value} fps` : "not measuring"}
                </span>
              </span>
              {fps && (
                <span className="text-secondary-text/80">
                  {fps.source === "video-frame-callback"
                    ? "counted from requestVideoFrameCallback in this tab"
                    : "requestAnimationFrame fallback: this is the browser's refresh rate, not the camera's"}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Vision backend</CardTitle>
            <CardDescription>
              Live status from <code className="font-mono text-xs">/health</code>. Captures are
              useless without it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {healthFailed ? (
              <div className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
                <div>
                  <p className="text-sm font-medium text-primary-text">
                    Backend not reachable
                  </p>
                  <p className="mt-1 text-xs text-secondary-text">
                    {healthError?.message ?? "The health request failed."}
                  </p>
                  <p className="mt-2 break-all font-mono text-[11px] text-primary-text">
                    cd backend &amp;&amp; {BACKEND_START_COMMAND}
                  </p>
                </div>
              </div>
            ) : health ? (
              <dl className="grid grid-cols-2 gap-2">
                <Fact label="Status" value={health.status} />
                <Fact label="OpenCV" value={health.opencv} />
                <Fact label="App" value={`${health.app} ${health.version}`} />
                <Fact label="Database" value={health.database} />
              </dl>
            ) : (
              <p className="text-secondary-text">Reading health…</p>
            )}

            <div className="rounded-lg bg-surface/30 p-3 text-xs text-secondary-text">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Uploads go to <code className="font-mono">/backend-api</code> on this origin and
                  are proxied to <code className="font-mono">BACKEND_ORIGIN</code>. Camera access
                  needs a secure context: HTTPS or localhost.
                </span>
              </p>
            </div>

            <div className="rounded-lg bg-surface/30 p-3 text-xs text-secondary-text">
              <p className="font-medium text-primary-text">No continuous analysis endpoint</p>
              <p className="mt-1">
                The backend has no streaming or per-frame detection route, so this page analyses
                single captured frames on demand instead of pretending to run on the feed.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {apiError && (
        <Card className="border-critical/40">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
            <div>
              <p className="text-sm font-medium text-primary-text">Request failed</p>
              <p className="mt-1 text-sm text-secondary-text">{apiError}</p>
              <p className="mt-2 break-all font-mono text-[11px] text-secondary-text">
                cd backend &amp;&amp; {BACKEND_START_COMMAND}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {capture && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-1">
            <CardHeader>
              <CardTitle className="text-primary-text">Captured frame</CardTitle>
              <CardDescription>
                The exact JPEG bytes that were sent — {capture.width} × {capture.height},{" "}
                {(capture.bytes / 1024).toFixed(0)} KB, captured{" "}
                {new Date(capture.takenAt).toLocaleTimeString()}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <figure className="overflow-hidden rounded-lg border border-border">
                <div className="relative">
                  <img
                    src={capture.previewUrl}
                    alt="Single frame captured from your camera"
                    className="block w-full"
                  />
                  {compare &&
                    compare.result.alignment.status === "success" &&
                    compare.result.change_detection.regions.map((region, index) => (
                      <div
                        key={`${region.bbox.join("-")}-${index}`}
                        className="pointer-events-none absolute border-2 border-warning/80"
                        style={{
                          left: `${region.bbox[0] * 100}%`,
                          top: `${region.bbox[1] * 100}%`,
                          width: `${region.bbox[2] * 100}%`,
                          height: `${region.bbox[3] * 100}%`,
                        }}
                      />
                    ))}
                </div>
                <figcaption className="bg-surface/50 px-2 py-1 text-[10px] text-secondary-text">
                  {compare
                    ? compare.result.alignment.status === "success"
                      ? "Boxes are change-detection regions reported in reference-frame coordinates; the capture is only roughly in that space, so treat them as orientation."
                      : "No boxes: alignment did not succeed, so reference coordinates cannot be mapped onto this frame."
                    : "No overlay: boxes appear only from a real compare-to-reference run."}
                </figcaption>
              </figure>
              <Button variant="outline" size="sm" onClick={clearCapture} className="w-full">
                Discard capture
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4 xl:col-span-2">
            {qualityBusy && !quality && <QualitySkeleton />}
            {quality && <QualityPanel quality={quality} />}
            {!quality && !qualityBusy && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-primary-text">Quality result</CardTitle>
                  <CardDescription>
                    {apiError
                      ? "No metrics yet: the quality endpoint did not answer for this frame."
                      : "Press Capture and analyze to run /api/vision/quality on a frame."}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
            <ComparePanel
              equipment={equipment ?? []}
              equipmentId={equipmentId}
              onEquipmentChange={(value) => {
                setEquipmentId(value);
                setCompare(null);
              }}
              selectedEquipment={selectedEquipment?.name}
              selectedHasReference={selectedHasReference}
              busy={compareBusy}
              result={compare}
              onRun={compareToReference}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface/30 p-2">
      <p className="text-[10px] uppercase tracking-wide text-secondary-text">{label}</p>
      <p className="mt-0.5 truncate font-mono text-xs text-primary-text" title={value}>
        {value}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  fraction,
}: {
  label: string;
  value: string;
  hint?: string;
  /** 0-1 for the genuinely normalised metrics only. */
  fraction?: number;
}) {
  return (
    <div className="rounded-lg bg-surface/30 p-3">
      <p className="text-[11px] uppercase tracking-wide text-secondary-text">{label}</p>
      <p className="mt-1 font-mono text-sm text-primary-text tabular-nums">{value}</p>
      {fraction !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className="h-full rounded-full bg-primary/80"
            style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }}
          />
        </div>
      )}
      {hint && <p className="mt-1 text-[10px] text-secondary-text">{hint}</p>}
    </div>
  );
}

function QualitySkeleton() {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="motion-reduce:animate-none h-16 animate-pulse rounded-lg bg-surface-elevated"
          />
        ))}
      </CardContent>
    </Card>
  );
}

function QualityPanel({ quality }: { quality: VisionQuality }) {
  const insufficient = quality.inspection_suitability === "insufficient";
  const resolution = quality.resolution;

  return (
    <Card className={cn(insufficient && "border-warning/40")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary-text">
          Image quality
          <Badge variant={insufficient ? "warning" : "success"}>
            {quality.inspection_suitability}
          </Badge>
        </CardTitle>
        <CardDescription>
          Computed by OpenCV on the uploaded frame: variance of the Laplacian for sharpness, HSV
          specular fraction for glare, threshold plus contour area for coverage, Canny for edge
          density.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Blur score"
            value={quality.blur_score.toFixed(1)}
            hint="Laplacian variance; the gate is 100"
          />
          <Metric
            label="Exposure"
            value={quality.exposure_score.toFixed(3)}
            fraction={quality.exposure_score}
            hint="0 dark → 1 blown, 0.5 ideal"
          />
          <Metric
            label="Glare"
            value={`${(quality.glare_estimate * 100).toFixed(2)}%`}
            fraction={quality.glare_estimate}
            hint="specular pixels; gate 5%"
          />
          <Metric
            label="Coverage"
            value={`${(quality.image_coverage * 100).toFixed(1)}%`}
            fraction={quality.image_coverage}
            hint="content area; gate 30%"
          />
          <Metric
            label="Edge density"
            value={pct(quality.edge_density)}
            fraction={quality.edge_density}
            hint="Canny pixels; gate 1%"
          />
          <Metric
            label="Brightness mean"
            value={num(quality.brightness_mean)}
            hint="gray mean / 255"
          />
          <Metric
            label="Brightness std"
            value={num(quality.brightness_std)}
            hint="contrast spread / 255"
          />
          <Metric
            label="Saturation mean"
            value={num(quality.saturation_mean)}
            hint="HSV S / 255"
          />
        </div>

        {resolution && (
          <p className="font-mono text-xs text-secondary-text tabular-nums">
            Decoded by the backend as {resolution[0]} × {resolution[1]}
          </p>
        )}

        {quality.reasons.length > 0 ? (
          <ul className="space-y-1">
            {quality.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle className="h-4 w-4" />
            No quality gate was triggered on this frame.
          </p>
        )}

        <p className="text-xs text-secondary-text">
          <Bot className="mr-1 inline h-3.5 w-3.5" />
          <code className="font-mono">/api/vision/quality</code> has no reference image, so it
          reports no alignment confidence — alignment lives in the comparison below.
        </p>
      </CardContent>
    </Card>
  );
}

function ComparePanel({
  equipment,
  equipmentId,
  onEquipmentChange,
  selectedEquipment,
  selectedHasReference,
  busy,
  result,
  onRun,
}: {
  equipment: Equipment[];
  equipmentId: string;
  onEquipmentChange: (value: string) => void;
  selectedEquipment?: string;
  selectedHasReference: boolean;
  busy: boolean;
  result: CompareResult | null;
  onRun: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-primary-text">Compare to stored reference</CardTitle>
        <CardDescription>
          Optional. Loads the reference image stored against the equipment and runs
          <code className="mx-1 font-mono text-xs">/api/vision/inspect</code> (ORB + RANSAC
          alignment, then difference and contour based change detection) on this capture.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={equipmentId}
            onChange={(event) => onEquipmentChange(event.target.value)}
            className="sm:max-w-xs"
          >
            <option value="">Select equipment…</option>
            {equipment.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.category}
                {item.referenceImages?.length ? "" : " (no reference)"}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="sm:ml-auto"
            onClick={onRun}
            disabled={busy || !equipmentId || !selectedHasReference}
          >
            {busy ? (
              <span className="mr-2 inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />
            ) : (
              <Scan className="mr-2 h-4 w-4" />
            )}
            {busy ? "Running pipeline…" : "Run comparison"}
          </Button>
        </div>

        {!equipment.length && (
          <p className="text-sm text-secondary-text">
            No equipment loaded yet.{" "}
            <Link href="/dashboard/equipment" className="text-primary underline-offset-2 hover:underline">
              Register equipment
            </Link>{" "}
            and upload a reference image to enable comparison.
          </p>
        )}

        {equipmentId && !selectedHasReference && (
          <p className="text-sm text-warning">
            {selectedEquipment} has no stored reference image, so there is nothing to align to.
          </p>
        )}

        {result && <InspectResultView result={result} />}
      </CardContent>
    </Card>
  );
}

function InspectResultView({ result }: { result: CompareResult }) {
  const { alignment, change_detection: change, anomalies, recommendations, evidence } = result.result;
  const aligned = alignment.status === "success";
  const regionCount = change.num_changed_regions;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Alignment</CardTitle>
            <CardDescription>
              Reference loaded from storage: {result.referenceName}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <img
              src={result.referenceUrl}
              alt={`Stored reference image ${result.referenceName}`}
              className="max-h-32 w-full rounded-lg border border-border object-contain"
              loading="lazy"
            />
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Status" value={alignment.status} />
              <Metric label="Confidence" value={alignment.confidence.toFixed(3)} />
              <Metric label="Keypoints matched" value={String(alignment.matched_keypoints)} />
              <Metric label="Inlier ratio" value={alignment.inlier_ratio.toFixed(3)} />
              <Metric
                label="Reprojection error"
                value={`${alignment.reprojection_error.toFixed(2)} px`}
              />
              <Metric label="Client round trip" value={`${result.clientMs} ms`} />
            </div>
            {alignment.reason && (
              <p className="text-sm text-secondary-text">{alignment.reason}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Change detection</CardTitle>
            <CardDescription>
              Server-side pipeline time {result.result.processing_time_ms.toFixed(0)} ms.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Metric label="Status" value={change.status} />
            <Metric label="Regions above threshold" value={String(regionCount)} />
            <Metric
              label="Change fraction"
              value={change.change_fraction.toFixed(4)}
              fraction={change.change_fraction}
            />
            <Metric label="Mean absolute diff" value={change.mean_abs_diff.toFixed(2)} hint="0-255 gray" />
            <Metric
              label="Similarity (SSIM)"
              value={change.ssim_score.toFixed(4)}
              fraction={change.ssim_score}
              hint="The ssim_score field, computed by the structural-similarity implementation in backend/app/vision/ssim.py. The earlier normalized-cross-correlation fallback that hid behind this name has been removed, so values recorded before that fix are not comparable."
            />
            <Metric label="Overall confidence" value={result.result.overall_confidence.toFixed(3)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">
            Regions ({regionCount})
          </CardTitle>
          <CardDescription>
            {aligned
              ? "Bounding boxes are relative 0-1 coordinates in the reference frame, as returned by the backend."
              : `Alignment status is "${alignment.status}", so reference coordinates are not trustworthy for this frame. The numbers below are what the detector reported anyway.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {regionCount === 0 ? (
            <p className="text-sm text-secondary-text">
              No regions above the difference threshold: change fraction{" "}
              <span className="font-mono tabular-nums">{change.change_fraction.toFixed(4)}</span>,
              mean absolute difference{" "}
              <span className="font-mono tabular-nums">{change.mean_abs_diff.toFixed(2)}</span> of
              255. That is a real result, not a missing one.
            </p>
          ) : (
            <div className="space-y-2">
              {change.regions.slice(0, 12).map((region, index) => {
                const anomaly = anomalies[index];
                return (
                  <div
                    key={`${region.bbox.join("-")}-${index}`}
                    className="flex items-start justify-between gap-4 rounded-lg bg-surface/30 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary-text">
                        {anomaly?.category ?? "visual_change"}
                      </p>
                      {anomaly?.description && (
                        <p className="truncate text-xs text-secondary-text">
                          {anomaly.description}
                        </p>
                      )}
                      <p className="mt-1 font-mono text-[11px] text-secondary-text tabular-nums">
                        x {region.bbox[0].toFixed(3)} y {region.bbox[1].toFixed(3)} w{" "}
                        {region.bbox[2].toFixed(3)} h {region.bbox[3].toFixed(3)} ·{" "}
                        {region.area_px} px²
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {anomaly && (
                        <Badge
                          variant={
                            anomaly.severity as "critical" | "warning" | "success" | "info"
                          }
                        >
                          {anomaly.severity}
                        </Badge>
                      )}
                      <span className="font-mono text-xs text-secondary-text tabular-nums">
                        {(region.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
              {change.regions.length > 12 && (
                <p className="text-xs text-secondary-text">
                  {change.regions.length - 12} further regions not shown.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary-text">
              <Bot className="h-4 w-4 text-secondary" />
              Pipeline recommendations
            </CardTitle>
            <CardDescription>
              Produced by the vision engine from the measurements above. No agent acted on them;
              the agent loop lands in a later phase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recommendations.map((recommendation) => (
                <li
                  key={recommendation}
                  className="rounded-lg bg-surface/30 p-3 text-sm text-secondary-text"
                >
                  {recommendation}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {evidence && Object.keys(evidence).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Evidence</CardTitle>
            <CardDescription>
              PNGs encoded by OpenCV during this run and returned as base64 — not stored on the
              inspection, because a camera capture has no inspection record yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(evidence).flatMap(([category, files]) =>
                Object.entries(files).map(([filename, base64]) => (
                  <figure key={`${category}-${filename}`} className="overflow-hidden rounded-lg border border-border">
                    <img
                      src={`data:image/png;base64,${base64}`}
                      alt={`${category}: ${filename}`}
                      className="aspect-video w-full object-cover"
                      loading="lazy"
                    />
                    <figcaption className="truncate bg-surface/50 px-2 py-1 text-[10px] text-secondary-text">
                      {category} · {filename}
                    </figcaption>
                  </figure>
                )),
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
