"""Preprocess 3DTeethSeg22 dataset into .npz files for MeshSegNet training.

Usage
-----
    python -m ai.orthodontics.segmentation.meshsegnet.preprocess \\
        --data_dir /path/to/3DTeethSeg22 \\
        --out_dir   ai/orthodontics/segmentation/meshsegnet/data

Dataset layout (the challenge zip extracts like this):
    <data_dir>/
        <case_id>/
            <case_id>_upper.obj   (or lower)
            <case_id>_upper.json
    — OR —
    <data_dir>/
        upper/<case_id>.obj  +  <case_id>.json
        lower/...

Both layouts are handled automatically.

Output per scan: <out_dir>/<arch>/<case_id>.npz containing
    features  (F, 9)  float32  — centroid(3) + normal(3) + curvature(3)
    labels    (F,)    int16    — class index 0-16 (0=gingiva, 1-16=teeth)
    fdi_map   (17,)   int16    — class_index -> FDI number (0 for gingiva)
    arch      str              — "upper" | "lower"

A splits.json is also written to <out_dir>/ with train/val/test file lists.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np

try:
    from tqdm import tqdm
except ImportError:
    def tqdm(x, **kw):  # type: ignore[misc]
        return x


# ── Lazy trimesh import ────────────────────────────────────────────────────────

def _require_trimesh():
    try:
        import trimesh
        return trimesh
    except ImportError:
        sys.exit(
            "trimesh is required for preprocessing.\n"
            "Install with:  pip install -r requirements.txt"
        )


# ── FDI -> class index mappings ────────────────────────────────────────────────
# Upper arch: gingiva=0, Q1 teeth 11-18 -> 1-8, Q2 teeth 21-28 -> 9-16
# Lower arch: gingiva=0, Q4 teeth 41-48 -> 1-8, Q3 teeth 31-38 -> 9-16

def _build_fdi_maps() -> tuple[dict[int, int], dict[int, int], np.ndarray, np.ndarray]:
    upper_fdi_to_cls: dict[int, int] = {0: 0}
    upper_cls_to_fdi = np.zeros(17, dtype=np.int16)
    for i, fdi in enumerate(range(11, 19), start=1):
        upper_fdi_to_cls[fdi] = i
        upper_cls_to_fdi[i] = fdi
    for i, fdi in enumerate(range(21, 29), start=9):
        upper_fdi_to_cls[fdi] = i
        upper_cls_to_fdi[i] = fdi

    lower_fdi_to_cls: dict[int, int] = {0: 0}
    lower_cls_to_fdi = np.zeros(17, dtype=np.int16)
    for i, fdi in enumerate(range(41, 49), start=1):
        lower_fdi_to_cls[fdi] = i
        lower_cls_to_fdi[i] = fdi
    for i, fdi in enumerate(range(31, 39), start=9):
        lower_fdi_to_cls[fdi] = i
        lower_cls_to_fdi[i] = fdi

    return upper_fdi_to_cls, lower_fdi_to_cls, upper_cls_to_fdi, lower_cls_to_fdi


UPPER_FDI_TO_CLS, LOWER_FDI_TO_CLS, UPPER_CLS_TO_FDI, LOWER_CLS_TO_FDI = _build_fdi_maps()

NUM_CLASSES = 17  # 0=gingiva + 16 teeth per arch


# ── Feature extraction ─────────────────────────────────────────────────────────

def compute_features(mesh) -> np.ndarray:
    """Return (F, 9) float32 feature matrix for an already-loaded trimesh.

    Features (per face):
      0-2  centroid (X, Y, Z) — normalised to [-1, 1]
      3-5  unit face normal (Nx, Ny, Nz)
      6    log face area (normalised)
      7-8  estimated principal curvatures kappa1, kappa2
    """
    F = len(mesh.faces)

    centroids = mesh.triangles_center.astype(np.float32)
    c_min = centroids.min(axis=0)
    c_max = centroids.max(axis=0)
    span = (c_max - c_min).max()
    if span < 1e-8:
        span = 1.0
    center = (c_min + c_max) / 2.0
    centroids_norm = ((centroids - center) / span * 2.0).astype(np.float32)

    normals = mesh.face_normals.astype(np.float32)

    areas = mesh.area_faces.astype(np.float32)
    log_area = np.log(areas + 1e-10).reshape(-1, 1)
    log_area = (log_area - log_area.mean()) / (log_area.std() + 1e-8)

    kappas = _face_curvatures(mesh)  # (F, 2)

    features = np.concatenate([centroids_norm, normals, log_area, kappas], axis=1)
    assert features.shape == (F, 9), features.shape
    return features.astype(np.float32)


def _face_curvatures(mesh) -> np.ndarray:
    """Estimate two principal curvatures per face (fully vectorized, no Python loops).

    Uses cotangent Laplacian for mean curvature H and angle-deficit for Gaussian
    curvature K, then kappa1/2 = H ± sqrt(max(H²-K, 0)).
    """
    V = len(mesh.vertices)
    verts = mesh.vertices.astype(np.float64)
    faces = mesh.faces

    v0 = verts[faces[:, 0]]
    v1 = verts[faces[:, 1]]
    v2 = verts[faces[:, 2]]

    e01 = v1 - v0
    e12 = v2 - v1
    e20 = v0 - v2

    face_areas = np.linalg.norm(np.cross(e01, -e20), axis=1) / 2.0
    third_area = face_areas / 3.0

    def _safe_angle(a, b):
        cos_t = np.clip(
            (a * b).sum(axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-12),
            -1.0, 1.0,
        )
        return np.arccos(cos_t)

    ang0 = _safe_angle(e01, -e20)
    ang1 = _safe_angle(e12, -e01)
    ang2 = _safe_angle(e20, -e12)

    # bincount is C-level O(n) — replaces np.add.at for large meshes
    mixed_area = (
        np.bincount(faces[:, 0], weights=third_area, minlength=V)
        + np.bincount(faces[:, 1], weights=third_area, minlength=V)
        + np.bincount(faces[:, 2], weights=third_area, minlength=V)
    )
    angle_defect = np.full(V, 2.0 * np.pi, dtype=np.float64)
    angle_defect -= np.bincount(faces[:, 0], weights=ang0, minlength=V)
    angle_defect -= np.bincount(faces[:, 1], weights=ang1, minlength=V)
    angle_defect -= np.bincount(faces[:, 2], weights=ang2, minlength=V)

    K_vert = np.zeros(V, dtype=np.float64)
    safe = mixed_area > 1e-12
    K_vert[safe] = angle_defect[safe] / mixed_area[safe]

    # Cotangent Laplacian — vectorized over all faces, 3 permutations
    laplacian = np.zeros((V, 3), dtype=np.float64)
    weights   = np.zeros(V, dtype=np.float64)

    for ai, bi, ci in ((0, 1, 2), (1, 2, 0), (2, 0, 1)):
        vi_idx = faces[:, ai]
        vi_pos = verts[vi_idx]
        vj_pos = verts[faces[:, bi]]
        vk_pos = verts[faces[:, ci]]
        ea  = vi_pos - vk_pos
        eb  = vj_pos - vk_pos
        cot = (ea * eb).sum(axis=1) / (np.linalg.norm(np.cross(ea, eb), axis=1) + 1e-12)
        weights += np.bincount(vi_idx, weights=cot, minlength=V)
        contrib  = cot[:, np.newaxis] * (vj_pos - vi_pos)
        for dim in range(3):
            laplacian[:, dim] += np.bincount(vi_idx, weights=contrib[:, dim], minlength=V)

    safe_v = weights > 1e-12
    laplacian[safe_v] /= 2.0 * mixed_area[safe_v, np.newaxis]
    H_vert = np.linalg.norm(laplacian, axis=1) / 2.0

    H_face = (H_vert[faces[:, 0]] + H_vert[faces[:, 1]] + H_vert[faces[:, 2]]) / 3.0
    K_face = (K_vert[faces[:, 0]] + K_vert[faces[:, 1]] + K_vert[faces[:, 2]]) / 3.0

    disc      = np.maximum(H_face**2 - K_face, 0.0)
    sqrt_disc = np.sqrt(disc)
    k1 = np.clip(H_face + sqrt_disc, -50.0, 50.0) / 50.0
    k2 = np.clip(H_face - sqrt_disc, -50.0, 50.0) / 50.0

    return np.stack([k1.astype(np.float32), k2.astype(np.float32)], axis=1)


# ── Label loading ──────────────────────────────────────────────────────────────

def load_labels(json_path: Path) -> np.ndarray:
    """Load per-face FDI labels from the challenge JSON file."""
    with open(json_path) as f:
        raw = json.load(f)

    if isinstance(raw, list):
        return np.array(raw, dtype=np.int16)
    if isinstance(raw, dict):
        for key in ("labels", "label", "seg", "segmentation"):
            if key in raw:
                return np.array(raw[key], dtype=np.int16)
    raise ValueError(f"Cannot parse label format in {json_path}")


def _vertex_to_face_labels(vertex_labels: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Convert per-vertex labels to per-face via majority vote (O(F), no scipy)."""
    v0 = vertex_labels[faces[:, 0]]
    v1 = vertex_labels[faces[:, 1]]
    v2 = vertex_labels[faces[:, 2]]
    face_labels = v0.copy()
    # Where v1 == v2 and they differ from v0, the majority is v1/v2
    mask = (v1 == v2) & (v1 != v0)
    face_labels[mask] = v1[mask]
    return face_labels


