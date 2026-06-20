"""Unit tests for HeuristicSegmenter.

Coverage:
- adaptive_gingiva_threshold: valley detection, fallback for unimodal distributions
- spatial_cluster / kmeans_split: correct number of clusters, small-cluster merging
- assign_fdi_labels: correct FDI mapping, ordering, confidence > 0
"""

from __future__ import annotations

import numpy as np
import pytest

from ai.orthodontics.segmentation.heuristic import (
    HeuristicSegmenter,
    adaptive_gingiva_threshold,
    assign_fdi_labels,
    kmeans_split,
    merge_small_clusters,
    spatial_cluster,
)
from ai.orthodontics.segmentation.interface import DentalMesh


# ─── Fixtures ─────────────────────────────────────────────────────────────────


def _make_bimodal_y(
    n_crown: int = 400,
    n_gingiva: int = 300,
    crown_y_range: tuple[float, float] = (0.0, 0.3),
    gingiva_y_range: tuple[float, float] = (0.65, 1.0),
    seed: int = 42,
) -> np.ndarray:
    """Synthetic Y centroid array with two clearly separated peaks."""
    rng = np.random.default_rng(seed)
    crown_ys = rng.uniform(*crown_y_range, size=n_crown)
    gingiva_ys = rng.uniform(*gingiva_y_range, size=n_gingiva)
    return np.concatenate([crown_ys, gingiva_ys])


def _make_arch_centroids(
    n_teeth: int = 14,
    n_per_tooth: int = 50,
    tooth_spread: float = 0.05,
    seed: int = 42,
) -> np.ndarray:
    """Crown centroids arranged in a dental arch curve in XZ."""
    rng = np.random.default_rng(seed)
    parts = []
    for i in range(n_teeth):
        # Spread teeth across X from -3.5 to 3.5
        tx = -3.5 + 7.0 * i / (n_teeth - 1)
        # Z follows a parabolic arch: deeper in the middle
        tz = -abs(tx) * 0.4
        # Cluster of centroids near each tooth centre
        cluster = rng.uniform(-tooth_spread, tooth_spread, (n_per_tooth, 3))
        cluster[:, 0] += tx
        cluster[:, 1] = 0.0  # Y = 0 (crown level)
        cluster[:, 2] += tz
        parts.append(cluster)
    return np.vstack(parts).astype(np.float32)


def _simple_mesh(
    n_teeth: int = 14,
    n_per_tooth: int = 60,
    n_gingiva: int = 200,
    seed: int = 42,
) -> DentalMesh:
    """Minimal DentalMesh with separated crown clusters and a gingiva band."""
    rng = np.random.default_rng(seed)

    # Crown triangles — each tooth is a tight cluster in XZ
    crown_verts: list[np.ndarray] = []
    for i in range(n_teeth):
        tx = -3.5 + 7.0 * i / (n_teeth - 1)
        tz = -abs(tx) * 0.4
        # n_per_tooth triangles, each defined by 3 vertices
        vs = rng.uniform(-0.08, 0.08, (n_per_tooth * 3, 3)).astype(np.float32)
        vs[:, 0] += tx
        vs[:, 1] = rng.uniform(0.0, 0.25, n_per_tooth * 3)  # crown Y
        vs[:, 2] += tz
        crown_verts.append(vs)

    # Gingiva triangles — high Y values for upper arch
    gingiva_vs = rng.uniform(0.0, 5.0, (n_gingiva * 3, 3)).astype(np.float32)
    gingiva_vs[:, 1] = rng.uniform(0.65, 1.0, n_gingiva * 3)

    all_verts = np.vstack(crown_verts + [gingiva_vs])
    n_total = len(all_verts) // 3
    faces = np.arange(len(all_verts), dtype=np.int32).reshape(-1, 3)

    return DentalMesh(vertices=all_verts, faces=faces, arch="upper")


# ─── adaptive_gingiva_threshold ────────────────────────────────────────────────


