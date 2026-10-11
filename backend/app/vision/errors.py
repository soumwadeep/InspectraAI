"""Errors raised by the vision layer.

Vision failures must be distinguishable from "no defect found". Silently
substituting a plausible number for a failed computation is how this codebase
ended up serving normalized cross-correlation under the name `ssim_score`.
"""
from __future__ import annotations


class VisionError(Exception):
    """Base class for vision-layer failures."""


class VisionComputationError(VisionError):
    """A measurement could not be produced, so no value is reported."""


class VisionInputError(VisionError):
    """The supplied pixels cannot be used (undecodable, wrong shape, empty)."""