def fdi_to_class(fdi_labels: np.ndarray, arch: str) -> np.ndarray:
    """Map FDI integers to class indices 0-16."""
    mapping = UPPER_FDI_TO_CLS if arch == "upper" else LOWER_FDI_TO_CLS
    cls = np.zeros_like(fdi_labels, dtype=np.int16)
    for fdi, idx in mapping.items():
        cls[fdi_labels == fdi] = idx
    return cls


# ── Scan discovery ─────────────────────────────────────────────────────────────

def _detect_arch(path: Path) -> str | None:
    name = path.stem.lower()
    if "upper" in name or "maxillar" in name:
        return "upper"
    if "lower" in name or "mandibular" in name:
        return "lower"
    for part in path.parts:
        if "upper" in part.lower():
            return "upper"
        if "lower" in part.lower():
            return "lower"
    return None


def find_scan_pairs(data_dir: Path) -> list[tuple[Path, Path, str]]:
    """Return list of (obj_path, json_path, arch) tuples."""
    pairs = []
    for obj_path in sorted(data_dir.rglob("*.obj")):
        json_path = obj_path.with_suffix(".json")
        if not json_path.exists():
            continue
        arch = _detect_arch(obj_path)
        if arch is None:
            print(f"  [skip] cannot determine arch for {obj_path.name}")
            continue
        pairs.append((obj_path, json_path, arch))
    return pairs