class TestAdaptiveGingivaThreshold:
    def test_valley_between_two_peaks(self):
        """Valley between crown peak (~0.15) and gingiva peak (~0.82) must be in (0.3, 0.65)."""
        ys = _make_bimodal_y(crown_y_range=(0.0, 0.3), gingiva_y_range=(0.65, 1.0))
        threshold = adaptive_gingiva_threshold(ys, "upper")
        assert 0.3 < threshold < 0.65, f"Expected valley in (0.3, 0.65), got {threshold:.3f}"

    def test_threshold_is_below_gingiva_region(self):
        """Gingiva faces (Y > threshold) must cover the high-Y group."""
        ys = _make_bimodal_y()
        threshold = adaptive_gingiva_threshold(ys, "upper")
        # At least 80% of gingiva-Y values should exceed the threshold
        gingiva_ys = ys[ys > 0.65]
        frac_above = (gingiva_ys > threshold).mean()
        assert frac_above > 0.8, f"Only {frac_above:.2%} of gingiva Y above threshold"

    def test_fallback_for_unimodal_distribution(self):
        """When histogram is unimodal, return fixed-35% threshold."""
        rng = np.random.default_rng(0)
        y = rng.uniform(0.0, 1.0, 300)  # flat / unimodal
        threshold = adaptive_gingiva_threshold(y, "upper")
        y_max = float(y.max())
        y_range = float(y.max() - y.min())
        expected = y_max - y_range * 0.35
        # Should be close to the fixed fallback
        assert abs(threshold - expected) < y_range * 0.15, (
            f"Expected fallback ≈ {expected:.3f}, got {threshold:.3f}"
        )

    def test_lower_arch_threshold_is_at_low_y(self):
        """For lower arch gingiva is at low Y; threshold must be above y_min."""
        ys = _make_bimodal_y(
            crown_y_range=(0.7, 1.0),
            gingiva_y_range=(0.0, 0.3),
        )
        threshold = adaptive_gingiva_threshold(ys, "lower")
        assert 0.3 < threshold < 0.7, f"Lower-arch threshold out of range: {threshold:.3f}"

    def test_degenerate_flat_mesh(self):
        """All Y identical should not crash and should return a numeric value."""
        ys = np.full(100, 0.5, dtype=np.float32)
        threshold = adaptive_gingiva_threshold(ys, "upper")
        assert np.isfinite(threshold)


# ─── spatial_cluster / kmeans_split / merge_small_clusters ────────────────────


class TestClustering:
    def test_well_separated_arch_produces_multiple_clusters(self):
        """14 isolated tooth clusters should yield between 4 and 20 components."""
        centroids = _make_arch_centroids(n_teeth=14, n_per_tooth=50, tooth_spread=0.05)
        clusters = spatial_cluster(centroids, "upper")
        assert 4 <= len(clusters) <= 20, f"Unexpected cluster count: {len(clusters)}"

    def test_all_faces_accounted_for(self):
        """Every centroid index must appear in exactly one cluster."""
        centroids = _make_arch_centroids(n_teeth=10, n_per_tooth=40, tooth_spread=0.04)
        clusters = spatial_cluster(centroids, "upper")
        all_indices = np.concatenate(clusters)
        assert len(all_indices) == len(centroids), "Some centroids missing from clusters"
        assert len(np.unique(all_indices)) == len(centroids), "Duplicate centroid in clusters"

    def test_dense_single_blob_triggers_kmeans(self):
        """When all centroids fall in one grid cell, k-means fallback is used."""
        rng = np.random.default_rng(7)
        centroids = rng.uniform(0, 0.01, (300, 3)).astype(np.float32)  # tiny XZ spread
        clusters = spatial_cluster(centroids, "upper")
        # k-means always returns up to _KMEANS_K=14 clusters
        assert len(clusters) >= 4

    def test_kmeans_split_returns_k_clusters(self):
        """kmeans_split on 14 separated clusters should return exactly 14."""
        centroids = _make_arch_centroids(n_teeth=14, n_per_tooth=30, tooth_spread=0.05)
        clusters = kmeans_split(centroids, k=14)
        # After k-means empty clusters are dropped, should be close to 14
        assert 10 <= len(clusters) <= 14

    def test_merge_removes_tiny_clusters(self):
        """Clusters below 2% of total are merged into their nearest neighbour."""
        rng = np.random.default_rng(3)
        # 4 normal clusters + 1 tiny cluster (2 faces)
        big = [np.arange(0, 100), np.arange(100, 200), np.arange(200, 300), np.arange(300, 400)]
        tiny = [np.array([400, 401])]
        all_clusters = big + tiny
        all_centroids = np.zeros((402, 3), dtype=np.float32)
        all_centroids[300:400, 0] = 5.0  # big cluster at x=5
        all_centroids[400:402, 0] = 5.1  # tiny cluster nearest big cluster at x=5

        result = merge_small_clusters(all_clusters, all_centroids, total=402)
        sizes = [len(c) for c in result]
        assert all(s >= 5 for s in sizes), f"Tiny cluster not merged: sizes={sizes}"
        assert sum(sizes) == 402, "Faces lost during merge"


