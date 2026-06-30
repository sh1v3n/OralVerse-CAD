# MeshSegNet Segmentation Research Findings

Permanent research notebook for OralVerse tooth segmentation (Track C).  
Chronological record of all experiments, analyses, failed hypotheses, and lessons learned.

**Production status**: Frozen at Run 5. Future improvements are independent research experiments starting from this baseline.

---

## Background

### Why MeshSegNet

OralVerse needs to label every triangle of a dental STL scan with its FDI tooth number. The alternatives at project start were:

- **Heuristic** (adaptive gingiva threshold + arch-curve k-means): fast, no GPU, but fails on crowded arches and misses wisdom teeth. Implemented in `heuristic.py`.
- **MeshSegNet (Lian et al., 2020 MICCAI)**: graph neural network trained on real clinical scans, designed exactly for this task.

MeshSegNet was chosen for the deep learning path because the 3DTeethSeg22 challenge dataset was publicly available and MeshSegNet was the best-performing method with an open-weight description.

### Original Paper Summary

**"MeshSegNet: Deep Multi-Scale Mesh Feature Learning for Automated Labeling of Raw Dental Surfaces"**  
Lian et al., MICCAI 2020.

Key architectural choices:
- Graph Attentive Convolution (GAC) for local feature aggregation — attention-weighted sum over k nearest neighbours
- Three stacked GAC layers producing multi-scale features
- Global context: `cat(max-pool, std-pool)` over all faces → MLP → broadcast back
- Per-face classifier: concatenated local + global → softmax over 17 classes
- Normalisation: BatchNorm (applied per feature channel across all faces)

Reported performance on the 3DTeethSeg22 test set: **mean tooth DSC 0.93–0.96**.

Our implementation differs in two ways that were present from the start:
1. EdgeConv (DGCNN, Wang et al. 2019) instead of GAC — aggregate via `MLP([x_i, x_j - x_i])` then max-pool over neighbours
2. LayerNorm instead of BatchNorm (introduced in Run 5, after discovering BatchNorm caused train/val divergence)

These differences are deliberate adaptations, not oversights. EdgeConv was chosen for implementation simplicity; LayerNorm was necessary to fix a critical training bug.

### Dataset

**Teeth3DS+ (3DTeethSeg22 challenge dataset)**  
1800 total scans: 900 upper arch + 900 lower arch  
Split (seed=42, fixed): 1440 train / 180 val / 180 test

Format: per-case OBJ mesh + JSON label file  
Labels: per-vertex FDI tooth numbers; converted to per-face via majority vote in `preprocess.py`

Preprocessing (`preprocess.py` → `.npz`):
- Centroids normalised to `[-1, 1]` per scan
- Face normals (unit vectors)
- Log face area (normalised)
- Principal curvatures κ₁, κ₂ (cotangent Laplacian + angle-deficit method)
- kNN graph built from centroids at load time (k=6, KDTree)

Large meshes downsampled to `max_faces=12,000` at load time.

### Training Setup (fixed across all runs unless noted)

| Setting | Value |
|---|---|
| `batch_size` | 1 (variable face count per mesh) |
| `optimizer` | AdamW, `weight_decay=1e-4` |
| `lr_schedule` | Linear warmup → CosineAnnealingLR |
| `max_faces` | 12,000 (downsampled at load) |
| `k_neighbours` | 6 |
| `num_classes` | 17 (0=gingiva, 1–16=teeth per arch) |
| `in_features` | 9 |
| `class_weights` | Inverse-sqrt frequency |
| Augmentation | Mirror-flip + rotation + scale + jitter (train only) |
| Early stopping | DSC-based, `patience=30`, `min_delta=5e-3` |
| Platform | Kaggle (Tesla T4 GPU) |

---

## Experiment History

### Runs 1–4: Baseline Hyperparameter Search

**Shared architecture**:
- 3× EdgeConv (9→64→128→256), global max-pool, 2-layer classifier
- All normalisation: **BatchNorm1d**
- Multi-scale concatenation: `cat([x1, x2, x3])` → `(F, 448)`
- Global context: `local_feat.max(dim=0)` → `(448,)` → Linear(448→256) → broadcast

---

#### Run 1 — Baseline

**Commit**: `0307b18`

**Configuration**:

