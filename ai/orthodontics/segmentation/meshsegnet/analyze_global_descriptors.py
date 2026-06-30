"""Analyze discriminability of global pooling descriptors (max, mean, std).

Loads a trained MeshSegNet checkpoint, intercepts the local feature tensor
(after 3 EdgeConv blocks, before global pooling), and computes three candidate
global descriptors for every scan in a dataset:

    global_max  : local_feat.max(dim=0)     — current Run 5 baseline
    global_mean : local_feat.mean(dim=0)    — candidate replacement
    global_std  : local_feat.std(dim=0)     — Run 6 addition (suspected degenerate)

For each descriptor, reports:
  - Mean pairwise cosine similarity (off-diagonal) — lower = more discriminative
  - Mean per-dimension variance across scans
  - Mean per-dimension entropy (via histogram binning)
  - Explained variance in first 5 PCA components

Outputs:
  <out_dir>/summary.txt        — all numeric metrics, one line per descriptor
  <out_dir>/pca_grid.png       — 3×1 PCA scatter (max / mean / std), colored by scan
  <out_dir>/similarity_heatmap.png  — N×N cosine similarity matrices side by side
  <out_dir>/variance_per_dim.png    — per-dimension variance for each descriptor
  <out_dir>/pca_explained.png       — cumulative explained variance curves

Usage
-----
  # On Kaggle with preprocessed .npz val split (180 scans):
  python -m ai.orthodontics.segmentation.meshsegnet.analyze_global_descriptors \\
      --checkpoint /kaggle/working/checkpoints/meshsegnet_upper_best.pt \\
      --data_dir   /kaggle/working/data \\
      --split val  --arch upper

  # Local: raw STL files (no labels needed — descriptor analysis only):
  python -m ai.orthodontics.segmentation.meshsegnet.analyze_global_descriptors \\
      --checkpoint ai/orthodontics/segmentation/meshsegnet/checkpoints/meshsegnet_upper_best.pt \\
      --stl_dir datasets/data

  # Add t-SNE (slower):
  ... --tsne
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch

# ── Matplotlib backend (non-interactive for scripts) ────────────────────────────
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

from scipy.spatial import KDTree


# ── Descriptor extraction ────────────────────────────────────────────────────────

def _extract_descriptors(
    model: "MeshSegNet",
    features: torch.Tensor,   # (F, 9)
    knn_idx: torch.Tensor,    # (F, k)
    device: torch.device,
) -> dict[str, np.ndarray]:
    """Return global_max, global_mean, global_std as numpy (448,) vectors."""
    features = features.to(device)
    knn_idx  = knn_idx.to(device)

    with torch.no_grad():
        x1 = model.ec1(features, knn_idx)              # (F, 64)
        x2 = model.ec2(x1, knn_idx)                    # (F, 128)
        x3 = model.ec3(x2, knn_idx)                    # (F, 256)
        local = torch.cat([x1, x2, x3], dim=-1)        # (F, 448)

        g_max  = local.max(dim=0)[0].cpu().numpy()     # (448,)
        g_mean = local.mean(dim=0).cpu().numpy()       # (448,)
        g_std  = local.std(dim=0, unbiased=False).cpu().numpy()  # (448,)

    return {"max": g_max, "mean": g_mean, "std": g_std}


# ── Data loading ──────────────────────────────────────────────────────────────────

def _build_knn(centroids: np.ndarray, k: int) -> np.ndarray:
    F = len(centroids)
    k_eff = min(k, F - 1) if F > 1 else 0
    if k_eff == 0:
        return np.zeros((F, k), dtype=np.int64)
    _, idx = KDTree(centroids).query(centroids, k=k_eff + 1)
    neighbors = idx[:, 1:].astype(np.int64)
    if k_eff < k:
        repeats = (k + k_eff - 1) // k_eff
        neighbors = np.tile(neighbors, repeats)[:, :k]
    return neighbors


def load_npz_scans(
    data_dir: Path,
    split: str,
    arch: str,
    n_samples: int | None,
    max_faces: int,
    k: int,
) -> list[dict]:
    """Load scans from preprocessed .npz files (Kaggle / full dataset path)."""
    splits_file = data_dir / "splits.json"
    if not splits_file.exists():
        raise FileNotFoundError(f"splits.json not found in {data_dir}")

    with open(splits_file) as f:
        splits = json.load(f)

    paths = [data_dir / p for p in splits[split] if f"/{arch}/" in p]
    if n_samples:
        rng = np.random.default_rng(0)
        idx = rng.choice(len(paths), size=min(n_samples, len(paths)), replace=False)
        paths = [paths[i] for i in sorted(idx)]

    scans = []
    for p in paths:
        if not p.exists():
            print(f"  [skip] {p.name} not found")
            continue
        npz = np.load(p, allow_pickle=False)
        feats = npz["features"].astype(np.float32)
        if len(feats) > max_faces:
            sel = np.sort(np.random.choice(len(feats), max_faces, replace=False))
            feats = feats[sel]
        knn = _build_knn(feats[:, :3], k)
        scans.append({
            "stem": p.stem,
            "features": torch.from_numpy(feats),
            "knn_idx": torch.from_numpy(knn),
        })
    return scans


def load_stl_scans(
    stl_dir: Path,
    arch_filter: str | None,
    n_samples: int | None,
    max_faces: int,
    k: int,
) -> list[dict]:
    """Load scans from raw STL files (local demo data path, no labels needed)."""
    try:
        import trimesh
    except ImportError:
        sys.exit("trimesh required. Install with: pip install trimesh")

    sys.path.insert(0, str(Path(__file__).parents[5]))
    from ai.orthodontics.segmentation.meshsegnet.preprocess import compute_features

    # Collect STL files; infer arch from filename (0A = upper, 0B = lower)
    stl_files = sorted(stl_dir.rglob("*.stl"))
    if arch_filter:
        arch_char = "A" if arch_filter == "upper" else "B"
        stl_files = [f for f in stl_files if f.stem.startswith(f"0{arch_char}") or
                                               f"-excluded" not in f.name]
    # Exclude files marked as excluded
    stl_files = [f for f in stl_files if "excluded" not in f.name]

    if n_samples:
        rng = np.random.default_rng(0)
        idx = rng.choice(len(stl_files), size=min(n_samples, len(stl_files)), replace=False)
        stl_files = [stl_files[i] for i in sorted(idx)]

    scans = []
    for stl_path in stl_files:
        try:
            mesh = trimesh.load(str(stl_path), force="mesh", process=False)
            if not isinstance(mesh, trimesh.Trimesh):
                mesh = trimesh.util.concatenate(mesh.dump())
            feats = compute_features(mesh)
            if len(feats) > max_faces:
                sel = np.sort(np.random.choice(len(feats), max_faces, replace=False))
                feats = feats[sel]
            knn = _build_knn(feats[:, :3], k)
            scans.append({
                "stem": stl_path.stem,
                "features": torch.from_numpy(feats),
                "knn_idx": torch.from_numpy(knn),
            })
        except Exception as e:
            print(f"  [skip] {stl_path.name}: {e}")

    return scans


# ── Metrics ────────────────────────────────────────────────────────────────────────

def _pairwise_cosine(matrix: np.ndarray) -> np.ndarray:
    """Return N×N cosine similarity matrix for (N, D) descriptor matrix."""
    norms = np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-12
    normed = matrix / norms
    return normed @ normed.T                # (N, N)


def _mean_offdiag(sim: np.ndarray) -> float:
    N = sim.shape[0]
    mask = ~np.eye(N, dtype=bool)
    return float(sim[mask].mean())


def _per_dim_variance(matrix: np.ndarray) -> np.ndarray:
    """Variance of each of the D dimensions across N scans. Shape: (D,)."""
    return matrix.var(axis=0)


def _per_dim_entropy(matrix: np.ndarray, n_bins: int = 50) -> np.ndarray:
    """Approximate entropy per dimension via histogram. Shape: (D,)."""
    D = matrix.shape[1]
    entropies = np.zeros(D)
    for d in range(D):
        col = matrix[:, d]
        counts, _ = np.histogram(col, bins=n_bins)
        probs = counts / (counts.sum() + 1e-12)
        probs = probs[probs > 0]
        entropies[d] = -float((probs * np.log(probs)).sum())
    return entropies


def _pca(matrix: np.ndarray, n_components: int = 2):
    """Return (scores (N, n_components), explained_variance_ratio (n_components,))."""
    from sklearn.decomposition import PCA
    pca = PCA(n_components=n_components, random_state=42)
    scores = pca.fit_transform(matrix)
    return scores, pca.explained_variance_ratio_


def _pca_cumulative(matrix: np.ndarray, n_components: int = 20):
    """Return cumulative explained variance for first n_components PCs."""
    from sklearn.decomposition import PCA
    n = min(n_components, matrix.shape[0] - 1, matrix.shape[1])
    pca = PCA(n_components=n, random_state=42)
    pca.fit(matrix)
    return pca.explained_variance_ratio_


def _tsne(matrix: np.ndarray):
    from sklearn.manifold import TSNE
    n_comp = min(50, matrix.shape[0] - 1, matrix.shape[1])
    from sklearn.decomposition import PCA
    pca = PCA(n_components=n_comp, random_state=42)
    reduced = pca.fit_transform(matrix)
    tsne = TSNE(n_components=2, perplexity=min(30, matrix.shape[0] // 3), random_state=42)
    return tsne.fit_transform(reduced)


# ── Plotting ────────────────────────────────────────────────────────────────────────

_NAMES  = ["max", "mean", "std"]
_COLORS = ["#2E86AB", "#A23B72", "#F18F01"]   # blue, purple, amber
_LABELS = ["global_max (Run 5)", "global_mean (candidate)", "global_std (Run 6)"]


def plot_pca_grid(matrices: dict[str, np.ndarray], out_path: Path, do_tsne: bool) -> None:
    n_rows = 2 if do_tsne else 1
    fig, axes = plt.subplots(n_rows, 3, figsize=(15, 5 * n_rows))
    if n_rows == 1:
        axes = axes[np.newaxis, :]

    N = next(iter(matrices.values())).shape[0]
    scan_idx = np.arange(N)

    for col, name in enumerate(_NAMES):
        mat = matrices[name]
        # PCA row
        pca_scores, evr = _pca(mat, n_components=2)
        ax = axes[0, col]
        sc = ax.scatter(pca_scores[:, 0], pca_scores[:, 1],
                        c=scan_idx, cmap="viridis", s=40, alpha=0.8)
        ax.set_title(f"PCA — global_{name}\n"
                     f"PC1 {evr[0]*100:.1f}% | PC2 {evr[1]*100:.1f}% var",
                     fontsize=10)
        ax.set_xlabel("PC 1")
        ax.set_ylabel("PC 2")
        plt.colorbar(sc, ax=ax, label="scan index")

        if do_tsne:
            t = _tsne(mat)
            ax2 = axes[1, col]
            sc2 = ax2.scatter(t[:, 0], t[:, 1], c=scan_idx, cmap="viridis", s=40, alpha=0.8)
            ax2.set_title(f"t-SNE — global_{name}", fontsize=10)
            ax2.set_xlabel("t-SNE 1")
            ax2.set_ylabel("t-SNE 2")
            plt.colorbar(sc2, ax=ax2, label="scan index")

    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close()
    print(f"  saved: {out_path}")


def plot_similarity_heatmaps(sim_matrices: dict[str, np.ndarray], out_path: Path) -> None:
    N = next(iter(sim_matrices.values())).shape[0]
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    for ax, name, label, color in zip(axes, _NAMES, _LABELS, _COLORS):
        sim = sim_matrices[name]
        mean_sim = _mean_offdiag(sim)
        im = ax.imshow(sim, vmin=0.98, vmax=1.0, cmap="RdYlGn_r", aspect="auto")
        ax.set_title(f"{label}\nmean off-diag cosine sim: {mean_sim:.5f}", fontsize=9)
        ax.set_xlabel(f"scan index (N={N})")
        ax.set_ylabel("scan index")
        plt.colorbar(im, ax=ax, shrink=0.8)
        # Add a border in the descriptor color
        for spine in ax.spines.values():
            spine.set_edgecolor(color)
            spine.set_linewidth(2)
    plt.suptitle("Pairwise cosine similarity  —  closer to 1.0 = less discriminative",
                 fontsize=11, y=1.01)
    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close()
    print(f"  saved: {out_path}")


def plot_variance_per_dim(matrices: dict[str, np.ndarray], out_path: Path) -> None:
    fig, axes = plt.subplots(3, 1, figsize=(14, 10), sharex=True)
    for ax, name, label, color in zip(axes, _NAMES, _LABELS, _COLORS):
        var = _per_dim_variance(matrices[name])   # (448,)
        ax.bar(np.arange(len(var)), var, color=color, alpha=0.7, width=1.0)
        ax.axhline(var.mean(), color="black", linestyle="--", linewidth=1.0,
                   label=f"mean = {var.mean():.5f}")
        ax.set_ylabel("Variance\nacross scans")
        ax.set_title(f"{label}  |  mean var = {var.mean():.5f}  |  max var = {var.max():.5f}",
                     fontsize=9)
        ax.legend(fontsize=8)
    axes[-1].set_xlabel("Feature dimension (0 – 447)")
    plt.suptitle("Per-dimension variance across scans  —  higher = more discriminative",
                 fontsize=11)
    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close()
    print(f"  saved: {out_path}")


def plot_pca_explained(matrices: dict[str, np.ndarray], out_path: Path,
                       n_components: int = 20) -> None:
    fig, ax = plt.subplots(figsize=(9, 5))
    for name, label, color in zip(_NAMES, _LABELS, _COLORS):
        evr = _pca_cumulative(matrices[name], n_components)
        cumulative = np.cumsum(evr) * 100
        ax.plot(np.arange(1, len(cumulative) + 1), cumulative,
                marker="o", markersize=4, label=label, color=color)
    ax.axhline(80, color="gray", linestyle=":", linewidth=1.0, label="80% threshold")
    ax.axhline(95, color="gray", linestyle="--", linewidth=1.0, label="95% threshold")
    ax.set_xlabel("Number of PCA components")
    ax.set_ylabel("Cumulative explained variance (%)")
    ax.set_title("PCA explained variance\n"
                 "More components needed for same variance = higher-dimensional information")
    ax.legend(fontsize=9)
    ax.set_xlim(1, n_components)
    ax.set_ylim(0, 102)
    ax.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close()
    print(f"  saved: {out_path}")


def plot_distribution_histograms(matrices: dict[str, np.ndarray], out_path: Path) -> None:
    """Overlay distribution of all 448 per-dimension values across scans for each descriptor."""
    fig, axes = plt.subplots(1, 3, figsize=(15, 4))
    for ax, name, label, color in zip(axes, _NAMES, _LABELS, _COLORS):
        mat = matrices[name]   # (N, 448)
        # Flatten: all N*448 values
        vals = mat.flatten()
        ax.hist(vals, bins=80, color=color, alpha=0.7, density=True)
        ax.set_title(f"{label}\nμ={vals.mean():.3f}  σ={vals.std():.3f}\n"
                     f"range [{vals.min():.3f}, {vals.max():.3f}]", fontsize=9)
        ax.set_xlabel("Descriptor value")
        ax.set_ylabel("Density")
    plt.suptitle("Value distribution of each global descriptor (all dimensions, all scans)",
                 fontsize=11)
    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close()
    print(f"  saved: {out_path}")


# ── Main ────────────────────────────────────────────────────────────────────────────

def _load_model(checkpoint: Path, k: int, device: torch.device):
    sys.path.insert(0, str(Path(__file__).parents[5]))

    ckpt = torch.load(checkpoint, map_location="cpu", weights_only=True)

    # Checkpoints saved by train.py use "state_dict" key
    state = ckpt.get("state_dict", ckpt.get("model_state_dict", ckpt))

    # Detect Run 5 vs Run 6 architecture from global_mlp input size
    # Run 5: global_mlp.0.weight shape (256, 448) — max-pool only
    # Run 6: global_mlp.0.weight shape (256, 896) — max+std-pool
    gmlp_in = state["global_mlp.0.weight"].shape[1]
    use_std_pool = gmlp_in == 896
    arch_name = f"Run 6 (max+std, {gmlp_in}→256)" if use_std_pool else f"Run 5 (max-only, {gmlp_in}→256)"
    print(f"  Checkpoint architecture: {arch_name}")
    print(f"  Epoch: {ckpt.get('epoch', '?')}  |  Val DSC: {ckpt.get('val_dsc', '?')}")

    # Build a matching model. We patch the global_mlp input size at construction
    # time so we can load the state_dict cleanly without strict=False hacks.
    from ai.orthodontics.segmentation.meshsegnet.model import MeshSegNet
    import torch.nn as nn

    local_ch = 64 + 128 + 256  # 448 — never changes

    class _MatchedModel(MeshSegNet):
        """MeshSegNet with global_mlp sized to match the checkpoint."""
        def __init__(self):
            # Call nn.Module.__init__ directly to avoid MeshSegNet.__init__
            # re-building with the wrong global_mlp size.
            nn.Module.__init__(self)
            self.k = k
            dropout = 0.2

            from ai.orthodontics.segmentation.meshsegnet.model import EdgeConv
            self.ec1 = EdgeConv(9,       64,  dropout=dropout)
            self.ec2 = EdgeConv(64,      128, dropout=dropout)
            self.ec3 = EdgeConv(128,     256, dropout=dropout)

            self.global_mlp = nn.Sequential(
                nn.Linear(gmlp_in, 256, bias=False),
                nn.LayerNorm(256),
                nn.LeakyReLU(0.2, inplace=True),
                nn.Dropout(dropout),
            )
            classifier_in = local_ch + 256
            self.classifier = nn.Sequential(
                nn.Linear(classifier_in, 256, bias=False),
                nn.LayerNorm(256),
                nn.LeakyReLU(0.2),
                nn.Dropout(0.4),
                nn.Linear(256, 128, bias=False),
                nn.LayerNorm(128),
                nn.LeakyReLU(0.2),
                nn.Dropout(0.3),
                nn.Linear(128, 17),
            )
            # Store so _extract_descriptors knows what the checkpoint used
            self._checkpoint_uses_std = use_std_pool

    model = _MatchedModel().eval()
    missing, unexpected = model.load_state_dict(state, strict=True)
    # strict=True: any mismatch means the architecture detection failed
    total = sum(p.numel() for p in model.parameters())
    print(f"  Parameters loaded: {total:,}  (expected {'616,721' if use_std_pool else '502,033'})")
    model = model.to(device)
    return model


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Analyze discriminability of global pooling descriptors (max / mean / std)."
    )
    # Data source (mutually exclusive: .npz or raw STL)
    grp = parser.add_mutually_exclusive_group(required=True)
    grp.add_argument("--data_dir", type=Path,
                     help="Root of preprocessed .npz files containing splits.json")
    grp.add_argument("--stl_dir", type=Path,
                     help="Directory of raw STL files (demo data; no labels needed)")

    parser.add_argument("--checkpoint", type=Path, required=True,
                        help="Path to meshsegnet_upper_best.pt or _lower_best.pt")
    parser.add_argument("--split", default="val", choices=["train", "val", "test"],
                        help="Split to analyze when using --data_dir (default: val)")
    parser.add_argument("--arch", default="upper", choices=["upper", "lower"],
                        help="Arch to analyze (default: upper)")
    parser.add_argument("--n_samples", type=int, default=None,
                        help="Subsample N scans (default: all available)")
    parser.add_argument("--max_faces", type=int, default=12_000,
                        help="Downsample meshes to this many faces (default: 12000)")
    parser.add_argument("--k", type=int, default=6, help="k-NN neighbours (default: 6)")
    parser.add_argument("--out_dir", type=Path,
                        default=Path(__file__).parent / "analysis_output",
                        help="Output directory for plots and summary")
    parser.add_argument("--tsne", action="store_true",
                        help="Also compute t-SNE (slower; adds ~30s for N=180)")
    parser.add_argument("--cpu", action="store_true",
                        help="Force CPU even if GPU available")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    device = torch.device("cpu") if args.cpu else (
        torch.device("mps") if torch.backends.mps.is_available() else
        torch.device("cuda") if torch.cuda.is_available() else
        torch.device("cpu")
    )
    print(f"\nDevice: {device}")
    print(f"Checkpoint: {args.checkpoint}")
    print(f"Output dir: {args.out_dir}\n")

    # ── Load model ───────────────────────────────────────────────────────────────
    print("Loading model...")
    model = _load_model(args.checkpoint, args.k, device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"  Parameters: {n_params:,}")

    # ── Load scans ───────────────────────────────────────────────────────────────
    print("\nLoading scans...")
    if args.data_dir:
        scans = load_npz_scans(args.data_dir, args.split, args.arch,
                               args.n_samples, args.max_faces, args.k)
    else:
        scans = load_stl_scans(args.stl_dir, args.arch,
                               args.n_samples, args.max_faces, args.k)

    if not scans:
        sys.exit("No scans loaded. Check --data_dir / --stl_dir and --arch.")

    N = len(scans)
    print(f"  Loaded {N} scans")

    # ── Extract descriptors ──────────────────────────────────────────────────────
    print(f"\nExtracting descriptors ({N} scans)...")
    t0 = time.time()
    raw: dict[str, list[np.ndarray]] = {"max": [], "mean": [], "std": []}

    for i, scan in enumerate(scans):
        desc = _extract_descriptors(model, scan["features"], scan["knn_idx"], device)
        for name in _NAMES:
            raw[name].append(desc[name])
        if (i + 1) % 20 == 0 or i + 1 == N:
            print(f"  {i+1}/{N}  ({time.time()-t0:.1f}s)")

    matrices: dict[str, np.ndarray] = {name: np.stack(raw[name]) for name in _NAMES}
    # matrices["max"]  shape (N, 448)
    # matrices["mean"] shape (N, 448)
    # matrices["std"]  shape (N, 448)

    # ── Compute metrics ──────────────────────────────────────────────────────────
    print("\nComputing metrics...")
    sim_matrices: dict[str, np.ndarray] = {}
    results: dict[str, dict] = {}

    for name in _NAMES:
        mat = matrices[name]
        sim = _pairwise_cosine(mat)
        sim_matrices[name] = sim
        var = _per_dim_variance(mat)
        ent = _per_dim_entropy(mat)
        evr = _pca_cumulative(mat, n_components=min(20, N - 1, 448))
        cum_evr = np.cumsum(evr)

        def pcs_for_threshold(threshold):
            idx = np.searchsorted(cum_evr, threshold)
            return int(idx) + 1 if idx < len(cum_evr) else len(cum_evr)

        results[name] = {
            "mean_cosine_sim":   _mean_offdiag(sim),
            "mean_variance":     float(var.mean()),
            "max_variance":      float(var.max()),
            "mean_entropy":      float(ent.mean()),
            "pcs_for_80pct":     pcs_for_threshold(0.80),
            "pcs_for_95pct":     pcs_for_threshold(0.95),
            "value_mean":        float(mat.mean()),
            "value_std":         float(mat.std()),
            "value_range":       (float(mat.min()), float(mat.max())),
        }

    # ── Print summary ────────────────────────────────────────────────────────────
    print("\n" + "="*78)
    print(f"GLOBAL DESCRIPTOR ANALYSIS  |  arch={args.arch}  |  N={N} scans")
    print("="*78)
    header = f"{'Metric':<32} {'global_max':>14} {'global_mean':>14} {'global_std':>14}"
    print(header)
    print("-"*78)

    rows = [
        ("Mean pairwise cosine sim ↓",  "mean_cosine_sim",  "{:.6f}"),
        ("Mean per-dim variance ↑",      "mean_variance",    "{:.6f}"),
        ("Max per-dim variance ↑",       "max_variance",     "{:.6f}"),
        ("Mean per-dim entropy ↑",       "mean_entropy",     "{:.4f}"),
        ("PCs needed for 80% var ↑",     "pcs_for_80pct",   "{:>14}"),
        ("PCs needed for 95% var ↑",     "pcs_for_95pct",   "{:>14}"),
        ("Descriptor value mean",        "value_mean",       "{:.4f}"),
        ("Descriptor value std",         "value_std",        "{:.4f}"),
    ]
    for label, key, fmt in rows:
        vals = [results[name][key] for name in _NAMES]
        row = f"{label:<32}" + "".join(
            fmt.format(v).rjust(15) for v in vals
        )
        print(row)

    # Highlight winner (most discriminative = lowest cosine sim)
    sims = {name: results[name]["mean_cosine_sim"] for name in _NAMES}
    winner = min(sims, key=sims.get)
    print("-"*78)
    print(f"\nMost discriminative: global_{winner}  "
          f"(mean cosine sim = {sims[winner]:.6f})")
    print(f"Least discriminative: global_{max(sims, key=sims.get)}  "
          f"(mean cosine sim = {max(sims.values()):.6f})")

    # ── Write summary to file ────────────────────────────────────────────────────
    summary_path = args.out_dir / "summary.txt"
    with open(summary_path, "w") as f:
        f.write(f"Checkpoint: {args.checkpoint}\n")
        f.write(f"Arch: {args.arch} | N scans: {N}\n\n")
        f.write(header + "\n" + "-"*78 + "\n")
        for label, key, fmt in rows:
            vals = [results[name][key] for name in _NAMES]
            f.write(f"{label:<32}" + "".join(fmt.format(v).rjust(15) for v in vals) + "\n")
        f.write(f"\nMost discriminative: global_{winner}\n")
        for name in _NAMES:
            r = results[name]
            f.write(f"\n[global_{name}]\n")
            f.write(f"  value range: [{r['value_range'][0]:.4f}, {r['value_range'][1]:.4f}]\n")
    print(f"\n  saved: {summary_path}")

    # ── Generate plots ───────────────────────────────────────────────────────────
    print("\nGenerating plots...")

    if N < 3:
        print("  [skip] need at least 3 scans for PCA/plots")
    else:
        plot_pca_grid(matrices, args.out_dir / "pca_grid.png", do_tsne=args.tsne)
        plot_similarity_heatmaps(sim_matrices, args.out_dir / "similarity_heatmap.png")
        plot_variance_per_dim(matrices, args.out_dir / "variance_per_dim.png")
        plot_pca_explained(matrices, args.out_dir / "pca_explained.png")
        plot_distribution_histograms(matrices, args.out_dir / "value_distributions.png")

    print(f"\nDone. All output in {args.out_dir}/")


if __name__ == "__main__":
    main()