# ─── assign_fdi_labels ────────────────────────────────────────────────────────


class TestFdiAssignment:
    def _make_sorted_clusters(
        self, n: int = 16, faces_per: int = 20, arch: str = "upper"
    ) -> tuple[list[np.ndarray], np.ndarray, int]:
        """n clusters evenly spread in X, returning (clusters, all_centroids, M)."""
        M = n * faces_per
        all_centroids = np.zeros((M, 3), dtype=np.float32)
        clusters = []
        for i in range(n):
            x = -3.5 + 7.0 * i / (n - 1)
            start = i * faces_per
            end = start + faces_per
            all_centroids[start:end, 0] = x
            clusters.append(np.arange(start, end, dtype=np.int64))
        return clusters, all_centroids, M

    def test_upper_arch_fdis_are_in_range(self):
        clusters, centroids, M = self._make_sorted_clusters(16, arch="upper")
        gingiva_mask = np.zeros(M, dtype=bool)
        segments = assign_fdi_labels(clusters, centroids, gingiva_mask, M, "upper")
        fdis = {s.fdi for s in segments}
        assert fdis.issubset(set(range(11, 29))), f"Out-of-range FDIs: {fdis - set(range(11,29))}"

    def test_lower_arch_fdis_are_in_range(self):
        clusters, centroids, M = self._make_sorted_clusters(16, arch="lower")
        gingiva_mask = np.zeros(M, dtype=bool)
        segments = assign_fdi_labels(clusters, centroids, gingiva_mask, M, "lower")
        fdis = {s.fdi for s in segments}
        valid = set(range(31, 49))
        assert fdis.issubset(valid), f"Out-of-range FDIs: {fdis - valid}"

    def test_segments_sorted_by_fdi(self):
        clusters, centroids, M = self._make_sorted_clusters(14, arch="upper")
        gingiva_mask = np.zeros(M, dtype=bool)
        segments = assign_fdi_labels(clusters, centroids, gingiva_mask, M, "upper")
        fdis = [s.fdi for s in segments]
        assert fdis == sorted(fdis), f"Segments not sorted by FDI: {fdis}"

    def test_no_duplicate_fdis(self):
        clusters, centroids, M = self._make_sorted_clusters(16, arch="upper")
        gingiva_mask = np.zeros(M, dtype=bool)
        segments = assign_fdi_labels(clusters, centroids, gingiva_mask, M, "upper")
        fdis = [s.fdi for s in segments]
        assert len(fdis) == len(set(fdis)), f"Duplicate FDIs: {fdis}"

    def test_face_masks_are_non_overlapping(self):
        clusters, centroids, M = self._make_sorted_clusters(14, arch="upper")
        gingiva_mask = np.zeros(M, dtype=bool)
        segments = assign_fdi_labels(clusters, centroids, gingiva_mask, M, "upper")
        overlap = np.zeros(M, dtype=np.int32)
        for seg in segments:
            overlap[seg.face_mask] += 1
        assigned = overlap > 0
        assert (overlap[assigned] == 1).all(), "Overlapping face assignments"

    def _make_ideal_position_clusters(self, arch: str = "upper", faces_per: int = 20):
        """Clusters positioned at the exact ideal FDI X positions.

        This guarantees 1:1 greedy matching and allows testing which quadrant
        each cluster maps to without ambiguity from scale mismatch.
        """
        from ai.orthodontics.segmentation.heuristic import (
            _UPPER_FDI_BY_X,
            _LOWER_FDI_BY_X,
        )
        fdi_by_x = _UPPER_FDI_BY_X if arch == "upper" else _LOWER_FDI_BY_X
        M = len(fdi_by_x) * faces_per
        all_centroids = np.zeros((M, 3), dtype=np.float32)
        clusters = []
        for i, (_fdi, x) in enumerate(fdi_by_x):
            start = i * faces_per
            end = start + faces_per
            all_centroids[start:end, 0] = x
            clusters.append(np.arange(start, end, dtype=np.int64))
        return clusters, all_centroids, M

    def test_right_clusters_get_q1_fdis(self):
        """Clusters at ideal Q1 X positions (x < 0) should map to FDIs 11–18."""
        clusters, centroids, M = self._make_ideal_position_clusters("upper")
        gingiva_mask = np.zeros(M, dtype=bool)
        segments = assign_fdi_labels(clusters, centroids, gingiva_mask, M, "upper")

        right_fdis = {s.fdi for s in segments if s.centroid[0] < 0}
        assert right_fdis.issubset(set(range(11, 19))), (
            f"Right clusters got wrong FDIs: {right_fdis}"
        )

    def test_left_clusters_get_q2_fdis(self):
        """Clusters at ideal Q2 X positions (x > 0) should map to FDIs 21–28."""
        clusters, centroids, M = self._make_ideal_position_clusters("upper")
        gingiva_mask = np.zeros(M, dtype=bool)
        segments = assign_fdi_labels(clusters, centroids, gingiva_mask, M, "upper")

        left_fdis = {s.fdi for s in segments if s.centroid[0] > 0}
        assert left_fdis.issubset(set(range(21, 29))), (
            f"Left clusters got wrong FDIs: {left_fdis}"
        )

    def test_confidence_is_in_range(self):
        clusters, centroids, M = self._make_sorted_clusters(14, arch="upper")
        gingiva_mask = np.zeros(M, dtype=bool)
        segments = assign_fdi_labels(clusters, centroids, gingiva_mask, M, "upper")
        for seg in segments:
            assert 0.0 <= seg.confidence <= 1.0, f"FDI {seg.fdi} confidence={seg.confidence}"

    def test_confidence_exceeds_hardcoded_floor(self):
        """Well-separated clusters should score above the old hardcoded 0.5."""
        clusters, centroids, M = self._make_sorted_clusters(16, faces_per=30, arch="upper")
        gingiva_mask = np.zeros(M, dtype=bool)
        segments = assign_fdi_labels(clusters, centroids, gingiva_mask, M, "upper")
        mean_conf = np.mean([s.confidence for s in segments])
        assert mean_conf > 0.5, f"Mean confidence {mean_conf:.3f} not above 0.5"

    def test_empty_clusters_returns_empty(self):
        result = assign_fdi_labels([], np.zeros((0, 3)), np.zeros(0, dtype=bool), 0, "upper")
        assert result == []


