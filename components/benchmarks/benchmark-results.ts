/**
 * Runtime parser for `POST /api/benchmarks/run` results.
 *
 * The endpoint stores whatever it measured in `results_json`; the API type is
 * `Record<string, unknown>`, so every field is checked here before it is
 * rendered. A missing or malformed field yields `undefined`, and the UI turns
 * that into an explicit "Not measured" state — this module exists so no
 * component ever falls back to a made-up number.
 *
 * Benchmark semantics: these figures describe a labelled SYNTHETIC corpus only
 * (see `feature.real_world_accuracy_claim.implemented === false` in
 * GET /api/system/capabilities). Every consumer must present them with that
 * scope stated.
 */

export interface CorpusInfo {
  pairs?: number;
  seed?: number;
  resolution?: [number, number];
  ground_truth_defects?: number;
  clean_pairs?: number;
  pairs_with_false_positive_on_clean_input?: number;
  geometric_offset_range_px?: number;
  iou_threshold?: number;
  /** Wall-clock ms the run took, returned inside `corpus`. */
  wall_ms?: number;
}

export interface DetectionAggregate {
  true_positives?: number;
  false_positives?: number;
  false_negatives?: number;
  precision?: number;
  recall?: number;
  f1_score?: number;
  mean_iou?: number;
  matched_localisations?: number;
}

export interface ClassificationAggregate {
  correct?: number;
  scored?: number;
  /** `null` in the API when nothing was scoreable; stored as undefined here. */
  accuracy?: number;
}

export interface TimingAggregate {
  pipeline_ms?: number;
  per_pair_ms?: number;
}

export interface GroundTruthRecord {
  box: [number, number, number, number];
  category: string;
}

export interface PredictionRecord {
  /** Relative 0-1 coordinates, same convention as the ground-truth boxes. */
  box: [number, number, number, number];
  category?: string;
  confidence?: number;
}

export interface PairDetection {
  true_positives?: number;
  false_positives?: number;
  false_negatives?: number;
  mean_iou?: number;
}

export interface PairAudit {
  label: string;
  ground_truth_count?: number;
  ground_truths: GroundTruthRecord[];
  detection: PairDetection;
  /** False when the run stored no `measured` block for this pair. */
  hasMeasured: boolean;
  ssim_score?: number;
  mean_abs_diff?: number;
  predictions: PredictionRecord[];
}

