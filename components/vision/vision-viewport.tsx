"use client";

import { useCallback, useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  PaintedRect,
  RelativeBox,
  Size,
  clamp,
  contentRect,
  panBounds,
  strokeWidthAt,
} from "@/lib/vision/geometry";
import { chartPalette } from "@/components/charts/chart-theme";
import { cn } from "@/lib/utils";

export interface ViewportBox {
  box: RelativeBox;
  label: string;
  severity: string;
  confidence?: number;
}

interface VisionViewportProps {
  src: string;
  alt: string;
  /** Known pixel size, used to reserve the aspect ratio before the bytes arrive. */
  naturalSize?: Size | null;
  boxes?: ViewportBox[];
  /** True only while a request is genuinely in flight — drives the sweep. */
  busy?: boolean;
  showGrid?: boolean;
  showBoxes?: boolean;
  className?: string;
  /** Overlay drawn above the image but below the HUD, e.g. a diff heatmap. */
  overlaySrc?: string | null;
  overlayOpacity?: number;
}

const severityColor: Record<string, string> = {
  critical: chartPalette.critical,
  warning: chartPalette.warning,
  info: chartPalette.primary,
  success: chartPalette.success,
};

/**
 * The evidence viewer: one image, real OpenCV bounding boxes, zoom, pan, and a
 * scan sweep that only runs while a request is actually pending.
 *
 * Three decisions that matter:
 *
 * 1. The image is positioned at an explicitly computed rect rather than relying
 *    on `object-contain`, so the overlay can never disagree about where the
 *    pixels are (letterboxing otherwise shifts every box).
 * 2. Zoom and pan are a single CSS transform on the wrapper holding both the
 *    image and the canvas. The browser composites it; nothing re-lays out per
 *    frame and no `getBoundingClientRect` runs during a drag.
 * 3. Strokes and label sizes are divided by the zoom scale, so a box stays a
 *    hairline at 6x instead of becoming a banner.
 */