| Setting | Value |
|---|---|
| `lr` | 1e-3 |
| `gamma` (focal) | 2.0 |
| `dropout` | 0.1 |
| `warmup_epochs` | 5 |
| `patience` | 20 |
| `epochs` | 100 |

**Results**:
- Val loss diverges to 1.5+ by epoch 20
- Mean tooth DSC plateaus: ~18–20%
- Train loss decreases normally

**Lesson**: Something fundamentally wrong — hyperparameters alone don't explain this divergence.

---

#### Run 2 — Lower Focal Loss, More Dropout

**Commit**: `0698d7e`

**Change from Run 1**:

| Setting | Before | After |
|---|---|---|
| `gamma` | 2.0 | 0.5 |
| `dropout` | 0.1 | 0.2 |
| `warmup_epochs` | 5 | 10 |
| `patience` | 20 | 30 |

**Results**: Same divergence, same DSC plateau. Hyperparameter changes had zero effect.

**Lesson**: The problem is not in the loss function or regularisation.

---

#### Run 3 — Lower LR, Longer Warmup

**Commit**: `c5b97f5`

**Change from Run 2**:

| Setting | Before | After |
|---|---|---|
| `lr` | 1e-3 | 3e-4 |

**Results**: Val loss diverges earlier (~ep 15 vs ~ep 20). Worse, not better.

**Lesson**: Reducing LR did not help. The divergence is not an instability issue.

---

#### Run 4 — Drop Focal Loss

**Commit**: `1ea83ef`

**Change from Run 3**:

| Setting | Before | After |
|---|---|---|
| `gamma` | 0.5 | 0.0 (plain CE + Dice) |
| `warmup_epochs` | 10 | 5 |

**Results**: Val loss diverges by epoch 15. No improvement.

**Lesson**: The loss function is not the cause. Four independent hyperparameter changes, all producing the same divergence signature. Root cause must be structural.

---

#### Root Cause Analysis (after Runs 1–4)

All four runs showed the identical failure signature:
- Train loss decreases steadily toward ~0.5
- Val loss diverges to 1.5–1.8 by epoch 15–25
- Mean tooth DSC plateaus at ~18–20%
- The gap grows monotonically — this is not high variance, it's systematic

The specific failure mode pointed to a **train/eval discrepancy** — the model behaves differently in `.train()` vs `.eval()` mode through no fault of the loss function.

`nn.BatchNorm1d` has running-stat buffers (`running_mean` and `running_var`) that accumulate statistics across training batches. With `batch_size=1`, each training step processes one mesh: the running stats accumulate an average across all 1440 training meshes. At eval time, the model uses those accumulated population statistics to normalise each individual val mesh — which can differ substantially from that mesh's own statistics.

Dental scans vary in arch size, tooth count, crowding, and orientation. A scan with unusually large teeth will have face centroid/curvature distributions very different from the population mean. BatchNorm uses the population mean → the normalisation is wrong → the downstream features are shifted → val loss diverges.

The `global_mlp` had always used `LayerNorm` (it receives a single `(1, C)` vector where batch normalisation over 1 element is undefined). The 4 BatchNorm1d layers in the EdgeConv blocks and the classifier did not.

**Fix**: Replace all `BatchNorm1d` with `LayerNorm`. LayerNorm normalises each sample by its own statistics — no running buffers, no train/eval split.

---

### Run 5 — Fix 1: BatchNorm → LayerNorm ✓ VALIDATED BASELINE

**Commit**: `35676b5`  
**Status**: **Production baseline. Checkpoints in `checkpoints/`.**

**Hypothesis**: BatchNorm running-stats mismatch (batch_size=1 + variable mesh geometry) is the sole cause of train/val divergence. Replacing all BatchNorm1d with LayerNorm eliminates the mismatch entirely.

**Architectural changes (`model.py` only)**:

| Location | Before | After |
|---|---|---|
| `EdgeConv.mlp[1]` | `nn.BatchNorm1d(out_ch)` | `nn.LayerNorm(out_ch)` |
| `EdgeConv.mlp[4]` | `nn.BatchNorm1d(out_ch)` | `nn.LayerNorm(out_ch)` |
| `MeshSegNet.classifier[1]` | `nn.BatchNorm1d(256)` | `nn.LayerNorm(256)` |
| `MeshSegNet.classifier[4]` | `nn.BatchNorm1d(128)` | `nn.LayerNorm(128)` |

