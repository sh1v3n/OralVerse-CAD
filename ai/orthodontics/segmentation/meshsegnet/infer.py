"""MeshSegNetSegmenter — production inference wrapper.

Implements the Segmenter protocol.  Heavy imports (torch, trimesh) are
deferred to first instantiation so the module can be imported without GPU
dependencies installed.
"""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np

from ..interface import DentalMesh, SegmentationResult, ToothSegment

# torch / model imports are deferred to __init__ so that
# "import infer" never fails due to missing torch.
_torch = None
_MeshSegNet = None
_build_knn = None
_compute_features = None
_UPPER_CLS_TO_FDI = None
_LOWER_CLS_TO_FDI = None
_NUM_CLASSES = None


def _load_deps() -> None:
    global _torch, _MeshSegNet, _build_knn, _compute_features
    global _UPPER_CLS_TO_FDI, _LOWER_CLS_TO_FDI, _NUM_CLASSES

    if _torch is not None:
        return  # already loaded

    try:
        import torch as _t
    except ImportError:
        raise ImportError(
            "PyTorch is required for MeshSegNetSegmenter.\n"
            "Install with:  pip install -r requirements.txt"
        )

    try:
        import trimesh  # noqa: F401 — imported here to trigger friendly error early
    except ImportError:
        raise ImportError(
            "trimesh is required for MeshSegNetSegmenter.\n"
            "Install with:  pip install -r requirements.txt"
        )

    from .model import MeshSegNet
    from .dataset import _build_knn as _bknn
    from .preprocess import (
        UPPER_CLS_TO_FDI,
        LOWER_CLS_TO_FDI,
        NUM_CLASSES,
        compute_features,
    )

    _torch              = _t
    _MeshSegNet         = MeshSegNet
    _build_knn          = _bknn
    _compute_features   = compute_features
    _UPPER_CLS_TO_FDI   = UPPER_CLS_TO_FDI
    _LOWER_CLS_TO_FDI   = LOWER_CLS_TO_FDI
    _NUM_CLASSES        = NUM_CLASSES


IN_FEATURES  = 9
K_NEIGHBOURS = 6