# ─── Integration: HeuristicSegmenter end-to-end ───────────────────────────────


class TestHeuristicSegmenterIntegration:
    def test_segment_returns_result(self):
        mesh = _simple_mesh()
        segmenter = HeuristicSegmenter()
        result = segmenter.segment(mesh)

        assert len(result.segments) > 0
        assert result.model == "heuristic-v1"
        assert result.duration_ms > 0

    def test_gingiva_mask_covers_some_faces(self):
        mesh = _simple_mesh()
        result = HeuristicSegmenter().segment(mesh)
        assert result.gingiva_mask.any(), "No gingiva faces detected"
        assert not result.gingiva_mask.all(), "All faces classified as gingiva"

    def test_face_masks_partition_crown_faces(self):
        mesh = _simple_mesh()
        result = HeuristicSegmenter().segment(mesh)
        M = len(mesh.faces)
        covered = np.zeros(M, dtype=np.int32)
        for seg in result.segments:
            covered[seg.face_mask] += 1
        # Every crown face should be covered by exactly one segment
        crown_indices = np.where(~result.gingiva_mask)[0]
        assert (covered[crown_indices] == 1).all(), "Crown face double-assigned or missing"

    def test_all_fdis_are_unique(self):
        mesh = _simple_mesh()
        result = HeuristicSegmenter().segment(mesh)
        fdis = [s.fdi for s in result.segments]
        assert len(fdis) == len(set(fdis)), f"Duplicate FDIs in result: {fdis}"

    def test_centroid_shape(self):
        mesh = _simple_mesh()
        result = HeuristicSegmenter().segment(mesh)
        for seg in result.segments:
            assert seg.centroid.shape == (3,), f"Bad centroid shape for FDI {seg.fdi}"

    def test_empty_mesh(self):
        mesh = DentalMesh(
            vertices=np.zeros((0, 3), dtype=np.float32),
            faces=np.zeros((0, 3), dtype=np.int32),
            arch="upper",
        )
        result = HeuristicSegmenter().segment(mesh)
        assert result.segments == []
        assert len(result.gingiva_mask) == 0
