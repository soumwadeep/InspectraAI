"""Evaluation metrics: precision/recall/F1, IoU, mAP for benchmarking."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np


@dataclass
class DetectionMetrics:
    """Comprehensive detection performance metrics."""
    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0
    precision: float = 0.0
    recall: float = 0.0
    f1_score: float = 0.0
    false_positive_rate: float = 0.0
    iou_scores: list[float] = None  # type: ignore

    def to_dict(self) -> dict:
        return {
            "true_positives": self.true_positives,
            "false_positives": self.false_positives,
            "false_negatives": self.false_negatives,
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "f1_score": round(self.f1_score, 4),
            "false_positive_rate": round(self.false_positive_rate, 4),
            "mean_iou": round(float(np.mean(self.iou_scores)) if self.iou_scores else 0.0, 4) if self.iou_scores else 0.0,
            "iou_scores": self.iou_scores if self.iou_scores else [],
        }


def iou(box1: list[float], box2: list[float]) -> float:
    """
    Compute Intersection over Union of two bounding boxes.
    Each box is [x1, y1, x2, y2] (absolute coordinates).
    """
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])

    intersection = max(0, x2 - x1) * max(0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - intersection

    if union == 0:
        return 0.0
    return intersection / union


@dataclass
class GroundTruthBox:
    x1: float
    y1: float
    x2: float
    y2: float
    category: str
    confidence: float = 1.0


@dataclass
class PredictionBox:
    x1: float
    y1: float
    x2: float
    y2: float
    category: str
    confidence: float


def calculate_precision_recall(
    predictions: list[PredictionBox],
    ground_truths: list[GroundTruthBox],
    iou_threshold: float = 0.5,
) -> DetectionMetrics:
    """
    Calculate precision, recall, F1, and false positive rate for object detection.
    """
    metrics = DetectionMetrics(iou_scores=[])
    matched_gt: set[int] = set()
    matched_pred: set[int] = set()
    fp_predictions: list[PredictionBox] = []

    # Sort predictions by confidence (descending)
    sorted_preds = sorted(predictions, key=lambda p: p.confidence, reverse=True)

    for pred in sorted_preds:
        best_iou = 0.0
        best_gt_idx = -1

        for gt_idx, gt in enumerate(ground_truths):
            if gt_idx in matched_gt:
                continue
            if pred.category != gt.category:
                continue

            current_iou = iou(
                [pred.x1, pred.y1, pred.x2, pred.y2],
                [gt.x1, gt.y1, gt.x2, gt.y2]
            )
            if current_iou > best_iou and current_iou >= iou_threshold:
                best_iou = current_iou
                best_gt_idx = gt_idx

        if best_gt_idx >= 0:
            metrics.true_positives += 1
            matched_gt.add(best_gt_idx)
            matched_pred.add(sorted_preds.index(pred))
            metrics.iou_scores.append(best_iou)
        else:
            metrics.false_positives += 1
            fp_predictions.append(pred)

    metrics.false_negatives = len(ground_truths) - len(matched_gt)

    # Precision
    total_preds = metrics.true_positives + metrics.false_positives
    metrics.precision = metrics.true_positives / total_preds if total_preds > 0 else 0.0

    # Recall
    total_possible = metrics.true_positives + metrics.false_negatives
    metrics.recall = metrics.true_positives / total_possible if total_possible > 0 else 0.0

    # F1
    if metrics.precision + metrics.recall > 0:
        metrics.f1_score = 2 * (metrics.precision * metrics.recall) / (metrics.precision + metrics.recall)
    else:
        metrics.f1_score = 0.0

    # False Positive Rate (FPR = FP / total possible)
    metrics.false_positive_rate = metrics.false_positives / total_possible if total_possible > 0 else 0.0

    return metrics
