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

        features = npz["features"].astype(np.float32)  # (F, 9)
        labels   = npz["labels"].astype(np.int64)       # (F,)

        # Optional downsampling for very large meshes (memory/speed)
        if self.max_faces and len(features) > self.max_faces:
            sel = np.random.choice(len(features), self.max_faces, replace=False)
            sel.sort()
            features = features[sel]
            labels   = labels[sel]

        # Data augmentation: random rotation around Y axis
        if self.augment:
            features = _augment(features)

        knn_idx = _build_knn(features[:, :3], self.k)  # (F, k) — from centroids

        return {
            "features": torch.from_numpy(features),          # (F, 9)
            "labels":   torch.from_numpy(labels),             # (F,)
            "knn_idx":  torch.from_numpy(knn_idx),            # (F, k)
            "arch":     str(npz["arch"]),
            "stem":     path.stem,
        }


# ── Augmentation ───────────────────────────────────────────────────────────────

def _augment(features: np.ndarray) -> np.ndarray:
    """Apply random Y-axis rotation to centroids and normals."""
    features = features.copy()
    angle = np.random.uniform(0, 2 * np.pi)
    cos_a, sin_a = np.cos(angle), np.sin(angle)
    rot = np.array([[cos_a, 0, sin_a],
                    [0,     1, 0    ],
                    [-sin_a,0, cos_a]], dtype=np.float32)
    features[:, 0:3] = features[:, 0:3] @ rot.T   # rotate centroids
    features[:, 3:6] = features[:, 3:6] @ rot.T   # rotate normals
    return features


# ── kNN index ─────────────────────────────────────────────────────────────────

def _build_knn(centroids: np.ndarray, k: int) -> np.ndarray:
    """Return (F, k) int64 array of k nearest neighbour indices.

    Uses a simple O(F²) approach — fast enough for F ≤ 16k.
    Replace with a KD-tree for larger meshes.
    """
    F = len(centroids)
    # Pairwise squared distances
    diff = centroids[:, None, :] - centroids[None, :, :]  # (F, F, 3)
    dist2 = (diff ** 2).sum(axis=-1)                       # (F, F)
    # argsort, skip self (index 0 is always self)
    sorted_idx = np.argsort(dist2, axis=1)[:, 1 : k + 1]  # (F, k)
    return sorted_idx.astype(np.int64)


# ── Collate ───────────────────────────────────────────────────────────────────

def collate_single(batch: list[dict]) -> dict:
    """Collate a batch of size 1 (meshes differ in face count — no stacking).

    MeshSegNet is trained one mesh at a time because meshes have variable face
    counts.  Use DataLoader with batch_size=1 and this collate_fn.
    """
    assert len(batch) == 1, "Use batch_size=1 for variable-face meshes"
    return batch[0]
