"""Image quality analysis: blur, exposure, glare, occlusion, resolution, alignment."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np


@dataclass
class QualityMetrics:
    """Structured quality metrics computed from an image."""
    blur_score: float = 0.0         # Variance of Laplacian (higher = sharper)
    exposure_score: float = 0.0     # 0 (underexposed) to 1 (overexposed), 0.5 = ideal
    glare_estimate: float = 0.0     # Fraction of pixels in overexposed/saturated regions
    image_coverage: float = 1.0     # Fraction of non-border region occupied by content (0-1)
    alignment_confidence: float = 0.0  # Set externally from alignment step (0-1)
    inspection_suitability: str = "sufficient"  # sufficient | insufficient
    reasons: list[str] = field(default_factory=list)
    # Internal metrics for thresholds
    brightness_mean: float = 0.0
    brightness_std: float = 0.0
    saturation_mean: float = 0.0
    edge_density: float = 0.0
    resolution_width: int = 0
    resolution_height: int = 0


@dataclass
class ImageQualityThresholds:
    """Configurable thresholds for quality assessment."""
    min_blur_score: float = 100.0
    min_exposure_score: float = 0.1   # too dark below this
    max_exposure_score: float = 0.9   # too bright (overexposed) above this
    max_glare_fraction: float = 0.05
    min_coverage: float = 0.3
    min_resolution: int = 640
    min_edge_density: float = 0.01


class QualityAnalyzer:
    """Analyzes image quality using real OpenCV metrics."""

    def __init__(self, thresholds: Optional[ImageQualityThresholds] = None):
        self.thresholds = thresholds or ImageQualityThresholds()

    @staticmethod
    def compute_blur_score(image: np.ndarray) -> float:
        """Variance of Laplacian — higher means sharper."""
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        return float(laplacian.var())

    @staticmethod
    def compute_exposure(image: np.ndarray) -> tuple[float, float, float]:
        """
        Compute exposure score (0=fully underexposed, 1=fully overexposed, 0.5=ideal).
        Returns (exposure_score, brightness_mean, brightness_std).
        """
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.astype(np.float64)

        brightness_mean = float(gray.mean()) / 255.0

        # Count over/under-exposed pixels
        overexposed = np.sum(gray >= 250) / gray.size
        underexposed = np.sum(gray <= 5) / gray.size

        # Score: penalize both over and under exposure
        # 0.5 = ideal mid-exposure
        raw_score = brightness_mean
        # Clamp and weight
        exposure_score = max(0.0, min(1.0, raw_score + 0.5 * (overexposed - underexposed)))

        return exposure_score, brightness_mean, float(gray.std()) / 255.0

    @staticmethod
    def compute_glare(image: np.ndarray) -> tuple[float, float]:
        """
        Estimate glare by detecting specular highlights (near-white, saturated regions).
        Returns (glare_fraction, saturation_mean).
        """
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)

        saturation_mean = float(s.mean()) / 255.0

        # Specular highlights: high value + low saturation (white glare)
        glare_mask = (v >= 245) & (s <= 30)
        glare_fraction = float(glare_mask.sum()) / float(v.size)

        return glare_fraction, saturation_mean

    @staticmethod
    def compute_coverage(image: np.ndarray) -> float:
        """Estimate fraction of the image occupied by actual content vs. borders."""
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # Create a mask of non-very-dark regions
        _, mask = cv2.threshold(gray, 5, 255, cv2.THRESH_BINARY)

        # Find the bounding box of content
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return 0.0

        h, w = gray.shape
        total_area = float(w * h)
        content_area = sum(cv2.contourArea(c) for c in contours)
        return min(1.0, content_area / total_area)

    @staticmethod
    def compute_edge_density(image: np.ndarray) -> float:
        """Fraction of pixels that are edges (Canny)."""
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        edges = cv2.Canny(gray, 50, 150)
        return float(edges.sum()) / float(255 * edges.size)

    def analyze(self, image: np.ndarray) -> QualityMetrics:
        """Run the full quality analysis pipeline."""
        h, w = image.shape[:2]

        blur_score = self.compute_blur_score(image)
        exposure_score, brightness_mean, brightness_std = self.compute_exposure(image)
        glare_fraction, saturation_mean = self.compute_glare(image)
        coverage = self.compute_coverage(image)
        edge_density = self.compute_edge_density(image)

        reasons: list[str] = []
        suitable = True

        if blur_score < self.thresholds.min_blur_score:
            reasons.append(
                f"Image is blurry (Laplacian variance {blur_score:.1f} < {self.thresholds.min_blur_score})"
            )
            suitable = False

        if brightness_mean < 0.2:
            reasons.append("Image is underexposed")
            suitable = False

        if glare_fraction > self.thresholds.max_glare_fraction:
            reasons.append(
                f"Glare detected ({glare_fraction:.1%} of image is saturated highlights)"
            )
            suitable = False

        if coverage < self.thresholds.min_coverage:
            reasons.append(
                f"Low image coverage ({coverage:.1%}) — possible occlusion or framing issue"
            )
            suitable = False

        if max(w, h) < self.thresholds.min_resolution:
            reasons.append(
                f"Image resolution too low ({w}x{h} < {self.thresholds.min_resolution})"
            )
            suitable = False

        if edge_density < self.thresholds.min_edge_density:
            reasons.append("Image lacks visual detail — possible over-smoothing")
            suitable = False

        return QualityMetrics(
            blur_score=blur_score,
            exposure_score=exposure_score,
            glare_estimate=glare_fraction,
            image_coverage=coverage,
            alignment_confidence=0.0,  # Set by alignment step
            inspection_suitability="sufficient" if suitable else "insufficient",
            reasons=reasons,
            brightness_mean=brightness_mean,
            brightness_std=brightness_std,
            saturation_mean=saturation_mean,
            edge_density=edge_density,
            resolution_width=w,
            resolution_height=h,
        )