# ── Processing ─────────────────────────────────────────────────────────────────

def process_scan(
    obj_path: Path,
    json_path: Path,
    arch: str,
    out_dir: Path,
) -> bool:
    """Process one scan -> save .npz.  Returns True on success."""
    out_path = out_dir / arch / (obj_path.stem + ".npz")
    if out_path.exists():
        return True

    try:
        tm = _require_trimesh()
        mesh = tm.load(str(obj_path), force="mesh", process=False)
        if not isinstance(mesh, tm.Trimesh):
            mesh = tm.util.concatenate(mesh.dump())

        fdi_labels = load_labels(json_path)
        n_labels = len(fdi_labels)
        n_faces  = len(mesh.faces)
        n_verts  = len(mesh.vertices)

        if n_labels == n_faces:
            pass  # per-face labels (3DTeethSeg22 format)
        elif n_labels == n_verts:
            # Teeth3DS+ stores per-vertex labels; convert to per-face via majority vote
            fdi_labels = _vertex_to_face_labels(fdi_labels, mesh.faces)
        elif n_labels * 2 == n_faces:
            # Quad mesh triangulated on load; one label per original quad
            fdi_labels = np.repeat(fdi_labels, 2)
        else:
            print(f"  [skip] {obj_path.name}: label count {n_labels} != "
                  f"face count {n_faces} or vertex count {n_verts}")
            return False

        features   = compute_features(mesh)
        cls_labels = fdi_to_class(fdi_labels, arch)
        fdi_map    = UPPER_CLS_TO_FDI if arch == "upper" else LOWER_CLS_TO_FDI

        out_path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            out_path,
            features=features,
            labels=cls_labels,
            fdi_map=fdi_map,
            arch=arch,
        )
        return True

    except Exception as e:
        print(f"  [error] {obj_path.name}: {e}")
        return False