export interface BenchmarkResults {
  corpus: CorpusInfo;
  detection: DetectionAggregate;
  classification: ClassificationAggregate;
  timing: TimingAggregate;
  per_pair: PairAudit[];
  /** True if the payload contained a `per_pair` array at all. */
  hasPerPair: boolean;
  /** True if at least one field anywhere was a usable number. */
  hasAnyMeasurement: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function int(value: unknown): number | undefined {
  const parsed = num(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** A relative [x1, y1, x2, y2] box; rejected unless all four entries are finite numbers. */
function box(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const parts = value.map((entry) => num(entry));
  if (parts.some((part) => part === undefined)) return undefined;
  return [parts[0] as number, parts[1] as number, parts[2] as number, parts[3] as number];
}

function pick<T extends object>(source: unknown, keys: ReadonlyArray<keyof T>): Partial<T> {
  const out: Record<string, unknown> = {};
  if (!isRecord(source)) return out as Partial<T>;
  for (const key of keys) {
    const value = num(source[key as string]);
    if (value !== undefined) out[key as string] = value;
  }
  return out as Partial<T>;
}

/**
 * Parses one stored run's `results_json`. Never throws and never invents: any
 * section the API did not return arrives as an object with no numeric fields,
 * which the panels render as "Not measured".
 */
export function parseBenchmarkResults(raw: unknown): BenchmarkResults {
  const root = isRecord(raw) ? raw : {};

  const corpusRaw = isRecord(root.corpus) ? root.corpus : {};
  const detectionRaw = isRecord(root.detection) ? root.detection : {};
  const classificationRaw = isRecord(root.classification) ? root.classification : {};
  const timingRaw = isRecord(root.timing) ? root.timing : {};

  const resolutionRaw = Array.isArray(corpusRaw.resolution)
    ? corpusRaw.resolution
    : undefined;
  const resolution =
    resolutionRaw && resolutionRaw.length === 2
      ? ([num(resolutionRaw[0]), num(resolutionRaw[1])] as [number | undefined, number | undefined])
      : undefined;

  const corpus: CorpusInfo = {
    pairs: int(corpusRaw.pairs),
    seed: int(corpusRaw.seed),
    resolution:
      resolution && resolution[0] !== undefined && resolution[1] !== undefined
        ? [resolution[0], resolution[1]]
        : undefined,
    ground_truth_defects: int(corpusRaw.ground_truth_defects),
    clean_pairs: int(corpusRaw.clean_pairs),
    pairs_with_false_positive_on_clean_input: int(
      corpusRaw.pairs_with_false_positive_on_clean_input,
    ),
    geometric_offset_range_px: num(corpusRaw.geometric_offset_range_px),
    iou_threshold: num(corpusRaw.iou_threshold),
    wall_ms: num(corpusRaw.wall_ms),
  };

  const detection: DetectionAggregate = pick<DetectionAggregate>(detectionRaw, [
    "true_positives",
    "false_positives",
    "false_negatives",
    "precision",
    "recall",
    "f1_score",
    "mean_iou",
    "matched_localisations",
  ]);

  const classification: ClassificationAggregate = {
    ...pick<ClassificationAggregate>(classificationRaw, ["correct", "scored", "accuracy"]),
  };

  const timing: TimingAggregate = pick<TimingAggregate>(timingRaw, ["pipeline_ms", "per_pair_ms"]);

  const perPairRaw = Array.isArray(root.per_pair) ? root.per_pair : [];
  const per_pair: PairAudit[] = [];
  for (const entry of perPairRaw) {
    if (!isRecord(entry)) continue;
    const label = str(entry.label) ?? str(entry.name) ?? "pair (unlabeled in response)";

    const groundTruthsRaw = Array.isArray(entry.ground_truths) ? entry.ground_truths : [];
    const ground_truths: GroundTruthRecord[] = [];
    for (const gt of groundTruthsRaw) {
      if (!isRecord(gt)) continue;
      const gtBox = box(gt.box);
      const category = str(gt.category);
      if (gtBox && category) ground_truths.push({ box: gtBox, category });
    }

    const measuredRaw = isRecord(entry.measured) ? entry.measured : null;
    const predictionsRaw =
      measuredRaw && Array.isArray(measuredRaw.predictions) ? measuredRaw.predictions : [];
    const predictions: PredictionRecord[] = [];
    for (const pred of predictionsRaw) {
      if (!isRecord(pred)) continue;
      // The API names the prediction box `bbox`; tolerate `box` too so a field
      // rename upstream shows as "missing", not as a crash.
      const predBox = box(pred.bbox) ?? box(pred.box);
      if (predBox) {
        predictions.push({
          box: predBox,
          category: str(pred.category),
          confidence: num(pred.confidence),
        });
      }
    }

    per_pair.push({
      label,
      ground_truth_count: int(entry.ground_truth_count),
      ground_truths,
      detection: pick<PairDetection>(entry.detection, [
        "true_positives",
        "false_positives",
        "false_negatives",
        "mean_iou",
      ]),
      hasMeasured: measuredRaw !== null,
      ssim_score: measuredRaw ? num(measuredRaw.ssim_score) : undefined,
      mean_abs_diff: measuredRaw ? num(measuredRaw.mean_abs_diff) : undefined,
      predictions,
    });
  }

  const hasAnyMeasurement =
    Object.keys(detection).length > 0 ||
    Object.keys(classification).length > 0 ||
    Object.keys(timing).length > 0 ||
    corpus.pairs !== undefined ||
    corpus.ground_truth_defects !== undefined;

  return {
    corpus,
    detection,
    classification,
    timing,
    per_pair,
    hasPerPair: Array.isArray(root.per_pair),
    hasAnyMeasurement,
  };
}

/** Per-category label counts, derived strictly from returned per-pair rows. */
export interface CategoryRow {
  category: string;
  ground_truth_boxes: number;
  predicted_boxes: number;
}

/**
 * Counts ground-truth boxes and predicted boxes per category across the audit
 * rows the API returned. The response does not expose which ground-truth box a
 * prediction was matched to, so this is a label-count comparison — the panel
 * must say so, not imply per-category precision.
 */
export function categoryBreakdown(perPair: PairAudit[]): CategoryRow[] {
  const counts = new Map<string, { gt: number; pred: number }>();
  for (const pair of perPair) {
    for (const gt of pair.ground_truths) {
      const entry = counts.get(gt.category) ?? { gt: 0, pred: 0 };
      entry.gt += 1;
      counts.set(gt.category, entry);
    }
    for (const pred of pair.predictions) {
      if (!pred.category) continue;
      const entry = counts.get(pred.category) ?? { gt: 0, pred: 0 };
      entry.pred += 1;
      counts.set(pred.category, entry);
    }
  }
  return Array.from(counts.entries())
    .map(([category, entry]) => ({
      category,
      ground_truth_boxes: entry.gt,
      predicted_boxes: entry.pred,
    }))
    .sort((a, b) => b.ground_truth_boxes - a.ground_truth_boxes || a.category.localeCompare(b.category));
}

export const NOT_MEASURED = "Not measured";

/** Formats a measured number, or the explicit absent-state label. */
export function fmtMeasured(value: number | undefined, digits = 4): string {
  if (value === undefined) return NOT_MEASURED;
  if (Number.isInteger(value)) return String(value);
  return value
    .toFixed(digits)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}
