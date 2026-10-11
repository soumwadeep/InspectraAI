"""Main vision engine: orchestrates the full inspection pipeline using OpenCV 5."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

from app.vision.preprocessing import (
    ImagePreprocessingConfig,
    preprocess_image,
)
from app.vision.quality import (
    ImageQualityThresholds,
    QualityAnalyzer,
    QualityMetrics,
)
from app.vision.alignment import (
    AlignmentConfig,
    AlignmentResult,
    ReferenceAligner,
)
from app.vision.change_detection import (
    ChangeDetectionConfig,
    ChangeDetectionResult,
    ChangeDetector,
)
from app.vision.evidence import EvidencePackage, generate_evidence
from app.vision.metrics import (
    DetectionMetrics,
    PredictionBox,
    calculate_precision_recall,
)


@dataclass
class InspectionResult:
    """Complete result of a visual inspection operation."""
    quality_metrics: QualityMetrics
    alignment_result: AlignmentResult
    change_detection: ChangeDetectionResult
    evidence: EvidencePackage
    detections: list[dict] = field(default_factory=list)
    anomalies: list[dict] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    overall_confidence: float = 0.0
    processing_time_ms: float = 0.0
    image_path: Optional[str] = None


class VisionEngine:
    """
    Orchestrates the OpenCV 5-based visual inspection pipeline.

    Pipeline stages:
    1. Decode + preprocess image
    2. Analyze image quality (blur, exposure, glare, coverage)
    3. Align with reference image (ORB + RANSAC + homography)
    4. Detect visual changes (difference + SSIM)
    5. Extract contours and characterize anomalies
    6. Generate evidence (annotated images, crops, comparisons)
    7. Evaluate metrics against ground truth (if provided, for benchmarking)
    """

    def __init__(
        self,
        quality_thresholds: Optional[ImageQualityThresholds] = None,
        alignment_config: Optional[AlignmentConfig] = None,
        detection_config: Optional[ChangeDetectionConfig] = None,
    ):
        self.quality_analyzer = QualityAnalyzer(quality_thresholds)
        self.aligner = ReferenceAligner(alignment_config)
        self.detector = ChangeDetector(detection_config)

    def analyze_image_quality(self, image: np.ndarray) -> QualityMetrics:
        """Stage 1+2: Preprocess and analyze image quality."""
        result = preprocess_image(image)
        return self.quality_analyzer.analyze(result.processed)

    def align_with_reference(
        self,
        reference: np.ndarray,
        input_image: np.ndarray,
    ) -> AlignmentResult:
        """Stage 3: Align image to reference using ORB + RANSAC."""
        result = self.aligner.align(reference, input_image)
        return result

    def detect_visual_changes(
        self,
        reference: np.ndarray,
        aligned: Optional[np.ndarray],
        aligned_mask: Optional[np.ndarray] = None,
    ) -> ChangeDetectionResult:
        """Stage 4: Detect visual changes between reference and aligned image."""
        result = self.detector.detect(reference, aligned, aligned_mask)
        return result

    def inspect(
        self,
        reference_image: np.ndarray,
        input_image: np.ndarray,
        quality_thresholds: Optional[ImageQualityThresholds] = None,
    ) -> InspectionResult:
        """
        Run the complete inspection pipeline.

        This is the main entry point for a single inspection operation.
        """
        import time
        start = time.time()

        # If custom thresholds provided, update analyzer
        if quality_thresholds:
            self.quality_analyzer.thresholds = quality_thresholds

        # Stage 1+2: Quality analysis
        quality_metrics = self.quality_analyzer.analyze(input_image)

        # Stage 3: Alignment
        alignment_result = self.aligner.align(reference_image, input_image)
        quality_metrics.alignment_confidence = alignment_result.confidence

        # If alignment failed, we can still run detection on raw images
        aligned = alignment_result.aligned_image
        mask = alignment_result.aligned_mask

        # Stage 4: Change detection
        change_result = self.detector.detect(reference_image, aligned, mask)

        # Stage 5: Extract anomaly details from changed regions
        detections = []
        anomalies = []
        for region in change_result.regions:
            detection = {
                "category": region.category or "anomaly",
                "bbox": {
                    "x": region.bbox_x,
                    "y": region.bbox_y,
                    "width": region.bbox_width,
                    "height": region.bbox_height,
                },
                "area_px": region.area,
                "confidence": region.confidence,
                "mean_intensity": region.mean_intensity,
            }
            detections.append(detection)

            # Classify anomaly severity
            if region.confidence > 0.7 or region.area > 1000:
                severity = "warning"
            elif region.confidence > 0.4 or region.area > 500:
                severity = "info"
            else:
                severity = "success"

            anomalies.append({
                "severity": severity,
                "category": region.category or "visual_change",
                "description": region.description or "Visual anomaly detected",
                "confidence": region.confidence,
                "bbox": {
                    "x": region.bbox_x,
                    "y": region.bbox_y,
                    "width": region.bbox_width,
                    "height": region.bbox_height,
                },
            })

        # Stage 6: Generate evidence
        evidence = generate_evidence(
            reference=reference_image,
            aligned=aligned,
            diff_mask=change_result.diff_mask,
            regions=change_result.regions,
            quality_issues=quality_metrics.reasons,
        )

        # Stage 7: Recommendations
        recommendations = self._generate_recommendations(
            quality_metrics, alignment_result, change_result
        )

        # Overall confidence
        overall = 0.0
        if change_result.regions:
            overall = float(np.mean([r.confidence for r in change_result.regions]))
        overall = min(1.0, overall * alignment_result.confidence)

        processing_time_ms = (time.time() - start) * 1000

        return InspectionResult(
            quality_metrics=quality_metrics,
            alignment_result=alignment_result,
            change_detection=change_result,
            evidence=evidence,
            detections=detections,
            anomalies=anomalies,
            recommendations=recommendations,
            overall_confidence=overall,
            processing_time_ms=processing_time_ms,
        )

    def _generate_recommendations(
        self,
        quality: QualityMetrics,
        alignment: AlignmentResult,
        changes: ChangeDetectionResult,
    ) -> list[str]:
        """Generate actionable recommendations based on inspection results."""
        recs: list[str] = []

        if quality.inspection_suitability == "insufficient":
            for reason in quality.reasons:
                recs.append(f"Quality issue: {reason}")

        if alignment.status != "success":
            recs.append(
                f"Alignment issue: {alignment.reason}. "
                "Retry with a closer camera angle or check reference image."
            )

        if changes.regions:
            recs.append(
                f"Found {len(changes.regions)} visual anomaly region(s). "
                f"SSIM={changes.ssim_score:.3f}, mean diff={changes.mean_abs_diff:.1f}"
            )

        if changes.ssim_score < 0.85:
            recs.append("Significant visual divergence (SSIM < 0.85) — schedule maintenance review.")

        return recs

    def evaluate_benchmark(
        self,
        reference_image: np.ndarray,
        input_image: np.ndarray,
        ground_truth_boxes: list,  # [[x1,y1,x2,y2], ...] or {"box": [...], "category": ...}
        iou_threshold: float = 0.5,
    ) -> DetectionMetrics:
        """
        Run inspection and compare detected anomalies against ground truth.

        Used by the benchmark system for measuring precision/recall/F1.
        """
        result = self.inspect(reference_image, input_image)

        predictions = [
            PredictionBox(
                x1=r.bbox_x, y1=r.bbox_y,
                x2=r.bbox_x + r.bbox_width, y2=r.bbox_y + r.bbox_height,
                category=r.category or "anomaly",
                confidence=r.confidence,
            )
            for r in result.change_detection.regions
        ]

        from app.vision.metrics import GroundTruthBox
        gt_boxes = [
            GroundTruthBox(
                x1=box["box"][0] if isinstance(box, dict) else box[0],
                y1=box["box"][1] if isinstance(box, dict) else box[1],
                x2=box["box"][2] if isinstance(box, dict) else box[2],
                y2=box["box"][3] if isinstance(box, dict) else box[3],
                category=box.get("category", "anomaly") if isinstance(box, dict) else "anomaly",
            )
            for box in ground_truth_boxes
        ]

        # Localisation is scored on geometry; the label score comes back as
        # category_correct/category_total. Requiring the category to agree here made
        # every prediction a false positive against generic ground truth.
        metrics = calculate_precision_recall(
            predictions, gt_boxes, iou_threshold, require_category_match=False
        )
        metrics.details = {
            "ssim_score": result.change_detection.ssim_score,
            "mean_abs_diff": result.change_detection.mean_abs_diff,
            "predictions": [
                {
                    "bbox": [p.x1, p.y1, p.x2, p.y2],
                    "category": p.category,
                    "confidence": round(p.confidence, 4),
                }
                for p in predictions
            ],
        }
        return metrics
