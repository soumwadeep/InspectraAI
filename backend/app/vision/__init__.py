"""Vision engine package — real OpenCV 5 processing for industrial inspection."""
from app.vision.preprocessing import preprocess_image, ImagePreprocessingConfig
from app.vision.quality import QualityAnalyzer, QualityMetrics, ImageQualityThresholds
from app.vision.alignment import AlignmentResult, ReferenceAligner
from app.vision.change_detection import ChangeDetectionResult, ChangeDetector
from app.vision.evidence import EvidencePackage, generate_evidence
from app.vision.metrics import DetectionMetrics, calculate_precision_recall, iou

__all__ = [
    "preprocess_image",
    "ImagePreprocessingConfig",
    "QualityAnalyzer",
    "QualityMetrics",
    "ImageQualityThresholds",
    "AlignmentResult",
    "ReferenceAligner",
    "ChangeDetectionResult",
    "ChangeDetector",
    "EvidencePackage",
    "generate_evidence",
    "DetectionMetrics",
    "calculate_precision_recall",
    "iou",
]
