"""Structural similarity, implemented directly with OpenCV 5 primitives.

Why this file exists
-------------------
`change_detection.py` previously called ``cv2.quality_QualitySSIM_create``, which
does not exist in ``opencv-python-headless`` (the quality module lives in
opencv-contrib and exposes a different API anyway). A bare ``except Exception``
swallowed the ``AttributeError`` and returned
``cv2.matchTemplate(..., TM_CCOEFF_NORMED)[0][0]`` instead — normalized
cross-correlation of the whole image — under the name ``ssim_score``. That number
was then compared against a ``< 0.85`` threshold to decide whether to raise a
maintenance ticket, so a fabrication sat on the decision path.

There is now no fallback: if SSIM cannot be computed, this raises and the caller
reports the failure.
"""
from __future__ import annotations

import cv2
import numpy as np

from app.vision.errors import VisionInputError

# Constants from Wang et al. 2004 for 8-bit images.
_WINDOW_RADIUS = 11
_WINDOW_SIGMA = 1.5
_K1 = 0.01
_K2 = 0.03
_DATA_RANGE = 255.0


def _to_float_gray(image: np.ndarray) -> np.ndarray:
    if image is None or image.size == 0:
        raise VisionInputError("SSIM requires a non-empty image")

    if image.ndim == 2:
        gray = image
    elif image.ndim == 3 and image.shape[2] == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    elif image.ndim == 3 and image.shape[2] == 1:
        gray = image[:, :, 0]
    else:
        raise VisionInputError(f"Unsupported image shape for SSIM: {image.shape}")

    return gray.astype(np.float64)


def compute_ssim(
    image_a: np.ndarray, image_b: np.ndarray
) -> tuple[float, np.ndarray]:
    """Return ``(mean_ssim, ssim_map)`` for two same-sized images.

    The map is as useful as the scalar: it localises *where* structure diverges,
    and is what the heatmap evidence should be drawn from.

    Both images must cover the same region. When they do not, the caller has to
    align them first — resizing to force a match would quietly invent similarity.
    """
    a = _to_float_gray(image_a)
    b = _to_float_gray(image_b)

    if a.shape != b.shape:
        raise VisionInputError(
            f"SSIM needs identical dimensions, got {a.shape} and {b.shape}"
        )

    c1 = (_K1 * _DATA_RANGE) ** 2
    c2 = (_K2 * _DATA_RANGE) ** 2

    # BORDER_REPLICATE approximates the reflect-101 padding of the reference
    # implementation; the default BORDER_REFLECT would crash on images narrower
    # than the window.
    border = cv2.BORDER_REPLICATE

    mu_a = cv2.GaussianBlur(a, (_WINDOW_RADIUS, _WINDOW_RADIUS), _WINDOW_SIGMA, borderType=border)
    mu_b = cv2.GaussianBlur(b, (_WINDOW_RADIUS, _WINDOW_RADIUS), _WINDOW_SIGMA, borderType=border)

    sigma_a2 = (
        cv2.GaussianBlur(a * a, (_WINDOW_RADIUS, _WINDOW_RADIUS), _WINDOW_SIGMA, borderType=border)
        - mu_a * mu_a
    )
    sigma_b2 = (
        cv2.GaussianBlur(b * b, (_WINDOW_RADIUS, _WINDOW_RADIUS), _WINDOW_SIGMA, borderType=border)
        - mu_b * mu_b
    )
    sigma_ab = (
        cv2.GaussianBlur(
            a * b, (_WINDOW_RADIUS, _WINDOW_RADIUS), _WINDOW_SIGMA, borderType=border
        )
        - mu_a * mu_b
    )

    numerator = (2 * mu_a * mu_b + c1) * (2 * sigma_ab + c2)
    denominator = (mu_a * mu_a + mu_b * mu_b + c1) * (sigma_a2 + sigma_b2 + c2)

    with np.errstate(divide="ignore", invalid="ignore"):
        ssim_map = np.where(
            denominator == 0, 1.0, numerator / denominator
        ).astype(np.float32)

    return float(np.mean(ssim_map)), ssim_map


def ssim_to_heatmap(ssim_map: np.ndarray) -> np.ndarray:
    """Map low similarity to warm colours, for display as difference evidence."""
    # Low similarity is the signal, so invert before applying the colour map.
    inverted = np.clip(1.0 - ssim_map, 0.0, 1.0)
    scaled = (inverted * 255.0).astype(np.uint8)
    return cv2.applyColorMap(scaled, cv2.COLORMAP_JET)
