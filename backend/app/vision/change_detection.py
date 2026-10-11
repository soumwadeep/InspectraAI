"""Visual change detection: difference, SSIM, contours, region filtering."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

from app.vision.classification import classify_region
from app.vision.ssim import compute_ssim as ssim_compute


@dataclass
class ChangedRegion:
    """A localized region of visual change."""
    bbox_x: float
    bbox_y: float
    bbox_width: float
    bbox_height: float
    area: int
    mean_intensity: float
    confidence: float
    description: str = ""
    # Read by vision/engine.py and vision/evidence.py. It was absent from this
    # dataclass, so any inspection that actually found a change raised
    # AttributeError instead of returning it.
    category: str = "visual_change"
    details_json: dict = field(default_factory=dict)


@dataclass
class ChangeDetectionResult:
    """Result of change detection between reference and aligned image."""
    status: str  # detected | no_change | alignment_required | failed
    num_changed_regions: int
    total_changed_area: int
    regions: list[ChangedRegion]
    diff_mask: Optional[np.ndarray]
    ssim_score: float
    mean_abs_diff: float
    change_fraction: float
    reason: str = ""
    ssim_map: Optional[np.ndarray] = None


@dataclass
class ChangeDetectionConfig:
    diff_threshold: float = 25.0
    min_region_area: int = 100
    max_regions: int = 50
    morphological_kernel_size: int = 5
    morphological_iterations: int = 2
    contour_filter_factor: float = 0.01
    # Pixels within this many columns/rows of the coverage boundary are dropped
    # even when the warp mask calls them valid: resampling at the seam of a
    # homography is unreliable, and it was producing 1-3px full-height "dark_patch"
    # strips along the frame edge on captures with no defect in them.
    mask_margin_px: int = 3


class ChangeDetector:
    """Detects visual changes between aligned images using difference + SSIM."""

    def __init__(self, config: Optional[ChangeDetectionConfig] = None):
        self.config = config or ChangeDetectionConfig()

    @staticmethod
    def compute_ssim(img1: np.ndarray, img2: np.ndarray) -> float:
        """Structural similarity, delegating to the numpy/OpenCV implementation.

        This used to call ``cv2.quality_QualitySSIM_create`` inside a bare
        ``except Exception`` that fell back to ``matchTemplate(TM_CCOEFF_NORMED)``.
        That module is not in opencv-python-headless, so the fallback always ran
        and whole-image cross-correlation was reported as ``ssim_score`` — a number
        the maintenance threshold was compared against. There is no fallback now.
        """
        score, _ = ssim_compute(img1, img2)
        return score

    @staticmethod
    def compute_ssim_map(img1: np.ndarray, img2: np.ndarray) -> tuple[float, np.ndarray]:
        """Mean similarity plus the per-pixel map, for localised evidence."""
        return ssim_compute(img1, img2)

    def detect(
        self,
        reference: np.ndarray,
        aligned: np.ndarray,
        aligned_mask: Optional[np.ndarray] = None,
    ) -> ChangeDetectionResult:
        """
        Compare a reference image with an aligned input image.

        Returns changed regions and similarity metrics.
        """
        if aligned is None:
            return ChangeDetectionResult(
                status="alignment_required",
                num_changed_regions=0,
                total_changed_area=0,
                regions=[],
                diff_mask=None,
                ssim_score=0.0,
                mean_abs_diff=0.0,
                change_fraction=0.0,
                reason="Aligned image is None — reference alignment required",
            )

        # Convert both to grayscale
        if len(reference.shape) == 3:
            ref_gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
        else:
            ref_gray = reference.copy()
        if len(aligned.shape) == 3:
            aligned_gray = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)
        else:
            aligned_gray = aligned.copy()

        # Ensure same dimensions
        h_ref, w_ref = ref_gray.shape
        if aligned_gray.shape != ref_gray.shape:
            aligned_gray = cv2.resize(aligned_gray, (w_ref, h_ref))

        # Colour copies at reference resolution, for region classification.
        ref_color = (
            reference if reference.ndim == 3
            else cv2.cvtColor(reference, cv2.COLOR_GRAY2BGR)
        )
        cur_color = (
            aligned if aligned.ndim == 3
            else cv2.cvtColor(aligned, cv2.COLOR_GRAY2BGR)
        )
        if cur_color.shape[:2] != (h_ref, w_ref):
            cur_color = cv2.resize(cur_color, (w_ref, h_ref))
        if ref_color.shape[:2] != (h_ref, w_ref):
            ref_color = cv2.resize(ref_color, (w_ref, h_ref))

        # Compute SSIM
        ssim_score, ssim_map = self.compute_ssim_map(ref_gray, aligned_gray)

        # Absolute difference
        diff = cv2.absdiff(ref_gray, aligned_gray)
        mean_abs_diff = float(diff.mean())

        # Threshold the difference to get change mask
        _, diff_thresh = cv2.threshold(
            diff, self.config.diff_threshold, 255, cv2.THRESH_BINARY
        )
        diff_thresh = diff_thresh.astype(np.uint8)

        # Apply aligned mask if available (mask out invalid regions)
        if aligned_mask is not None:
            valid = (aligned_mask > 0).astype(np.uint8) * 255
            margin = self.config.mask_margin_px
            if margin > 0:
                # Shrink coverage by a few pixels so the homography's resampling
                # seam is never scored as a change.
                valid = cv2.erode(
                    valid,
                    cv2.getStructuringElement(
                        cv2.MORPH_RECT, (margin * 2 + 1, margin * 2 + 1)
                    ),
                )
            diff_thresh = cv2.bitwise_and(diff_thresh, diff_thresh, mask=valid)

        # Morphological cleanup
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (self.config.morphological_kernel_size, self.config.morphological_kernel_size)
        )
        diff_clean = cv2.morphologyEx(
            diff_thresh, cv2.MORPH_CLOSE, kernel,
            iterations=self.config.morphological_iterations
        )
        diff_clean = cv2.morphologyEx(
            diff_clean, cv2.MORPH_OPEN, kernel,
            iterations=1
        )

        # Find contours
        contours, _ = cv2.findContours(
            diff_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        regions: list[ChangedRegion] = []
        total_area = int(diff_clean.sum() / 255)

        # Sort contours by area (largest first) and limit
        contours = sorted(contours, key=cv2.contourArea, reverse=True)
        contours = contours[: self.config.max_regions]

        for contour in contours:
            area = int(cv2.contourArea(contour))
            if area < self.config.min_region_area:
                continue

            x, y, w, h = cv2.boundingRect(contour)
            mask_roi = np.zeros((h, w), dtype=np.uint8)
            contour_offset = contour - [x, y]
            cv2.drawContours(mask_roi, [contour_offset], -1, 255, -1)

            # Mean intensity in the changed region
            roi_diff = diff[y:y + h, x:x + w]
            mean_intensity = float(roi_diff[roi_diff > 0].mean()) if (roi_diff > 0).any() else 0.0

            # Confidence based on area and intensity
            confidence = min(1.0, area / 5000.0) * min(1.0, mean_intensity / 100.0)

            classification = classify_region(
                ref_color, cur_color, x, y, w, h, region_mask=mask_roi
            )

            regions.append(ChangedRegion(
                bbox_x=x / w_ref,
                bbox_y=y / h_ref,
                bbox_width=w / w_ref,
                bbox_height=h / h_ref,
                area=area,
                mean_intensity=mean_intensity,
                confidence=confidence,
                description=f"Change region {len(regions) + 1}: {area}px at ({x}, {y})",
                category=classification.category,
                details_json=classification.details,
            ))

        change_fraction = total_area / (h_ref * w_ref) if h_ref * w_ref > 0 else 0.0

        status = "detected" if regions else "no_change"
        reason = "" if regions else "No significant visual changes detected"

        return ChangeDetectionResult(
            status=status,
            num_changed_regions=len(regions),
            total_changed_area=total_area,
            regions=regions,
            diff_mask=diff_clean,
            ssim_score=ssim_score,
            mean_abs_diff=mean_abs_diff,
            change_fraction=change_fraction,
            reason=reason,
            ssim_map=ssim_map,
        )
