"""PyTorch Dataset for preprocessed 3DTeethSeg22 .npz files."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset


class TeethSegDataset(Dataset):
    """Loads preprocessed .npz scan files produced by prepare_data.py.

    Each item is a dict:
        features  (F, 9)  float32 — centroid + normal + log_area + κ₁ + κ₂
        labels    (F,)    long    — class index 0–16
        knn_idx   (F, K)  long    — K nearest-neighbour face indices (by centroid)
        arch      str
        stem      str             — scan id, useful for debugging

    The kNN index is computed on-the-fly from the centroid features (columns 0–2)
    and cached in-memory after the first access.
    """

    def __init__(
        self,
        root: str | Path,
        split: str = "train",         # "train" | "val" | "test"
        k_neighbours: int = 6,
        max_faces: int | None = 16_000,  # downsample large meshes
        augment: bool = True,
    ) -> None:
        self.root = Path(root)
        self.k = k_neighbours
        self.max_faces = max_faces
        self.augment = augment and split == "train"

        splits_file = self.root / "splits.json"
        if not splits_file.exists():
            raise FileNotFoundError(f"splits.json not found in {self.root}")

        with open(splits_file) as f:
            splits = json.load(f)

        if split not in splits:
            raise ValueError(f"split must be one of {list(splits)}")

        self.files = [self.root / p for p in splits[split]]
        missing = [p for p in self.files if not p.exists()]
        if missing:
            raise FileNotFoundError(f"{len(missing)} files missing, e.g. {missing[0]}")

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, idx: int) -> dict:
        path = self.files[idx]
        npz = np.load(path, allow_pickle=False)

        features = np.nan_to_num(npz["features"].astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)
        labels   = npz["labels"].astype(np.int64)       # (F,)

        # Optional downsampling for very large meshes (memory/speed)
        if self.max_faces and len(features) > self.max_faces:
            sel = np.random.choice(len(features), self.max_faces, replace=False)
            sel.sort()
            features = features[sel]
            labels   = labels[sel]

        # Data augmentation: rotation / mirror-flip / scale / jitter (train only)
        if self.augment:
            features, labels = _augment(features, labels)

        knn_idx = _build_knn(features[:, :3], self.k)  # (F, k) — from centroids

        return {
            "features": torch.from_numpy(features),          # (F, 9)
            "labels":   torch.from_numpy(labels),             # (F,)
            "knn_idx":  torch.from_numpy(knn_idx),            # (F, k)
            "arch":     str(npz["arch"]),
            "stem":     path.stem,
        }


# ── Augmentation ───────────────────────────────────────────────────────────────

# Mirror-flip class remap: a mid-sagittal flip swaps the two quadrants of an
# arch. For both arches the class layout is [0=gingiva, 1..8=one side,
# 9..16=other side], so flipping is exactly the swap i ↔ i+8 for i in 1..8.
_FLIP_LABEL_MAP = np.arange(17, dtype=np.int64)
_FLIP_LABEL_MAP[1:9], _FLIP_LABEL_MAP[9:17] = np.arange(9, 17), np.arange(1, 9)


def _rotation_matrix(rx: float, ry: float, rz: float) -> np.ndarray:
    """Composed XYZ rotation matrix (float32)."""
    cx, sx = np.cos(rx), np.sin(rx)
    cy, sy = np.cos(ry), np.sin(ry)
    cz, sz = np.cos(rz), np.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]], dtype=np.float32)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], dtype=np.float32)
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], dtype=np.float32)
    return (Rz @ Ry @ Rx).astype(np.float32)


def _augment(features: np.ndarray, labels: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Randomly transform a mesh sample to improve generalisation.

    Applies, to feature columns [centroid(0:3), normal(3:6)] only (curvature and
    log-area columns are geometry-invariant and left untouched):
      • mid-sagittal mirror flip (p=0.5) with matching label remap,
      • full random Y rotation + small random X/Z tilt,
      • isotropic scale of the centroids,
      • small Gaussian jitter on the centroids.

    Returns (features, labels) — labels change only on flip.
    """
    features = features.copy()
    labels = labels.copy()

    # Mid-sagittal mirror flip: negate X of centroid & normal, swap quadrants.
    if np.random.rand() < 0.5:
        features[:, 0] = -features[:, 0]   # centroid_x
        features[:, 3] = -features[:, 3]   # normal_x
        labels = _FLIP_LABEL_MAP[labels]

    # Random rotation: full turn about Y (arch is roughly symmetric about it)
    # plus a small tilt about X and Z.
    rot = _rotation_matrix(
        rx=np.random.uniform(-0.2, 0.2),
        ry=np.random.uniform(0, 2 * np.pi),
        rz=np.random.uniform(-0.2, 0.2),
    )
    features[:, 0:3] = features[:, 0:3] @ rot.T   # rotate centroids
    features[:, 3:6] = features[:, 3:6] @ rot.T   # rotate normals

    # Isotropic scale of positions (normals stay unit length).
    features[:, 0:3] *= np.float32(np.random.uniform(0.85, 1.15))

    # Small positional jitter (normalised units).
    features[:, 0:3] += np.random.normal(0, 0.01, features[:, 0:3].shape).astype(np.float32)

    return features, labels


# ── kNN index ─────────────────────────────────────────────────────────────────

def _build_knn(centroids: np.ndarray, k: int) -> np.ndarray:
    """Return (F, k) int64 array of k nearest neighbour indices via KDTree.

    O(F log F) — replaces the O(F²) pairwise distance approach which
    allocated a (F, F, 3) array and was the training bottleneck.
    When F < k+1, neighbors are tiled from whatever points exist.
    """
    from scipy.spatial import KDTree
    F = len(centroids)
    k_eff = min(k, F - 1) if F > 1 else 0
    if k_eff == 0:
        return np.zeros((F, k), dtype=np.int64)
    _, idx = KDTree(centroids).query(centroids, k=k_eff + 1)  # k_eff+1 includes self
    neighbors = idx[:, 1:].astype(np.int64)  # (F, k_eff)
    if k_eff < k:
        # tile columns to reach exactly k
        repeats = (k + k_eff - 1) // k_eff
        neighbors = np.tile(neighbors, repeats)[:, :k]
    return neighbors


# ── Collate ───────────────────────────────────────────────────────────────────

def collate_single(batch: list[dict]) -> dict:
    """Collate a batch of size 1 (meshes differ in face count — no stacking).

    MeshSegNet is trained one mesh at a time because meshes have variable face
    counts.  Use DataLoader with batch_size=1 and this collate_fn.
    """
    assert len(batch) == 1, "Use batch_size=1 for variable-face meshes"
    return batch[0]