def _filter_components(cls_labels: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Keep only the largest connected component per tooth class.

    Isolated face patches that don't connect to the main tooth body are
    relabeled as gingiva (0), cleaning up fragmented segmentation output.
    """
    from scipy.sparse import csr_matrix
    from scipy.sparse.csgraph import connected_components

    F = len(faces)
    result = cls_labels.copy()

    # Build face adjacency: faces sharing an edge are neighbors.
    v0, v1, v2 = faces[:, 0], faces[:, 1], faces[:, 2]
    face_ids = np.arange(F)

    all_edges = np.concatenate([
        np.stack([np.minimum(v0, v1), np.maximum(v0, v1), face_ids], axis=1),
        np.stack([np.minimum(v1, v2), np.maximum(v1, v2), face_ids], axis=1),
        np.stack([np.minimum(v2, v0), np.maximum(v2, v0), face_ids], axis=1),
    ], axis=0)  # (3F, 3)

    order = np.lexsort((all_edges[:, 1], all_edges[:, 0]))
    s = all_edges[order]

    same = (s[:-1, 0] == s[1:, 0]) & (s[:-1, 1] == s[1:, 1])
    idx = np.where(same)[0]
    fi = s[idx, 2].astype(np.int32)
    fj = s[idx + 1, 2].astype(np.int32)

    adj = csr_matrix(
        (np.ones(len(fi) * 2, dtype=np.float32), (np.r_[fi, fj], np.r_[fj, fi])),
        shape=(F, F),
    )

    for cls in np.unique(cls_labels):
        if cls == 0:
            continue
        face_idx = np.where(cls_labels == cls)[0]
        if len(face_idx) < 2:
            result[face_idx] = 0
            continue

        sub = adj[face_idx][:, face_idx]
        n_comp, comp_labels = connected_components(sub, directed=False)
        if n_comp <= 1:
            continue

        sizes = np.bincount(comp_labels, minlength=n_comp)
        largest = sizes.argmax()
        for c in range(n_comp):
            if c != largest:
                result[face_idx[comp_labels == c]] = 0

    return result


class MeshSegNetSegmenter:
    MODEL_ID = "meshsegnet-v1"

    def __init__(self, weights_path: str | Path) -> None:
        """Accept either a single .pt file or a directory containing
        meshsegnet_upper_best.pt / meshsegnet_lower_best.pt."""
        _load_deps()

        torch = _torch
        if torch.cuda.is_available():
            self.device = torch.device("cuda")
        elif torch.backends.mps.is_available():
            self.device = torch.device("mps")
        else:
            self.device = torch.device("cpu")

        path = Path(weights_path)
        self._models: dict[str, object] = {}
        self._k:      dict[str, int]    = {}

        if path.is_dir():
            for arch in ("upper", "lower"):
                candidate = path / f"meshsegnet_{arch}_best.pt"
                if candidate.exists():
                    model, k = self._load_ckpt(candidate)
                    self._models[arch] = model
                    self._k[arch]      = k
        else:
            model, k = self._load_ckpt(path)
            ckpt = torch.load(path, map_location=self.device, weights_only=True)
            arch = ckpt.get("arch", "upper")
            self._models[arch] = model
            self._k[arch]      = k

        if not self._models:
            raise FileNotFoundError(f"No valid checkpoint found at {weights_path}")

    def _load_ckpt(self, path: Path) -> tuple:
        torch = _torch
        ckpt  = torch.load(path, map_location=self.device, weights_only=True)
        model = _MeshSegNet(
            in_features=ckpt.get("in_features", IN_FEATURES),
            num_classes=ckpt.get("num_classes", _NUM_CLASSES),
            k=ckpt.get("k", K_NEIGHBOURS),
        ).to(self.device)
        model.load_state_dict(ckpt["state_dict"])
        model.eval()
        return model, ckpt.get("k", K_NEIGHBOURS)

    def segment(self, mesh: DentalMesh) -> SegmentationResult:
        t0 = time.monotonic()

        import trimesh as tm

        M = len(mesh.faces)
        if M == 0:
            return SegmentationResult([], np.zeros(0, dtype=bool), self.MODEL_ID, 0.0)

        arch  = getattr(mesh, "arch", "upper")
        model = self._models.get(arch) or next(iter(self._models.values()))
        k     = self._k.get(arch)     or next(iter(self._k.values()))

        tri = tm.Trimesh(
            vertices=mesh.vertices,
            faces=mesh.faces,
            process=False,
        )

        features_np = np.nan_to_num(_compute_features(tri), nan=0.0, posinf=0.0, neginf=0.0)
        knn_np      = _build_knn(features_np[:, :3], k).astype(np.int64)

        torch = _torch
        features_t = torch.from_numpy(features_np).to(self.device)
        knn_t      = torch.from_numpy(knn_np).to(self.device)

        with torch.no_grad():
            logits = model(features_t, knn_t)

        probs      = torch.softmax(logits, dim=-1).cpu().numpy()
        cls_labels = probs.argmax(axis=-1)
        cls_labels = _filter_components(cls_labels, mesh.faces)

        cls_to_fdi  = _UPPER_CLS_TO_FDI if arch == "upper" else _LOWER_CLS_TO_FDI
        gingiva_mask = cls_labels == 0

        all_centroids = (
            mesh.vertices[mesh.faces[:, 0]]
            + mesh.vertices[mesh.faces[:, 1]]
            + mesh.vertices[mesh.faces[:, 2]]
        ) / 3.0

        segments: list[ToothSegment] = []
        for cls_idx in range(1, _NUM_CLASSES):
            fdi = int(cls_to_fdi[cls_idx])
            if fdi == 0:
                continue

            face_mask = cls_labels == cls_idx
            if not face_mask.any():
                continue

            confidence = float(probs[face_mask, cls_idx].mean())
            centroid   = all_centroids[face_mask].mean(axis=0).astype(np.float32)

            pts      = all_centroids[face_mask]
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
