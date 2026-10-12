"""Vision-layer invariants. Each test exists because the behaviour was verified
by hand at some point and must not silently regress."""
from __future__ import annotations

import cv2
import numpy as np
import pytest

from app.vision.errors import VisionInputError
from app.vision.metrics import (
    GroundTruthBox,
    PredictionBox,
    calculate_precision_recall,
    iou,
)
from app.vision.ssim import compute_ssim


def _panel(seed: int = 3) -> np.ndarray:
    from app.vision.benchmark import draw_panel

    return draw_panel(np.random.default_rng(seed))


class TestSSIM:
    def test_identical_images_score_exactly_one(self):
        image = _panel()
        mean, mapping = compute_ssim(image, image)
        assert mean == pytest.approx(1.0, abs=1e-6)
        assert mapping.shape[0] <= image.shape[0]

    def test_symmetric(self):
        a, b = _panel(1), _panel(2)
        assert compute_ssim(a, b)[0] == pytest.approx(compute_ssim(b, a)[0], abs=1e-6)

    def test_blur_reduces_similarity_monotonically(self):
        reference = _panel()
        scores = []
        for sigma in (0, 1, 3, 7):
            blurred = cv2.GaussianBlur(reference, (0, 0), sigma) if sigma else reference
            scores.append(compute_ssim(reference, blurred)[0])
        assert scores == sorted(scores, reverse=True), scores
        assert scores[0] == pytest.approx(1.0, abs=1e-6)

    def test_size_mismatch_raises_instead_of_silently_resizing(self):
        with pytest.raises(VisionInputError):
            compute_ssim(_panel(), np.zeros((10, 10, 3), dtype=np.uint8))


class TestIoU:
    def test_disjoint_boxes_are_zero(self):
        assert iou([0, 0, 1, 1], [2, 2, 3, 3]) == 0.0

    def test_identical_boxes_are_one(self):
        assert iou([0, 0, 1, 1], [0, 0, 1, 1]) == pytest.approx(1.0)

    def test_half_overlap(self):
        assert iou([0, 0, 2, 2], [1, 0, 3, 2]) == pytest.approx(1 / 3)


class TestCategoryMatching:
    """The matcher once required prediction and ground-truth categories to be
    equal, while every ground truth was labelled 'ground_truth' — so nothing could
    ever match and precision and recall were permanently zero."""

    def test_geometry_only_matching_scores_a_localisation(self):
        predictions = [PredictionBox(0.1, 0.1, 0.3, 0.3, "discoloration", 0.9)]
        truths = [GroundTruthBox(0.1, 0.1, 0.3, 0.3, "discoloration")]
        metrics = calculate_precision_recall(
            predictions, truths, iou_threshold=0.3, require_category_match=False
        )
        assert metrics.true_positives == 1
        assert metrics.false_positives == 0
        assert metrics.category_correct == 1
        assert metrics.category_total == 1

    def test_wrong_label_still_counts_as_a_localisation_but_not_a_correct_category(self):
        predictions = [PredictionBox(0.1, 0.1, 0.3, 0.3, "dark_patch", 0.9)]
        truths = [GroundTruthBox(0.1, 0.1, 0.3, 0.3, "discoloration")]
        metrics = calculate_precision_recall(
            predictions, truths, iou_threshold=0.3, require_category_match=False
        )
        assert metrics.true_positives == 1
        assert metrics.category_correct == 0
        assert metrics.category_total == 1

    def test_distant_prediction_is_a_false_positive(self):
        predictions = [PredictionBox(0.7, 0.7, 0.9, 0.9, "discoloration", 0.9)]
        truths = [GroundTruthBox(0.1, 0.1, 0.3, 0.3, "discoloration")]
        metrics = calculate_precision_recall(predictions, truths, iou_threshold=0.3)
        assert metrics.false_positives == 1
        assert metrics.false_negatives == 1
        assert metrics.precision == 0.0


class TestClassification:
    """Categories must come from measured pixels, so pin the four cases that were
    checked against hand-built fixtures."""

    @pytest.mark.parametrize(
        "inject,expected",
        [
            ("discoloration", "discoloration"),
            ("dark_patch", "dark_patch"),
            ("brightness_increase", "brightness_increase"),
        ],
    )
    def test_injected_defect_classifies_to_its_own_category(self, inject, expected):
        from app.vision.benchmark import inject_defect
        from app.vision.engine import VisionEngine

        base = _panel()
        capture = base.copy()
        inject_defect(np.random.default_rng(5), inject, capture, 640, 430, 40)
        result = VisionEngine().inspect(base, capture)
        regions = result.change_detection.regions
        assert regions, "expected at least one region for an injected defect"
        assert any(r.category == expected for r in regions), [r.category for r in regions]


class TestBenchmarkCorpus:
    def test_corpus_contains_clean_pairs_and_in_range_ground_truth(self):
        from app.vision.benchmark import build_corpus

        pairs = build_corpus(pair_count=8, seed=7)
        assert len(pairs) == 8
        clean = [p for p in pairs if not p.ground_truths]
        assert clean, "corpus must include clean pairs so false positives are scored"
        for pair in pairs:
            for truth in pair.ground_truths:
                assert all(0.0 <= value <= 1.0 for value in truth["box"]), truth
                assert truth["box"][0] < truth["box"][2]
                assert truth["box"][1] < truth["box"][3]

    def test_clean_pairs_produce_no_regions_after_registration(self):
        """Regression: a replicated warp border made a defect-free capture look like
        a whole-frame change."""
        from app.vision.engine import VisionEngine

        engine = VisionEngine()
        from app.vision.benchmark import FIELD_PAD, HEIGHT, WIDTH, _base_panel

        origin = FIELD_PAD // 2
        for seed in (11, 22, 33):
            field = _base_panel(np.random.default_rng(seed), size=(WIDTH + FIELD_PAD, HEIGHT + FIELD_PAD))
            reference = field[origin:origin + HEIGHT, origin:origin + WIDTH]
            for tx, ty in ((11, -7), (-12, 9), (7, 7), (0, -14)):
                capture = field[origin + ty:origin + ty + HEIGHT, origin + tx:origin + tx + WIDTH]
                result = engine.inspect(reference, capture)
                assert result.change_detection.num_changed_regions == 0, (
                    seed, tx, ty, result.change_detection.regions
                )