`global_mlp` already had LayerNorm — unchanged.

**Configuration (identical to Run 4)**:

| Setting | Value |
|---|---|
| `lr` | 3e-4 |
| `gamma` | 0.0 |
| `dropout` | 0.2 |
| `warmup_epochs` | 5 |
| `patience` | 30 |
| `epochs` | 100 |

**Parameter count**: 502,033 (unchanged from Run 4 — `LayerNorm(C)` and `BatchNorm1d(C)` both have 2C trainable parameters)  
**BatchNorm1d**: 0  
**LayerNorm**: 9 (6 EdgeConv + 1 global_mlp + 2 classifier)  
**Running-stat buffers**: 0

**Pre-launch verification checklist**:
- [x] Forward pass (train mode): shape `(F, 17)`, no NaNs, loss valid, backward OK
- [x] Forward pass (eval mode): shape `(F, 17)`, no NaNs
- [x] Eval determinism: same input → max delta `0.00e+00`
- [x] `BatchNorm1d` remaining: 0
- [x] `LayerNorm` count: 9
- [x] Buffer elements: 0
- [x] `git diff HEAD`: exactly 4 lines changed, only `model.py`

**Results (test split, 180 scans each)**:

| Metric | Upper | Lower |
|---|---|---|
| Best epoch | 98 | 74 |
| Val DSC (best checkpoint) | 56.5% | 63.8% |
| **Test DSC** | **52.9%** | **61.2%** |
| Gingiva DSC | 86.3% | 87.4% |
| Overall accuracy | 71.1% | 76.8% |

**Per-tooth test DSC — Upper arch**:

| FDI | DSC | FDI | DSC |
|---|---|---|---|
| 11 (central incisor) | 45.1% | 21 | 49.9% |
| 12 (lateral incisor) | 36.7% | 22 | 39.1% |
| 13 (canine) | 54.5% | 23 | 56.5% |
| 14 (1st premolar) | 68.4% | 24 | 64.7% |
| 15 (2nd premolar) | 67.9% | 25 | 65.2% |
| 16 (1st molar) | 71.2% | 26 | 72.1% |
| 17 (2nd molar) | 65.3% | 27 | 65.3% |
| 18 (wisdom) | **8.7%** | 28 | **16.1%** |

**Per-tooth test DSC — Lower arch**:

| FDI | DSC | FDI | DSC |
|---|---|---|---|
| 41 | 55.9% | 31 | 58.0% |
| 42 | 56.6% | 32 | 58.0% |
| 43 | 69.0% | 33 | 69.3% |
| 44 | 74.8% | 34 | 73.1% |
| 45 | 72.9% | 35 | 71.4% |
| 46 | 75.4% | 36 | 77.4% |
| 47 | 71.1% | 37 | 72.4% |
| 48 | **12.4%** | 38 | **10.9%** |

**Key observations**:
- Val loss tracked train loss throughout all 100 epochs — divergence **completely eliminated**
- 3× improvement in mean tooth DSC (18% → 52–61%)
- Molars (FDI 16/26/36/46): strongest at 71–77% — large, abundant, distinctive shape
- Lateral incisors (FDI 12/22): weakest regular teeth at 37–40% — small, symmetric, confused with neighbours
- Wisdom teeth (FDI 18/28/38/48): 9–16% — absent in many training scans, class weighting helps but cannot compensate

**Conclusion**: Hypothesis fully confirmed. BatchNorm running-stats mismatch was the sole cause of all four prior failures. This is the **validated production baseline**. All future runs branch from this.

---

### Run 6 — Fix 2: STD Pooling

> **Research experiment completed. Not adopted into production architecture.**  
> Root cause analysis in § "Analysis: Global Descriptor Discriminability" below.

**Commit**: `6c2f215`  
**Status**: Completed. Results documented. Architecture reverted to Run 5.

**Motivation**:

The original 2020 MICCAI MeshSegNet paper uses `cat(max-pool, std-pool)` over all faces to produce the global context vector, yielding a `(896,)` input to the global MLP. The Run 5 implementation uses only max-pool, producing a `(448,)` input — half the expressiveness of the paper's global representation.

