"""Learned-model adapters for reconstructed dental meshes.

Production checkpoints are intentionally external to this repository. The
planner only needs the normalized tooth-pose contract returned here, allowing
PointNet++, MeshSegNet, and a tooth-graph model to evolve independently.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class ToothSegmentationModel(Protocol):
    def segment(self, vertices: object, faces: object) -> object:
        """Return an FDI-aware label for each mesh face or point."""


class LandmarkModel(Protocol):
    def predict_poses(self, segmented_mesh: object) -> list[dict]:
        """Return tooth centers, orientations, and confidence values."""


@dataclass
class ReconstructionModelStack:
    """PointNet++/MeshSegNet segmentation plus graph-based pose refinement."""

    segmenter: ToothSegmentationModel
    landmark_model: LandmarkModel
    graph_refiner: object | None = None

    def extract_treatment_input(self, vertices: object, faces: object, bite: dict) -> dict:
        segmented = self.segmenter.segment(vertices, faces)
        poses = self.landmark_model.predict_poses(segmented)
        if self.graph_refiner is not None:
            poses = self.graph_refiner.refine(poses)
        return {
            "source": "reconstructed_mesh",
            "teeth": poses,
            "bite": bite,
        }


try:
    import torch
    from torch import nn
except ImportError:  # The rule engine and API remain usable without ML weights.
    torch = None
    nn = None


if nn is not None:
    class ToothGraphRefiner(nn.Module):
        """Small message-passing head for arch-context pose correction.

        Node features are expected to contain position, orientation, crown
        dimensions, segmentation confidence, and local occlusal descriptors.
        """

        def __init__(self, feature_dim: int = 16, hidden_dim: int = 64, output_dim: int = 7):
            super().__init__()
            self.message = nn.Sequential(
                nn.Linear(feature_dim * 2, hidden_dim),
                nn.ReLU(),
                nn.Linear(hidden_dim, hidden_dim),
            )
            self.output = nn.Sequential(
                nn.Linear(feature_dim + hidden_dim, hidden_dim),
                nn.ReLU(),
                nn.Linear(hidden_dim, output_dim),
            )

        def forward(self, nodes: object, adjacency: object) -> object:
            neighbor_sum = adjacency @ nodes
            degree = adjacency.sum(dim=-1, keepdim=True).clamp_min(1)
            neighbor_mean = neighbor_sum / degree
            messages = self.message(torch.cat([nodes, neighbor_mean], dim=-1))
            return self.output(torch.cat([nodes, messages], dim=-1))