export function VisionViewport({
  src,
  alt,
  naturalSize,
  boxes = [],
  busy = false,
  showGrid = true,
  showBoxes = true,
  className,
  overlaySrc,
  overlayOpacity = 0.55,
}: VisionViewportProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  const [stage, setStage] = useState<Size>({ width: 0, height: 0 });
  const [intrinsic, setIntrinsic] = useState<Size | null>(naturalSize ?? null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [lockProgress, setLockProgress] = useState(0);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  // Measure the stage. Everything downstream is pure math from these numbers.
  //
  // The initial read is synchronous on purpose. A ResizeObserver-only version
  // left state at {0,0} in practice, so draw() bailed on its zero-width guard
  // and the canvas kept its 300x150 default — the overlay silently never
  // appeared while the panel looked perfectly healthy.
  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;

    const measure = () => {
      const box = element.getBoundingClientRect();
      setStage((current) =>
        Math.abs(current.width - box.width) < 0.5 && Math.abs(current.height - box.height) < 0.5
          ? current
          : { width: box.width, height: box.height },
      );
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (naturalSize) setIntrinsic(naturalSize);
  }, [naturalSize]);

  useEffect(() => {
    setLoaded(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [src]);

  const rect: PaintedRect = useMemo(() => contentRect(intrinsic, stage), [intrinsic, stage]);

  // Lock-on choreography: boxes draw in sequence, then stop. No loop, because a
  // permanent animation on a finished result would imply live processing.
  //
  // Driven by requestAnimationFrame rather than framer-motion's imperative
  // `animate()` number overload: the declarative variants elsewhere cover the
  // rest of the app, and here we need a single scalar feeding a canvas redraw.
  // Keyed on a value signature, not the array identity: the parent rebuilds the
  // boxes array on every render, and depending on it would restart the lock-on
  // animation each time a layer chip was toggled.
  const boxSignature = boxes.map((entry) => `${entry.label}:${entry.confidence ?? ""}`).join("|");

  useEffect(() => {
    if (boxes.length === 0) {
      setLockProgress(0);
      return;
    }
    if (reduce) {
      setLockProgress(1);
      return;
    }

    const duration = 500 + Math.min(boxes.length, 12) * 70;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // Same curve as easing.outExpo, applied to a 0–1 scalar.
      setLockProgress(t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxSignature, reduce]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || stage.width === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(stage.width * dpr);
    canvas.height = Math.round(stage.height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, stage.width, stage.height);
    if (!showBoxes || boxes.length === 0) return;

    for (let index = 0; index < boxes.length; index += 1) {
      const entry = boxes[index];
      const start = Math.min(index * 0.07, 0.6);
      const local = clamp((lockProgress - start) / 0.35, 0, 1);
      if (local <= 0) continue;

      const [bx, by, bw, bh] = entry.box;
      const x = (rect.x + bx * rect.width) * zoom + pan.x;
      const y = (rect.y + by * rect.height) * zoom + pan.y;
      const width = bw * rect.width * zoom * local;
      const height = bh * rect.height * zoom * local;

      const color = severityColor[entry.severity] ?? chartPalette.primary;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidthAt(zoom, 1.6);
      ctx.globalAlpha = 0.35 + 0.65 * local;

      // Corner brackets rather than a full rectangle: reads as instrumentation
      // and keeps the defect visible inside the box.
      const arm = Math.min(width, height) * 0.22;
      ctx.beginPath();
      ctx.moveTo(x, y + arm); ctx.lineTo(x, y); ctx.lineTo(x + arm, y);
      ctx.moveTo(x + width - arm, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + arm);
      ctx.moveTo(x + width, y + height - arm); ctx.lineTo(x + width, y + height); ctx.lineTo(x + width - arm, y + height);
      ctx.moveTo(x + arm, y + height); ctx.lineTo(x, y + height); ctx.lineTo(x, y + height - arm);
      ctx.stroke();

      // Box outline fades up behind the brackets.
      ctx.globalAlpha = 0.25 * local;
      ctx.strokeRect(x, y, width, height);
      ctx.restore();

      // Label sits outside the transform chain so it never scales with zoom.
      if (local > 0.9) {
        const text = `${entry.label}${entry.confidence !== undefined ? ` · ${Math.round(entry.confidence * 100)}%` : ""}`;
        const fontSize = 11;
        ctx.save();
        ctx.font = `500 ${fontSize}px "JetBrains Mono Variable", ui-monospace, monospace`;
        const metrics = ctx.measureText(text);
        const padX = 6;
        const boxY = Math.max(0, y - fontSize - padX * 2 - 2);

        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "rgb(5 9 20 / 0.85)";
        ctx.fillRect(x, boxY, metrics.width + padX * 2, fontSize + padX * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, boxY + 0.5, metrics.width + padX * 2 - 1, fontSize + padX * 2 - 1);

        ctx.fillStyle = color;
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + padX, boxY + (fontSize + padX * 2) / 2);
        ctx.restore();
      }
    }
  }, [boxes, lockProgress, pan, rect, showBoxes, stage, zoom]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Native listener so `passive: false` can suppress page scroll while zooming.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) => {
        const next = clamp(current * (event.deltaY < 0 ? 1.12 : 0.89), MIN_ZOOM, MAX_ZOOM);
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the pan inside legal bounds whenever zoom changes.
  useEffect(() => {
    const bounds = panBounds(rect, zoom, stage);
    setPan((current) => ({
      x: clamp(current.x, bounds.x[0], bounds.x[1]),
      y: clamp(current.y, bounds.y[0], bounds.y[1]),
    }));
  }, [zoom, rect, stage]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const bounds = panBounds(rect, zoom, stage);
    setPan({
      x: clamp(state.originX + (event.clientX - state.startX), bounds.x[0], bounds.x[1]),
      y: clamp(state.originY + (event.clientY - state.startY), bounds.y[0], bounds.y[1]),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 32;
    const bounds = panBounds(rect, zoom, stage);

    if (event.key === "+" || event.key === "=") setZoom((z) => clamp(z * 1.2, MIN_ZOOM, MAX_ZOOM));
    else if (event.key === "-") setZoom((z) => clamp(z / 1.2, MIN_ZOOM, MAX_ZOOM));
    else if (event.key === "0") {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const delta = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      }[event.key as string] ?? [0, 0];
      setPan((current) => ({
        x: clamp(current.x + delta[0], bounds.x[0], bounds.x[1]),
        y: clamp(current.y + delta[1], bounds.y[0], bounds.y[1]),
      }));
    }
  };

  const aspect = intrinsic ? intrinsic.width / intrinsic.height : 16 / 10;

  return (
    <div
      ref={stageRef}
      role="img"
      tabIndex={0}
      aria-label={`${alt}. ${boxes.length} detected region(s). Zoom ${zoom.toFixed(1)}x. Scroll to zoom, drag to pan, arrow keys to move, 0 to reset.`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }}
      className={cn(
        "relative aspect-[16/10] w-full select-none overflow-hidden rounded-lg border border-border bg-bg-deep",
        zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
        className,
      )}
      style={{ aspectRatio: `${aspect}`, touchAction: "none" }}
    >
      {showGrid && <div aria-hidden className="grid-overlay pointer-events-none absolute inset-0" />}

      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}

      {/* One transformed wrapper for image + overlay + canvas: composited, never re-laid out. */}
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          onLoad={(event) => {
            const element = event.currentTarget;
            if (!intrinsic && element.naturalWidth > 0) {
              setIntrinsic({ width: element.naturalWidth, height: element.naturalHeight });
            }
            setLoaded(true);
          }}
          onError={() => setLoaded(true)}
          className="absolute max-w-none"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            opacity: loaded ? 1 : 0,
            transition: "opacity 240ms ease-out",
          }}
        />

        {overlaySrc && (
          <img
            src={overlaySrc}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute max-w-none mix-blend-screen"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              opacity: overlayOpacity,
            }}
          />
        )}
      </div>

      {/* Canvas is drawn in stage space with pan/zoom already applied, so it is
          NOT inside the transformed wrapper — otherwise the transform would
          scale an already-scaled drawing. */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {busy && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="scan-layer absolute inset-x-0 h-1/3 motion-safe:animate-scan" />
        </div>
      )}

      {loaded && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
          <span className="telemetry text-[10px] uppercase text-secondary-text">
            {boxes.length} region{boxes.length === 1 ? "" : "s"}
          </span>
          <span className="telemetry text-[10px] text-secondary-text">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