The hypothesis: std-pool captures the spread/variance of features across the mesh ("how heterogeneous is this scan"), which max-pool misses. Together they would give the model both the extremes (max) and the dispersion (std) of global geometry — useful for distinguishing rare wisdom teeth from common central incisors.

**Architectural changes (`model.py` only)**:

1. `global_mlp` Linear input: `local_ch` (448) → `local_ch * 2` (896)
2. `forward()` global context: `cat([max(dim=0), std(dim=0, unbiased=False)])` → `(896,)`

**Parameter count**:

| Component | Run 5 | Run 6 | Δ |
|---|---|---|---|
| `global_mlp` Linear | 448×256 = 114,688 | 896×256 = 229,376 | +114,688 |
| Everything else | 387,345 | 387,345 | — |
| **Total** | **502,033** | **616,721** | **+114,688** |

**Configuration**: Identical to Run 5.

**Training curves (epoch-by-epoch)**:

Upper arch (100 epochs):
- Epoch 1: DSC 3.2%, val_loss 1.060
- Epoch 22: DSC ~23%, val_loss ~0.69 — no phase transition (contrast with lower arch)
- Epoch 50: DSC ~28%, val_loss ~0.66 — stuck
- Epoch 98 (best): DSC 33.5%, val_loss 0.642

Lower arch (100 epochs):
- Epoch 21: DSC 27.5%, val_loss 0.692
- **Epoch 22: DSC 43.6%, val_loss 0.605** — sudden phase transition
- Epoch 36: DSC 61.1% — rapid improvement
- Epoch 85 (best): DSC 64.2%, val_loss 0.413

**Results vs Run 5 baseline**:

| Arch | Run 5 val DSC | Run 6 val DSC | Δ |
|---|---|---|---|
| Upper | 56.5% | **33.5%** | **−23pp** |
| Lower | 63.8% | **64.2%** | +0.4pp |

**Outcome**: Upper arch **failure** (−23pp regression). Lower arch **neutral** (+0.4pp, within noise).

---

## Analysis: Global Descriptor Discriminability

After Run 6 failed, a systematic analysis was conducted to determine whether the failure was due to optimization, architecture, implementation mismatch with the paper, or upper-arch dataset characteristics.

### Method

Script: `ai/orthodontics/segmentation/meshsegnet/analyze_global_descriptors.py`

Loads the Run 5 checkpoint, intercepts `local_feat = cat([x1, x2, x3])` (shape `(F, 448)`) before global pooling, and computes three candidate global descriptors for each scan:

- `global_max  = local_feat.max(dim=0)[0]`     — Run 5 baseline
- `global_mean = local_feat.mean(dim=0)`        — candidate
- `global_std  = local_feat.std(dim=0, unbiased=False)` — Run 6 addition

Metrics computed across N=54 scans:
- Pairwise cosine similarity (N×N matrix, mean off-diagonal)
- Per-dimension variance across scans
- Per-dimension entropy (histogram, 50 bins)
- PCA: explained variance per component

### Results

| Metric | global_max | global_mean | global_std |
|---|---|---|---|
| Mean cosine similarity ↓ | **0.9938** | 0.9964 | 0.9978 |
| Mean per-dim variance ↑ | **0.0331** | 0.00078 | 0.00055 |
| Max per-dim variance ↑ | **0.443** | 0.007 | 0.015 |
| PCs for 80% variance ↑ | **>20** | 2 | 3 |
| PCs for 95% variance ↑ | **>20** | 4 | 5 |

Key ratios:
- `global_max` is **42× more variable** than `global_std` between scans (0.0331 vs 0.00055 mean per-dim variance)
- `global_max` is **24× more variable** than `global_mean`
- `global_max` needs >20 PCA components to explain 80% of its variance; `global_mean` and `global_std` need only 2–3

### Why Max Pooling is the Only Effective Descriptor After LayerNorm

**The core mismatch**: STD pooling was designed for a BatchNorm world. Our LayerNorm pipeline creates a different statistical environment.

`LayerNorm(C)` applied to a `(batch, C)` tensor normalises **each row independently** — each face's `C`-dimensional feature vector is zero-meaned and unit-normed across its own channels. This is the transpose of what BatchNorm does (`BatchNorm1d(C)` normalises each column across all batch elements, preserving per-channel between-face variance).

