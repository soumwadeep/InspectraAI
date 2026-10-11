/**
 * Overlay geometry for the vision viewport.
 *
 * The backend stores every bounding box as a **relative** 0–1 fraction of the
 * reference frame (`change_detection.py` divides by the reference width and
 * height), which is what makes overlays resolution independent. What it does not
 * know is how the image is *displayed*, and this is the part implementations
 * usually get wrong: an `<img>` with `object-fit: contain` is letterboxed inside
 * its box, so multiplying a relative coordinate by the container width puts every
 * box in the wrong place whenever the aspect ratios differ.
 */

export interface Size {
  width: number;
  height: number;
}

/** Relative box as produced by the vision pipeline: [x, y, w, h] in 0–1. */
export type RelativeBox = readonly [number, number, number, number];

export interface PaintedRect extends Size {
  x: number;
  y: number;
}

/** A box in CSS pixels relative to the stage's top-left, before zoom/pan. */
export interface ScreenRect extends Size {
  x: number;
  y: number;
}

/**
 * Where the image actually paints inside the stage.
 *
 * Returned explicitly rather than relying on `object-contain`, so the overlay and
 * the pixels can never disagree about where the image is.
 */
export function contentRect(image: Size | null, stage: Size): PaintedRect {
  if (!image || image.width <= 0 || image.height <= 0 || stage.width <= 0 || stage.height <= 0) {
    return { x: 0, y: 0, width: stage.width, height: stage.height };
  }

  const scale = Math.min(stage.width / image.width, stage.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  return {
    x: (stage.width - width) / 2,
    y: (stage.height - height) / 2,
    width,
    height,
  };
}

/** Projects one relative box into stage pixel space. */
export function toScreenRect(box: RelativeBox, rect: PaintedRect): ScreenRect {
  const [x, y, width, height] = box;
  return {
    x: rect.x + x * rect.width,
    y: rect.y + y * rect.height,
    width: width * rect.width,
    height: height * rect.height,
  };
}

/** Applies the viewport's zoom/pan to a stage-space rectangle. */
export function projectRect(
  screen: ScreenRect,
  view: { scale: number; x: number; y: number },
): ScreenRect {
  return {
    x: screen.x * view.scale + view.x,
    y: screen.y * view.scale + view.y,
    width: screen.width * view.scale,
    height: screen.height * view.scale,
  };
}

/**
 * Legal pan range for a given scale, measured as translate offsets applied about
 * the stage origin.
 *
 * When the image is no larger than the stage there is nothing off-screen to
 * reach, so the only legal offset is zero — which keeps zoom 1 from being
 * draggable into blank gutters.
 */
export function panBounds(
  rect: PaintedRect,
  scale: number,
  stage: Size,
): { x: [number, number]; y: [number, number] } {
  const noPan: { x: [number, number]; y: [number, number] } = { x: [0, 0], y: [0, 0] };

  const scaledWidth = rect.width * scale;
  const scaledHeight = rect.height * scale;
  const originX = rect.x * scale;
  const originY = rect.y * scale;

  if (scaledWidth <= stage.width && scaledHeight <= stage.height) return noPan;

  const range = (scaled: number, origin: number, available: number): [number, number] => {
    if (scaled <= available) return [0, 0];
    // Covering the stage means origin + t <= 0 and origin + t + scaled >= available,
    // so the translate is bounded by [available - origin - scaled, -origin].
    const min = available - origin - scaled;
    const max = -origin;
    return [Math.min(min, max), Math.max(min, max)];
  };

  return {
    x: range(scaledWidth, originX, stage.width),
    y: range(scaledHeight, originY, stage.height),
  };
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Strokes and label fonts stay legible at any zoom. */
export function strokeWidthAt(scale: number, base = 1.5): number {
  return base / scale;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
