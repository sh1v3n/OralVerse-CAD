"""HeuristicSegmenter — Python port of frontend/lib/meshSegmenter.ts.

Algorithm:
  1. Extract per-face centroids from vertices + faces arrays.
  2. Compute adaptive gingiva Y-threshold from histogram valley between two peaks.
     Falls back to fixed 35% if histogram is unimodal.
  3. Split faces into gingiva / crown by Y-threshold.
  4. Cluster crown faces using an 8×8 XZ grid + flood-fill connected components.
     Falls back to K-means (k=14) when fewer than 4 components result.
     Merges clusters smaller than 2% of total crown faces into their nearest neighbour.
  5. Assign FDI labels by greedy nearest-match in normalised X space.
  6. Compute per-tooth confidence from cluster size, X-position match, and cluster count.
  7. Estimate tooth long axis via PCA on face centroids.
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np

from .interface import DentalMesh, SegmentationResult, ToothSegment

# ── Ideal FDI X-positions (from TOOTH_LAYOUT in frontend/lib/teeth.ts) ────────
# Listed in ascending X order so greedy matching can normalise both sides to [0,1].

_UPPER_FDI_BY_X: list[tuple[int, float]] = [
    (18, -3.35), (17, -3.15), (16, -2.90), (15, -2.55),
    (14, -2.25), (13, -1.85), (12, -1.20), (11, -0.42),
    (21,  0.42), (22,  1.20), (23,  1.85), (24,  2.25),
    (25,  2.55), (26,  2.90), (27,  3.15), (28,  3.35),
]

_LOWER_FDI_BY_X: list[tuple[int, float]] = [
    (48, -2.95), (47, -2.75), (46, -2.55), (45, -2.20),
    (44, -1.90), (43, -1.48), (42, -0.78), (41, -0.26),
    (31,  0.26), (32,  0.78), (33,  1.48), (34,  1.90),
    (35,  2.20), (36,  2.55), (37,  2.75), (38,  2.95),
]

_GRID_SIZE = 20          # finer grid for mm-scale STL data
_KMEANS_K = 16           # max teeth per arch in FDI system
_KMEANS_ITER = 25        # more iterations → better convergence
_MIN_CLUSTER_FRAC = 0.01 # was 0.02 — less aggressive merging
_MAX_GINGIVA_FRAC = 0.50 # never let gingiva exceed 50% of all faces


class HeuristicSegmenter:
    MODEL_ID = "heuristic-v1"

    def segment(self, mesh: DentalMesh) -> SegmentationResult:
        t0 = time.monotonic()

        verts = np.asarray(mesh.vertices, dtype=np.float32)
        faces = np.asarray(mesh.faces, dtype=np.int32)
        M = len(faces)

        if M == 0:
            return SegmentationResult([], np.zeros(0, dtype=bool), self.MODEL_ID, 0.0)

        # Per-face centroids
        v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
        centroids = (v0 + v1 + v2) / 3.0  # (M, 3)

        # Adaptive gingiva threshold on Y
        gingiva_threshold = adaptive_gingiva_threshold(centroids[:, 1], mesh.arch)

        if mesh.arch == "upper":
            gingiva_mask = centroids[:, 1] > gingiva_threshold
        else:
            gingiva_mask = centroids[:, 1] < gingiva_threshold

        crown_indices = np.where(~gingiva_mask)[0]
        crown_centroids = centroids[crown_indices]

        # Cluster crown faces
        local_clusters = spatial_cluster(crown_centroids, mesh.arch)

        # Map local (crown-space) indices → global face indices
        global_clusters = [crown_indices[c] for c in local_clusters]

        segments = assign_fdi_labels(global_clusters, centroids, gingiva_mask, M, mesh.arch)

        duration_ms = (time.monotonic() - t0) * 1000.0
        return SegmentationResult(
            segments=segments,
            gingiva_mask=gingiva_mask,
            model=self.MODEL_ID,
            duration_ms=duration_ms,
        )


# ── Adaptive gingiva threshold ─────────────────────────────────────────────────

def adaptive_gingiva_threshold(y_centroids: np.ndarray, arch: str) -> float:
    """Return the Y value separating crown faces from gingiva faces.

    Algorithm:
    1. Try histogram valley detection between two peaks (bimodal case).
    2. Fall back to a fixed 35% from the gingival side if histogram is unimodal.
    3. Always clamp so gingiva never exceeds _MAX_GINGIVA_FRAC of total faces —
       this prevents the palate (large flat area) from swallowing the upper arch.
    """
    y_min = float(y_centroids.min())
    y_max = float(y_centroids.max())
    y_range = y_max - y_min

    if y_range < 1e-6:
        return y_max if arch == "upper" else y_min

    # ── Valley detection ───────────────────────────────────────────────────────
    n_bins = 50
    hist, bin_edges = np.histogram(y_centroids, bins=n_bins)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2.0
    smoothed = _gaussian_smooth(hist.astype(float), sigma=2.0)

    peaks = [
        i for i in range(1, len(smoothed) - 1)
        if smoothed[i] > smoothed[i - 1] and smoothed[i] > smoothed[i + 1]
    ]

    threshold: float
    if len(peaks) >= 2:
        peaks_sorted = sorted(peaks, key=lambda i: smoothed[i], reverse=True)
        lo_peak = min(peaks_sorted[0], peaks_sorted[1])
        hi_peak = max(peaks_sorted[0], peaks_sorted[1])
        valley_offset = int(np.argmin(smoothed[lo_peak : hi_peak + 1]))
        threshold = float(bin_centers[lo_peak + valley_offset])
    else:
        # Unimodal fallback: 35% from the gingival side
        threshold = float(y_max - y_range * 0.35) if arch == "upper" else float(y_min + y_range * 0.35)

    # ── Cap gingiva fraction ───────────────────────────────────────────────────
    # If the threshold would classify > _MAX_GINGIVA_FRAC of faces as gingiva,
    # pull it toward the gingival extreme until gingiva fraction == _MAX_GINGIVA_FRAC.
    # This prevents the hard palate (upper arch) from dominating as gingiva.
    if arch == "upper":
        frac = float((y_centroids > threshold).mean())
        if frac > _MAX_GINGIVA_FRAC:
            threshold = float(np.percentile(y_centroids, (1.0 - _MAX_GINGIVA_FRAC) * 100.0))
    else:
        frac = float((y_centroids < threshold).mean())
        if frac > _MAX_GINGIVA_FRAC:
            threshold = float(np.percentile(y_centroids, _MAX_GINGIVA_FRAC * 100.0))

    return threshold


def _gaussian_smooth(arr: np.ndarray, sigma: float = 2.0) -> np.ndarray:
    radius = int(3 * sigma)
    xs = np.arange(-radius, radius + 1, dtype=float)
    kernel = np.exp(-0.5 * (xs / sigma) ** 2)
    kernel /= kernel.sum()
    return np.convolve(arr, kernel, mode="same")


# ── Spatial clustering ─────────────────────────────────────────────────────────

def spatial_cluster(crown_centroids: np.ndarray, arch: str) -> list[np.ndarray]:
    """Cluster crown face centroids using an 8×8 XZ grid + flood-fill.

    Returns a list of index arrays into crown_centroids.
    """
    if len(crown_centroids) == 0:
        return []

    x = crown_centroids[:, 0]
    z = crown_centroids[:, 2]

    x_min, x_max = float(x.min()), float(x.max())
    z_min, z_max = float(z.min()), float(z.max())
    x_range = x_max - x_min or 1.0
    z_range = z_max - z_min or 1.0

    cell_w = x_range / _GRID_SIZE
    cell_h = z_range / _GRID_SIZE

    gx = np.minimum(_GRID_SIZE - 1, ((x - x_min) / cell_w).astype(int))
    gz = np.minimum(_GRID_SIZE - 1, ((z - z_min) / cell_h).astype(int))

    # Build grid: (gx, gz) → list of local face indices
    grid: dict[tuple[int, int], list[int]] = {}
    for i, (igx, igz) in enumerate(zip(gx.tolist(), gz.tolist())):
        key = (igx, igz)
        grid.setdefault(key, []).append(i)

    # Flood-fill connected components
    visited: set[tuple[int, int]] = set()
    clusters_raw: list[list[int]] = []

    for start_key in grid:
        if start_key in visited:
            continue
        component: list[int] = []
        stack = [start_key]
        while stack:
            key = stack.pop()
            if key in visited or key not in grid:
                continue
            visited.add(key)
            component.extend(grid[key])
            igx, igz = key
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nk = (igx + dx, igz + dz)
                if 0 <= nk[0] < _GRID_SIZE and 0 <= nk[1] < _GRID_SIZE:
                    stack.append(nk)
        if component:
            clusters_raw.append(component)

    # K-means fallback: grid flood-fill can't separate adjacent teeth in clinical
    # mm-scale STL data (contact gaps < one grid cell).  Use k-means whenever
    # the grid produces fewer than 8 clusters so most real scans get k-means.
    if len(clusters_raw) < 8 and len(crown_centroids) > 100:
        return kmeans_split(crown_centroids, k=_KMEANS_K)

    clusters = [np.array(c, dtype=np.int64) for c in clusters_raw]
    return merge_small_clusters(clusters, crown_centroids, len(crown_centroids))


def kmeans_split(centroids: np.ndarray, k: int) -> list[np.ndarray]:
    """K-means split with arch-curve initialisation.

    Seeds are distributed along the best-fit quadratic curve through the XZ
    projection of the centroid cloud.  This matches the anatomical dental arch
    shape so each seed corresponds roughly to one expected tooth position.
    Linear X-seeding (old approach) poorly covers posterior teeth which curve
    back in Z.
    """
    seeds = _arch_curve_seeds(centroids, k)

    centroids_f = centroids.astype(np.float64)
    assignments = np.zeros(len(centroids_f), dtype=np.int32)

    for _ in range(_KMEANS_ITER):
        dists_sq = np.sum(
            (centroids_f[:, None, :] - seeds[None, :, :]) ** 2, axis=2
        )
        assignments = dists_sq.argmin(axis=1).astype(np.int32)
        for s in range(k):
            mask = assignments == s
            if mask.any():
                seeds[s] = centroids_f[mask].mean(axis=0)

    clusters = []
    for s in range(k):
        idx = np.where(assignments == s)[0]
        if len(idx) > 0:
            clusters.append(idx.astype(np.int64))
    return clusters


def _arch_curve_seeds(centroids: np.ndarray, k: int) -> np.ndarray:
    """Return k seed points evenly distributed along the fitted dental arch curve.

    Fits a parabola z = a·x² + b·x + c to the XZ projection of the centroid
    cloud, then samples k points at equal X intervals and snaps each to the
    nearest actual centroid so seeds start on real data.
    """
    x = centroids[:, 0].astype(np.float64)
    z = centroids[:, 2].astype(np.float64)
    y_med = float(np.median(centroids[:, 1]))

    x_min, x_max = float(x.min()), float(x.max())

    # Fit parabola z = a*x^2 + b*x + c
    try:
        coeffs = np.polyfit(x, z, 2)
    except np.linalg.LinAlgError:
        coeffs = np.array([0.0, 0.0, float(z.mean())])

    x_seeds = np.linspace(x_min, x_max, k)
    z_seeds = np.polyval(coeffs, x_seeds)

    # Snap each seed to the nearest actual centroid
    seeds = np.empty((k, 3), dtype=np.float64)
    for i in range(k):
        candidate = np.array([x_seeds[i], y_med, z_seeds[i]])
        dists = np.sum((centroids.astype(np.float64) - candidate) ** 2, axis=1)
        nearest = int(np.argmin(dists))
        seeds[i] = centroids[nearest]

    return seeds


def merge_small_clusters(
    clusters: list[np.ndarray],
    all_centroids: np.ndarray,
    total: int,
) -> list[np.ndarray]:
    """Merge clusters smaller than 2% of total into their nearest neighbour."""
    min_size = max(5, int(total * _MIN_CLUSTER_FRAC))
    result = list(clusters)

    changed = True
    while changed:
        changed = False
        for i in range(len(result) - 1, -1, -1):
            if len(result[i]) >= min_size or len(result) <= 1:
                continue
            ci = all_centroids[result[i]].mean(axis=0)
            best_dist = float("inf")
            best_j = -1
            for j, c in enumerate(result):
                if j == i:
                    continue
                d = float(np.sum((ci - all_centroids[c].mean(axis=0)) ** 2))
                if d < best_dist:
                    best_dist = d
                    best_j = j
            if best_j >= 0:
                result[best_j] = np.concatenate([result[best_j], result[i]])
                result.pop(i)
                changed = True

    return result


# ── FDI assignment ─────────────────────────────────────────────────────────────

def assign_fdi_labels(
    clusters: list[np.ndarray],
    all_centroids: np.ndarray,  # (M, 3)
    gingiva_mask: np.ndarray,   # (M,) bool
    M: int,
    arch: str,
) -> list[ToothSegment]:
    if not clusters:
        return []

    fdi_by_x = _UPPER_FDI_BY_X if arch == "upper" else _LOWER_FDI_BY_X
    ideal_fdis = [fdi for fdi, _ in fdi_by_x]
    ideal_xs = np.array([x for _, x in fdi_by_x], dtype=np.float64)

    # Cluster centroids
    cluster_centroids = np.array(
        [all_centroids[c].mean(axis=0) for c in clusters], dtype=np.float64
    )
    cluster_xs = cluster_centroids[:, 0]

    # Normalise to [0, 1] for scale-independent distance comparison
    def _norm(arr: np.ndarray) -> np.ndarray:
        lo, hi = arr.min(), arr.max()
        span = hi - lo or 1.0
        return (arr - lo) / span

    c_xs_norm = _norm(cluster_xs)
    i_xs_norm = _norm(ideal_xs)

    # Process clusters in X order; greedy nearest-normalised-X match
    sorted_ci = list(np.argsort(cluster_xs))
    used: set[int] = set()
    total_crown = sum(len(c) for c in clusters)

    segments: list[ToothSegment] = []
    for rank, ci in enumerate(sorted_ci):
        cx_norm = float(c_xs_norm[ci])

        best_dist = float("inf")
        best_fi = -1
        for fi, ix_norm in enumerate(i_xs_norm):
            if fi in used:
                continue
            d = abs(cx_norm - ix_norm)
            if d < best_dist:
                best_dist = d
                best_fi = fi

        if best_fi >= 0:
            fdi = ideal_fdis[best_fi]
            x_dist_norm = best_dist
            used.add(best_fi)
        else:
            fdi = (11 if arch == "upper" else 31) + rank
            x_dist_norm = 0.5

        face_mask = np.zeros(M, dtype=bool)
        face_mask[clusters[ci]] = True

        centroid = all_centroids[clusters[ci]].mean(axis=0).astype(np.float32)
        long_axis = _estimate_long_axis(all_centroids[clusters[ci]])

        confidence = _compute_confidence(
            cluster_size=len(clusters[ci]),
            total_crown_faces=total_crown,
            x_dist_norm=x_dist_norm,
            n_clusters=len(clusters),
            n_ideals=len(ideal_fdis),
        )

        segments.append(ToothSegment(
            fdi=fdi,
            face_mask=face_mask,
            confidence=confidence,
            centroid=centroid,
            long_axis=long_axis,
        ))

    segments.sort(key=lambda s: s.fdi)
    return segments


# ── Confidence scoring ─────────────────────────────────────────────────────────

def _compute_confidence(
    cluster_size: int,
    total_crown_faces: int,
    x_dist_norm: float,
    n_clusters: int,
    n_ideals: int,
) -> float:
    # How close to the expected per-tooth face count
    expected = total_crown_faces / max(n_ideals, 1)
    size_ratio = cluster_size / max(expected, 1.0)
    size_score = 1.0 - min(abs(size_ratio - 1.0), 1.0)

    # How close in normalised X to the ideal FDI position
    pos_score = max(0.0, 1.0 - x_dist_norm * 5.0)

    # Penalty when the wrong number of clusters was found
    count_ratio = n_clusters / max(n_ideals, 1)
    count_score = 1.0 - min(abs(count_ratio - 1.0), 1.0)

    confidence = 0.30 + 0.35 * size_score + 0.25 * pos_score + 0.10 * count_score
    return float(np.clip(confidence, 0.0, 1.0))


# ── Long-axis estimation ───────────────────────────────────────────────────────

def _estimate_long_axis(pts: np.ndarray) -> np.ndarray:
    """First principal component of the face centroid cloud."""
    if len(pts) < 2:
        return np.array([0.0, 1.0, 0.0], dtype=np.float32)
    centered = pts - pts.mean(axis=0)
    _, _, vh = np.linalg.svd(centered, full_matrices=False)
    return vh[0].astype(np.float32)
