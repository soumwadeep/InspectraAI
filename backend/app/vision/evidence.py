"""Evidence package generation: annotated images, cropped regions, comparison overlays."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

from app.vision.change_detection import ChangedRegion


@dataclass
class EvidencePackage:
    """A collection of evidence artifacts for a detected finding."""
    annotated_images: dict[str, bytes] = field(default_factory=dict)  # filename -> PNG bytes
    cropped_images: dict[str, bytes] = field(default_factory=dict)
    comparison_overlays: dict[str, bytes] = field(default_factory=dict)
    diff_masks: dict[str, bytes] = field(default_factory=dict)
    metadata: dict = field(default_factory=dict)


def draw_bbox(
    image: np.ndarray,
    x: int, y: int, w: int, h: int,
    color: tuple[int, int, int] = (0, 0, 255),
    thickness: int = 2,
    label: Optional[str] = None,
) -> np.ndarray:
    """Draw a bounding box with optional label on an image (returns a copy)."""
    result = image.copy()
    cv2.rectangle(result, (x, y), (x + w, y + h), color, thickness)

    if label:
        # Draw label background
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(result, (x, y - th - 8), (x + tw + 6, y), color, -1)
        cv2.putText(result, label, (x + 3, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    return result


def encode_image_png(image: np.ndarray) -> bytes:
    """Encode a numpy image array as PNG bytes."""
    _, buffer = cv2.imencode(".png", image)
    return buffer.tobytes()


def generate_evidence(
    reference: np.ndarray,
    aligned: Optional[np.ndarray] = None,
    diff_mask: Optional[np.ndarray] = None,
    regions: Optional[list[ChangedRegion]] = None,
    quality_issues: Optional[list[str]] = None,
    bbox_relative: bool = True,
) -> EvidencePackage:
    """
    Generate evidence artifacts for a finding.

    Produces:
    - Annotated overlay on the reference image with all changed regions marked
    - Cropped images of each changed region
    - Side-by-side comparison of reference vs aligned
    - Difference mask visualization
    """
    evidence = EvidencePackage()
    h_ref, w_ref = reference.shape[:2]

    # Annotated image on reference
    annotated = reference.copy()
    if regions:
        for i, region in enumerate(regions):
            if bbox_relative:
                x = int(region.bbox_x * w_ref)
                y = int(region.bbox_y * h_ref)
                w = int(region.bbox_width * w_ref)
                h = int(region.bbox_height * h_ref)
            else:
                x, y, w, h = int(region.bbox_x), int(region.bbox_y), int(region.bbox_width), int(region.bbox_height)

            confidence = region.confidence
            color = (0, int(255 * (1 - confidence)), int(255 * confidence))
            label = f"{region.category or region.description[:30]} {confidence:.0%}"
            annotated = draw_bbox(annotated, x, y, w, h, color=color, thickness=2, label=label)

    if quality_issues:
        text = "Quality: " + "; ".join(quality_issues[:3])
        cv2.putText(annotated, text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2)

    evidence.annotated_images["annotated_reference.png"] = encode_image_png(annotated)

    # Create color-mapped difference mask
    if diff_mask is not None:
        diff_viz = cv2.applyColorMap(diff_mask, cv2.COLORMAP_JET)
        # Blend with reference (50% overlay)
        diff_blend = cv2.addWeighted(reference, 0.6, diff_viz, 0.4, 0)
        evidence.diff_masks["diff_overlay.png"] = encode_image_png(diff_blend)
        evidence.diff_masks["diff_mask_raw.png"] = encode_image_png(
            cv2.cvtColor(diff_mask, cv2.COLOR_GRAY2BGR)
        )

    # Side-by-side comparison
    if aligned is not None:
        aligned_resized = aligned
        if aligned_resized.shape[:2] != reference.shape[:2]:
            aligned_resized = cv2.resize(aligned_resized, (w_ref, h_ref))

        comparison = np.hstack([reference, aligned_resized])
        label_y = 20
        cv2.putText(comparison, "Reference", (10, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(comparison, "Current", (w_ref + 10, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        evidence.comparison_overlays["comparison.png"] = encode_image_png(comparison)

    # Cropped regions
    if regions:
        for i, region in enumerate(regions):
            if bbox_relative:
                x = int(region.bbox_x * w_ref)
                y = int(region.bbox_y * h_ref)
                w = int(region.bbox_width * w_ref)
                h = int(region.bbox_height * h_ref)
            else:
                x, y, w, h = int(region.bbox_x), int(region.bbox_y), int(region.bbox_width), int(region.bbox_height)

            x = max(0, x)
            y = max(0, y)
            w = min(w, w_ref - x)
            h = min(h, h_ref - y)

            if w > 0 and h > 0:
                crop = reference[y:y + h, x:x + w]
                evidence.cropped_images[f"region_{i + 1}.png"] = encode_image_png(crop)

                # Annotated crop
                annotated_crop = draw_bbox(
                    crop, 0, 0, w, h,
                    color=(0, 0, 255), thickness=2,
                    label=f"Area: {region.area}px"
                )
                evidence.annotated_images[f"region_{i + 1}_annotated.png"] = encode_image_png(annotated_crop)

    evidence.metadata = {
        "reference_shape": [h_ref, w_ref, reference.shape[2] if len(reference.shape) > 2 else 1],
        "num_regions": len(regions) if regions else 0,
    }

    return evidence