After the LayerNorm pipeline, each face's feature vector has unit magnitude. When we aggregate across all F faces:

- **Max pooling**: selects the peak activation per feature dimension — which face had the strongest signal for feature j? This varies between scans because different meshes have different geometric extremes. Max survives LayerNorm because it identifies *which face* rather than *how much on average*.

- **Mean/std pooling**: aggregates values from F independently unit-normalised rows. Because each face has been independently centred and scaled, the mean across faces converges toward a value determined by the network's weight geometry, not by the input geometry. The std similarly converges toward a fixed distribution regardless of which specific scan is being processed.

The empirical evidence: both `global_mean` and `global_std` need only 2–3 PCA components for 80% of their variance. The PCA scatter plot shows 4–5 tight clusters corresponding to patient identity (from the demo dataset), not to scan-to-scan geometric variation. These descriptors distinguish *which patient* rather than *which teeth configuration*.

`global_max` needs >20 components — its information is genuinely distributed across the full 448-dimensional space, and it varies meaningfully between scans of the same patient.

**Why upper arch was hit harder than lower**:

Upper arch converges more slowly by nature (Run 5 best checkpoint was ep98 vs ep74 for lower). The Run 6 global_mlp has 229,376 parameters instead of 114,688 — the extra 114k parameters receive a near-constant 448-dimensional input (the std half). The model must effectively learn to zero out those weights. This extra optimisation burden was tolerable for lower arch (which clicks at ep22 and has 78 more epochs to recover) but pushed upper arch past its convergence horizon within 100 epochs.

### Conclusion

**The hypothesis was rejected.** STD pooling does not add discriminative global information after the LayerNorm-based EdgeConv pipeline. This is a fundamental incompatibility between the normalisation choice (LayerNorm, per-sample) and the pooling statistic (std, across samples).

The same analysis showed that **mean pooling is equally degenerate** — it is not a viable replacement for std. Replacing Run 6's std with mean would produce the same failure mode.

The correct conclusion: given the LayerNorm architecture, **max pooling is the only pooling statistic from the learned feature space that carries discriminative global information**. Run 5's max-only global context is not a simplification of the paper — it is the correct design choice for a LayerNorm-normalised pipeline.

**Run 6 status**: documented, not adopted. Production architecture reverted to Run 5.

---

## Current Production Architecture

| Property | Value |
|---|---|
| Architecture | EdgeConv × 3 (9→64→128→256) + global max-pool + 2-layer classifier |
| Normalisation | LayerNorm throughout — no BatchNorm |
| Global context | `local_feat.max(dim=0)` → `(448,)` → Linear(448→256) + LayerNorm + LeakyReLU |
| Classifier | Linear(704→256) → Linear(256→128) → Linear(128→17) |
| Parameters | 502,033 |
| BatchNorm | 0 |
| LayerNorm | 9 |
| Running-stat buffers | 0 |

**Production checkpoints**:
- `checkpoints/meshsegnet_upper_best.pt` — epoch 98, val DSC 56.5%, test DSC 52.9%
- `checkpoints/meshsegnet_lower_best.pt` — epoch 74, val DSC 63.8%, test DSC 61.2%

---

## Future Research Directions

These are independent research experiments. All should branch from the Run 5 baseline.

**Incremental (low risk)**:
- Extended training: resume from Run 5 ep98, train to ep150. Upper arch was still improving slowly.
- Larger training set: integrate Poseidon3D dataset (200 additional cases, see CLAUDE.md).
- Augmentation: heavier augmentation for upper arch anterior region (smaller rotation + palate-aware flips).

**Architectural (experimental)**:
- Input-level global statistics: compute statistics of the raw `(F, 9)` input features (centroids, normals, curvatures) as a second global context stream. These are not LayerNorm-normalised and have real geometric variance. This is the one global descriptor the discriminability analysis suggests may be informative.
- Deeper encoder: add a 4th EdgeConv block (256→512) — paper uses 4 layers.
- Attention-based local aggregation (GAC, as in the original paper) instead of EdgeConv.

**Data-centric**:
- Wisdom tooth oversampling: class weighting helps but data scarcity is the ceiling. Need more scans with FDI 18/28/38/48 present.
- Lateral incisor disambiguation: FDI 12/22 and 32/42 score ~37–40%. Curriculum learning or tooth-specific augmentation could help.