def _process_scan_worker(args: tuple) -> tuple[bool, str, str]:
    """Top-level wrapper so ProcessPoolExecutor can pickle it."""
    obj_path, json_path, arch, out_dir = args
    ok = process_scan(Path(obj_path), Path(json_path), arch, Path(out_dir))
    return ok, arch, Path(obj_path).stem


# ── Splits ─────────────────────────────────────────────────────────────────────

def write_splits(
    processed: list[tuple[str, str]],
    out_dir: Path,
    train_frac: float = 0.80,
    val_frac: float = 0.10,
) -> None:
    rng = np.random.default_rng(42)
    idx = np.arange(len(processed))
    rng.shuffle(idx)

    n_train = int(len(idx) * train_frac)
    n_val   = int(len(idx) * val_frac)

    def _to_paths(subset):
        return [f"{processed[i][0]}/{processed[i][1]}.npz" for i in subset]

    splits = {
        "train": _to_paths(idx[:n_train]),
        "val":   _to_paths(idx[n_train : n_train + n_val]),
        "test":  _to_paths(idx[n_train + n_val :]),
    }
    (out_dir / "splits.json").write_text(json.dumps(splits, indent=2))
    print(f"\nSplits: {len(splits['train'])} train / {len(splits['val'])} val / {len(splits['test'])} test")


def _print_class_stats(out_dir: Path, sample: list[tuple[str, str]]) -> None:
    if not sample:
        return
    counts: dict[int, int] = {}
    for arch, stem in sample[:10]:
        p = out_dir / arch / (stem + ".npz")
        if not p.exists():
            continue
        labels = np.load(p)["labels"]
        for cls in range(NUM_CLASSES):
            counts[cls] = counts.get(cls, 0) + int((labels == cls).sum())
    total = sum(counts.values()) or 1
    print("\nClass distribution (sample of 10 scans):")
    print(f"  class 0 (gingiva): {counts.get(0, 0) / total * 100:.1f}%")
    for cls in range(1, NUM_CLASSES):
        pct = counts.get(cls, 0) / total * 100
        if pct > 0.1:
            print(f"  class {cls:2d}:         {pct:.1f}%")


# ── CLI ────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Preprocess 3DTeethSeg22 OBJ+JSON pairs into .npz files for MeshSegNet."
    )
    parser.add_argument("--data_dir", required=True, type=Path,
                        help="Root of the downloaded 3DTeethSeg22 dataset")
    parser.add_argument("--out_dir",  default=Path(__file__).parent / "data", type=Path,
                        help="Output directory for .npz files (default: ./data)")
    parser.add_argument("--train_frac", default=0.80, type=float)
    parser.add_argument("--val_frac",   default=0.10, type=float)
    parser.add_argument("--workers", default=0, type=int,
                        help="Parallel worker processes (0 = auto = CPU count)")
    args = parser.parse_args()

    _require_trimesh()

    pairs = find_scan_pairs(args.data_dir)
    if not pairs:
        sys.exit(f"No .obj + .json pairs found under {args.data_dir}")

    n_workers = args.workers or os.cpu_count() or 1
    print(f"Found {len(pairs)} scans  |  output -> {args.out_dir}  |  workers: {n_workers}\n")

    ok, fail = 0, 0
    processed: list[tuple[str, str]] = []

    work = [
        (str(obj), str(json_), arch, str(args.out_dir))
        for obj, json_, arch in pairs
    ]

    with ProcessPoolExecutor(max_workers=n_workers) as pool:
        futures = {pool.submit(_process_scan_worker, item): item for item in work}
        for future in tqdm(as_completed(futures), total=len(futures), desc="Processing"):
            success, arch, stem = future.result()
            if success:
                ok += 1
                processed.append((arch, stem))
            else:
                fail += 1

    print(f"\nDone: {ok} ok, {fail} failed")

    if processed:
        write_splits(processed, args.out_dir, args.train_frac, args.val_frac)
        _print_class_stats(args.out_dir, processed)


if __name__ == "__main__":
    main()
