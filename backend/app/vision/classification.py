"""Heuristic classification of changed regions.

These are measured image statistics, not a trained detector: each label is
produced from a specific comparison of the reference and the aligned capture
inside the region, and the numbers that decided it travel with the result in
`details` so the UI can explain the label instead of asserting it.

Do not describe this as defect recognition in documentation. It answers "how did
this region change", not "what is wrong with this machine".
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

# OpenCV HSV hue runs 0-179 (half-degrees). Rust, oil and heat discolouration sit
# in the warm band, which WRAPS: red is near 0 and again near 179, so a rust patch
# at hue ~6 is only counted as warm if the low end is included.
_WARM_HUE_END_LOW = 35.0
_WARM_HUE_START_HIGH = 168.0


@dataclass
class RegionClassification:
    category: str
    details: dict[str, Any] = field(default_factory=dict)


def _warm_hue_fraction(hsv: np.ndarray, mask: np.ndarray | None = None) -> float:
    """Fraction of chromatic pixels that fall in the warm (rust/oil) hue band.

    Grey pixels are excluded because hue is meaningless without saturation.
    """
    hue = hsv[:, :, 0].astype(np.float32)
    sat = hsv[:, :, 1]
    chromatic = sat > 40
    if mask is not None:
        chromatic = chromatic & (mask > 0)
    if not chromatic.any():
        return 0.0
    warm = ((hue <= _WARM_HUE_END_LOW) | (hue >= _WARM_HUE_START_HIGH)) & chromatic
    return float(warm.sum()) / float(chromatic.sum())


def _masked_mean(values: np.ndarray, mask: np.ndarray) -> float:
    """Mean over the region's own pixels.

    Using the bounding box instead would average in the surrounding surface, and
    a compact dark stain would read as a mild global change and fall through to
    `visual_change`.
    """
    selected = values[mask > 0]
    return float(selected.mean()) if selected.size else float(values.mean())


def _masked_edge_density(gray: np.ndarray, mask: np.ndarray) -> float:
    edges = cv2.Canny(gray, 50, 150)
    inside = mask > 0
    if not inside.any():
        return 0.0
    return float(np.count_nonzero(edges[inside])) / float(np.count_nonzero(inside))


def classify_region(
    reference_bgr: np.ndarray,
    current_bgr: np.ndarray,
    x: int,
    y: int,
    width: int,
    height: int,
    region_mask: np.ndarray | None = None,
) -> RegionClassification:
    """Classify one changed rectangle shared by a reference and a current image.

    `region_mask` is the filled contour cropped to the bounding box; when it is
    supplied every statistic is measured over the changed pixels only.
    """
    box = (slice(y, y + height), slice(x, x + width))
    ref = reference_bgr[box]
    cur = current_bgr[box]

    if ref.size == 0 or cur.size == 0:
        return RegionClassification("visual_change", {"note": "degenerate region"})

    ref_gray = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)
    cur_gray = cv2.cvtColor(cur, cv2.COLOR_BGR2GRAY)
    ref_hsv = cv2.cvtColor(ref, cv2.COLOR_BGR2HSV)
    cur_hsv = cv2.cvtColor(cur, cv2.COLOR_BGR2HSV)

    if region_mask is None or region_mask.shape != ref_gray.shape:
        region_mask = np.full(ref_gray.shape, 255, np.uint8)

    delta_brightness = _masked_mean(cur_gray, region_mask) - _masked_mean(ref_gray, region_mask)
    delta_saturation = _masked_mean(cur_hsv[:, :, 1], region_mask) - _masked_mean(
        ref_hsv[:, :, 1], region_mask
    )
    cur_mean = _masked_mean(cur_gray, region_mask)
    warm_fraction = _warm_hue_fraction(cur_hsv, region_mask)
    ref_warm_fraction = _warm_hue_fraction(ref_hsv, region_mask)

    ref_edges = _masked_edge_density(ref_gray, region_mask)
    cur_edges = _masked_edge_density(cur_gray, region_mask)
    edge_delta = cur_edges - ref_edges

    details = {
        "delta_brightness": round(delta_brightness, 2),
        "delta_saturation": round(delta_saturation, 2),
        "region_mean": round(cur_mean, 2),
        "warm_hue_fraction": round(warm_fraction, 3),
        "reference_warm_hue_fraction": round(ref_warm_fraction, 3),
        "edge_density_reference": round(ref_edges, 4),
        "edge_density_current": round(cur_edges, 4),
        "edge_density_delta": round(edge_delta, 4),
    }

    # Ordered most specific first. Colour change is checked before brightness
    # because a saturated stain also changes brightness, and "this got darker" is
    # a weaker claim than "this turned the colour of rust".
    if delta_saturation > 25 and max(warm_fraction, ref_warm_fraction) > 0.15:
        return RegionClassification("discoloration", details)

    if delta_brightness > 40 and cur_gray.mean() > 140:
        return RegionClassification("brightness_increase", details)

    if delta_brightness < -40 and cur_gray.mean() < 80:
        return RegionClassification("dark_patch", details)

    if ref_edges > 0.02 and edge_delta < -0.5 * ref_edges:
        return RegionClassification("detail_loss", details)

    if cur_edges - ref_edges > 0.02:
        return RegionClassification("new_texture", details)

    return RegionClassification("visual_change", details)
