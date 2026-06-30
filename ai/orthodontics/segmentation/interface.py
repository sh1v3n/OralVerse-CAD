from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np


@dataclass
class DentalMesh:
    """Canonical input to all segmenters."""
    vertices: np.ndarray  # (N, 3) float32, in mm
    faces: np.ndarray     # (M, 3) int32, indices into vertices
    arch: str             # "upper" | "lower"


@dataclass
class ToothSegment:
    fdi: int
    face_mask: np.ndarray   # (M,) bool — which faces belong to this tooth
    confidence: float        # 0–1
    centroid: np.ndarray     # (3,) float32
    long_axis: np.ndarray    # (3,) float32 — estimated tooth long axis (PCA)


@dataclass
class SegmentationResult:
    segments: list[ToothSegment]
    gingiva_mask: np.ndarray  # (M,) bool — gingival faces
    model: str                # "heuristic-v1", "meshsegnet-v2", …
    duration_ms: float


class Segmenter(Protocol):
    def segment(self, mesh: DentalMesh) -> SegmentationResult: ...
