"""MeshSegNetSegmenter — inference wrapper implementing the Segmenter protocol."""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import torch

from ..interface import DentalMesh, SegmentationResult, ToothSegment
from .dataset import _build_knn
from .model import MeshSegNet
from .prepare_data import (
    LOWER_CLS_TO_FDI,
    NUM_CLASSES,
    UPPER_CLS_TO_FDI,
    compute_features,
)

IN_FEATURES = 9
K_NEIGHBOURS = 6


class MeshSegNetSegmenter:
    MODEL_ID = "meshsegnet-v1"

    def __init__(self, weights_path: str | Path) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        ckpt = torch.load(weights_path, map_location=self.device, weights_only=True)

        self.model = MeshSegNet(
            in_features=ckpt.get("in_features", IN_FEATURES),
            num_classes=ckpt.get("num_classes", NUM_CLASSES),
            k=ckpt.get("k", K_NEIGHBOURS),
        ).to(self.device)
        self.model.load_state_dict(ckpt["state_dict"])
        self.model.eval()

        self.k = ckpt.get("k", K_NEIGHBOURS)
        self.arch_from_ckpt: str = ckpt.get("arch", "upper")

    def segment(self, mesh: DentalMesh) -> SegmentationResult:
        t0 = time.monotonic()
        import trimesh as tm

        M = len(mesh.faces)
        if M == 0:
            return SegmentationResult([], np.zeros(0, dtype=bool), self.MODEL_ID, 0.0)

        # Build trimesh for feature extraction
        tri = tm.Trimesh(
            vertices=mesh.vertices,
            faces=mesh.faces,
            process=False,
        )

        features_np = compute_features(tri)              # (F, 9)
        knn_np      = _build_knn(features_np[:, :3], self.k).astype(np.int64)

        features_t = torch.from_numpy(features_np).to(self.device)
        knn_t      = torch.from_numpy(knn_np).to(self.device)

        with torch.no_grad():
            logits = self.model(features_t, knn_t)       # (F, num_classes)

        probs  = torch.softmax(logits, dim=-1).cpu().numpy()  # (F, num_classes)
        cls_labels = probs.argmax(axis=-1)                    # (F,)

        cls_to_fdi = (
            UPPER_CLS_TO_FDI if mesh.arch == "upper" else LOWER_CLS_TO_FDI
        )

        gingiva_mask = cls_labels == 0                        # (F,) bool

        # Build per-tooth segments
        segments: list[ToothSegment] = []
        all_centroids = (
            mesh.vertices[mesh.faces[:, 0]]
            + mesh.vertices[mesh.faces[:, 1]]
            + mesh.vertices[mesh.faces[:, 2]]
        ) / 3.0

        for cls_idx in range(1, NUM_CLASSES):
            fdi = int(cls_to_fdi[cls_idx])
            if fdi == 0:
                continue

            face_mask = cls_labels == cls_idx
            if not face_mask.any():
                continue

            tooth_probs    = probs[face_mask, cls_idx]
            confidence     = float(tooth_probs.mean())

            centroid = all_centroids[face_mask].mean(axis=0).astype(np.float32)

            # Long axis via PCA on face centroids
            pts = all_centroids[face_mask]
            centered = pts - pts.mean(axis=0)
            if len(centered) >= 2:
                _, _, vh = np.linalg.svd(centered, full_matrices=False)
                long_axis = vh[0].astype(np.float32)
            else:
                long_axis = np.array([0.0, 1.0, 0.0], dtype=np.float32)

            segments.append(ToothSegment(
                fdi=fdi,
                face_mask=face_mask,
                confidence=confidence,
                centroid=centroid,
                long_axis=long_axis,
            ))

        segments.sort(key=lambda s: s.fdi)
        duration_ms = (time.monotonic() - t0) * 1000.0

        return SegmentationResult(
            segments=segments,
            gingiva_mask=gingiva_mask,
            model=self.MODEL_ID,
            duration_ms=duration_ms,
        )
