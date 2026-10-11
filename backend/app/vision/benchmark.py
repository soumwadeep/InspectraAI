"""Labelled synthetic corpus and the measured benchmark that runs over it.

The benchmark endpoint used to import four vision classes, call nothing, and store
`{"quality_test": "passed", ...}`. That is the kind of number this project must not
publish, so the runner below computes precision, recall, F1, IoU and category
accuracy from real pixels against ground truth it generated itself.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

WIDTH = 960
HEIGHT = 640


def _base_panel(rng: np.random.Generator) -> np.ndarray:
    """Deterministic industrial panel: brushed field, hatch grid, bolts, vents.

    Reference and capture share one base draw, so the only difference between them
    is the injected defect. Two independently noised panels produced 36 phantom
    regions for one real defect in earlier testing.
    """
    base = rng.integers(120, 165, (HEIGHT, WIDTH, 1), dtype=np.uint8)
    panel = np.repeat(base, 3, axis=2)
    panel = cv2.GaussianBlur(panel, (0, 0), 0.8)

    # Hatch grid
    for x in range(40, WIDTH - 40, 26):
        cv2.line(panel, (x, 60), (x + 30, HEIGHT - 60), (95, 95, 95), 1)
    for y in range(80, HEIGHT - 60, 44):
        cv2.line(panel, (40, y), (WIDTH - 40, y + 12), (170, 170, 170), 1)

    # Bolt circle and vent plate give repeatable corners for ORB.
    cv2.circle(panel, (WIDTH // 2, HEIGHT // 2), 150, (80, 80, 80), 3)
    for angle in range(0, 360, 45):
        rad = np.deg2rad(angle)
        cx = int(WIDTH / 2 + 150 * np.cos(rad))
        cy = int(HEIGHT / 2 + 150 * np.sin(rad))
        cv2.circle(panel, (cx, cy), 11, (60, 60, 60), -1)
        cv2.circle(panel, (cx, cy), 4, (190, 190, 190), -1)
    cv2.rectangle(panel, (80, 80), (240, 180), (70, 70, 70), 2)
    for y in range(92, 176, 14):
        cv2.line(panel, (88, y), (232, y), (185, 185, 185), 2)

    return panel


def _rust_patch(rng: np.random.Generator, img: np.ndarray, cx: int, cy: int, radius: int) -> None:
    overlay = img.copy()
    cv2.ellipse(
        overlay, (cx, cy), (radius, int(radius * 0.75)), 25, 0, 360, (40, 70, 160), -1
    )
    cv2.addWeighted(overlay, 0.85, img, 0.15, 0, img)
    for _ in range(radius * 3):
        px = cx + int(rng.normal(0, radius * 0.55))
        py = cy + int(rng.normal(0, radius * 0.4))
        cv2.circle(img, (px, py), 2, (35, 60, 150), -1)


def _soot_smudge(img: np.ndarray, cx: int, cy: int, radius: int) -> None:
    mask = np.zeros((HEIGHT, WIDTH), dtype=np.float32)
    cv2.ellipse(mask, (cx, cy), (radius, int(radius * 0.8)), 0, 0, 360, 1.0, -1)
    soft = cv2.GaussianBlur(mask, (0, 0), radius * 0.4)
    strength = (soft * 190).astype(np.int16)
    dark = img.astype(np.int16) - np.stack([strength] * 3, axis=2)
    np.clip(dark, 0, 255, out=dark)
    img[:] = dark.astype(np.uint8)


def _glare_spot(img: np.ndarray, cx: int, cy: int, radius: int) -> None:
    overlay = np.zeros_like(img)
    cv2.circle(overlay, (cx, cy), radius, (250, 250, 250), -1)
    blurred = cv2.GaussianBlur(overlay, (0, 0), radius * 0.6)
    cv2.add(blurred, img, dst=img)


def _erased_detail(img: np.ndarray, x: int, y: int, w: int, h: int) -> None:
    """Paint the field colour over a block, removing the hatch lines inside it."""
    patch = img[max(0, y - 30):y, max(0, x - 30):x]
    fill = patch.reshape(-1, 3).mean(axis=0).astype(np.uint8) if patch.size else (140, 140, 140)
    cv2.rectangle(img, (x, y), (x + w, y + h), tuple(int(v) for v in fill), -1)


@dataclass
class BenchmarkPair:
    reference: np.ndarray
    capture: np.ndarray
    ground_truths: list[dict[str, Any]] = field(default_factory=list)
    label: str = ""


DEFECTS = ("discoloration", "dark_patch", "brightness_increase", "detail_loss")


def build_corpus(pair_count: int = 12, seed: int = 7) -> list[BenchmarkPair]:
    """Generate reference/capture pairs with ground truth in reference coordinates."""
    rng = np.random.default_rng(seed)

    pairs: list[BenchmarkPair] = []
    for index in range(pair_count):
        reference = _base_panel(rng)
        capture = reference.copy()

        # A real retake is never pixel-registered: shift so alignment has to work,
        # and keep ground truth expressed in reference coordinates.
        tx, ty = int(rng.integers(-14, 15)), int(rng.integers(-14, 15))
        shift = np.float32([[1, 0, tx], [0, 1, ty]])
        capture = cv2.warpAffine(capture, shift, (WIDTH, HEIGHT), borderMode=cv2.BORDER_REPLICATE)

        # 25% of the corpus is a clean pair: the runner scores its false positives.
        defect_count = 0 if index % 4 == 3 else int(rng.integers(1, 3))
        truths: list[dict[str, Any]] = []

        for _ in range(defect_count):
            category = DEFECTS[int(rng.integers(0, len(DEFECTS)))]
            radius = int(rng.integers(26, 52))
            cx = int(rng.integers(radius + 60, WIDTH - radius - 60))
            cy = int(rng.integers(radius + 60, HEIGHT - radius - 60))

            if category == "discoloration":
                _rust_patch(rng, capture, cx, cy, radius)
            elif category == "dark_patch":
                _soot_smudge(capture, cx, cy, radius)
            elif category == "brightness_increase":
                _glare_spot(capture, cx, cy, radius)
            else:
                w, h = radius * 2, int(radius * 1.4)
                _erased_detail(capture, cx - w // 2, cy - h // 2, w, h)

            # Undo the shift so the box is in the frame the detector reports on.
            x1 = max(0.0, (cx - radius - tx) / WIDTH)
            y1 = max(0.0, (cy - radius - ty) / HEIGHT)
            x2 = min(1.0, (cx + radius - tx) / WIDTH)
            y2 = min(1.0, (cy + radius - ty) / HEIGHT)
            truths.append({
                "box": [x1, y1, x2, y2],
                "category": category,
            })

        pairs.append(BenchmarkPair(
            reference=reference, capture=capture, ground_truths=truths,
            label=f"pair-{index:02d}-{'clean' if defect_count == 0 else defect_count}-defect",
        ))

    return pairs


def run_benchmark(
    pair_count: int = 12,
    seed: int = 7,
    iou_threshold: float = 0.3,
) -> dict[str, Any]:
    """Score the pipeline over the generated corpus and return measured numbers."""
    import time

    from app.vision.engine import VisionEngine

    engine = VisionEngine()
    pairs = build_corpus(pair_count=pair_count, seed=seed)

    aggregate = {
        "true_positives": 0,
        "false_positives": 0,
        "false_negatives": 0,
    }
    iou_scores: list[float] = []
    per_pair: list[dict[str, Any]] = []
    category_correct = 0
    category_total = 0
    elapsed_ms = 0

    for pair in pairs:
        start = time.time()
        metrics = engine.evaluate_benchmark(
            pair.reference, pair.capture, pair.ground_truths, iou_threshold
        )
        elapsed_ms += int((time.time() - start) * 1000)

        aggregate["true_positives"] += metrics.true_positives
        aggregate["false_positives"] += metrics.false_positives
        aggregate["false_negatives"] += metrics.false_negatives
        iou_scores.extend(metrics.iou_scores)
        category_correct += metrics.category_correct
        category_total += metrics.category_total

        per_pair.append({
            "label": pair.label,
            "ground_truth_count": len(pair.ground_truths),
            "ground_truths": pair.ground_truths,
            "detection": {
                k: v for k, v in metrics.to_dict().items() if k != "details"
            },
            "measured": metrics.details,
        })

    tp, fp, fn = (aggregate[key] for key in ("true_positives", "false_positives", "false_negatives"))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    clean_pairs = [p for p in per_pair if p["ground_truth_count"] == 0]
    clean_with_false_positive = sum(
        1 for p in clean_pairs if p["detection"]["false_positives"] > 0
    )

    return {
        "corpus": {
            "pairs": len(pairs),
            "seed": seed,
            "resolution": [WIDTH, HEIGHT],
            "ground_truth_defects": sum(len(p.ground_truths) for p in pairs),
            "clean_pairs": len(clean_pairs),
            "pairs_with_false_positive_on_clean_input": clean_with_false_positive,
            "geometric_offset_range_px": 14,
            "iou_threshold": iou_threshold,
        },
        "detection": {
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
            "mean_iou": round(float(np.mean(iou_scores)), 4) if iou_scores else 0.0,
            "matched_localisations": len(iou_scores),
        },
        "classification": {
            "correct": category_correct,
            "scored": category_total,
            "accuracy": round(category_correct / category_total, 4) if category_total else None,
        },
        "timing": {"pipeline_ms": elapsed_ms, "per_pair_ms": round(elapsed_ms / max(len(pairs), 1), 1)},
        "per_pair": per_pair,
    }
