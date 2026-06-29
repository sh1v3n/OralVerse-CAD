# MeshSegNet Training Experiments

Controlled experiment log for OralVerse tooth segmentation (Track C).  
One entry per Kaggle run. Independent variable is listed explicitly for each run.

---

## Runs 1–4 — Baseline (hyperparameter search)

**Branch**: `claude/features`  
**Dataset**: Teeth3DS+ — 1800 scans, 1440 train / 180 val / 180 test (seed=42, fixed)  
**Architecture**: MeshSegNet — 3× EdgeConv (64→128→256), global max-pool, 2-layer classifier  
**Shared configuration**:

| Setting | Value |
|---|---|
| `in_features` | 9 (centroid + normal + log_area + κ₁ + κ₂) |
| `num_classes` | 17 (0=gingiva, 1–16=teeth) |
| `k_neighbours` | 6 |
| `max_faces` | 12 000 (downsampled at load) |
| `batch_size` | 1 (variable face count) |
| `weight_decay` | 1e-4 |
| `ce_weight` | 0.5 (focal-CE + Dice blend) |
| `class_weights` | True (inverse-sqrt frequency) |
| Augmentation | flip + rotation + scale + jitter (train only) |
| Early stopping | DSC-based, `min_delta=5e-3` |

**Results across all 4 runs (observed)**:

| Run | Commits | LR | Gamma | Dropout | Warmup | Patience | Observed |
|---|---|---|---|---|---|---|---|
| 1 | `0307b18` baseline | 1e-3 | 2.0 | 0.1 | 5 | 20 | val diverges ~ep 20 |
| 2 | `0698d7e` | 1e-3 | 0.5 | 0.2 | 10 | 30 | val diverges ~ep 20 |
| 3 | `c5b97f5` | 3e-4 | 0.5 | 0.2 | 10 | 30 | val diverges ~ep 15 |
| 4 | `1ea83ef` | 3e-4 | 0.0 | 0.2 | 5 | 30 | val diverges ~ep 15 |

All 4 runs showed the same failure signature:
- Train loss decreases steadily toward ~0.5
- Val loss diverges to 1.5+ by epoch 15–25
- Mean tooth DSC plateaus at ~18–20%
- Hyperparameter changes had zero effect on the divergence pattern

**Root cause (confirmed)**: `nn.BatchNorm1d` running-stats mismatch.

With `batch_size=1`, each training step normalises using the statistics of a single mesh.
The running mean/var buffers accumulate an average across all training meshes.
At eval time, the model uses those accumulated stats — which are a poor approximation
of any individual mesh's geometry distribution. Dental scans vary substantially in arch
size, tooth count, crowding, and orientation. The larger the accumulated running stats
diverge from the current scan's stats, the worse the normalisation → the model behaves
differently in train vs. eval mode through no fault of the loss function or optimiser.

The `global_mlp` already used `LayerNorm` (the original author noted it received a
single `(1, 256)` vector). The same fix was not applied to the 4 remaining `BatchNorm1d`
layers in the EdgeConv blocks and the per-face classifier.

---

## Run 5 — Fix 1: BatchNorm → LayerNorm

**Status**: Completed — **SUCCESS**  
**Date**: 2026-06-29 (prepared) / 2026-06-30 (results)  
**Branch**: `claude/features`  
**Commit**: `35676b5`

### Hypothesis

The single cause of train/val divergence is `nn.BatchNorm1d` accumulating running stats
that misrepresent individual mesh geometry at eval time. Replacing all `BatchNorm1d`
with `LayerNorm` eliminates the train/eval mismatch entirely, because `LayerNorm`
has no state — each forward pass (train or eval) normalises identically using the
current sample's own feature statistics.

### Independent variable

**`model.py` only**. The only architectural change is:

| Location | Before | After |
|---|---|---|
| `EdgeConv.mlp[1]` | `nn.BatchNorm1d(out_ch)` | `nn.LayerNorm(out_ch)` |
| `EdgeConv.mlp[4]` | `nn.BatchNorm1d(out_ch)` | `nn.LayerNorm(out_ch)` |
| `MeshSegNet.classifier[1]` | `nn.BatchNorm1d(256)` | `nn.LayerNorm(256)` |
| `MeshSegNet.classifier[4]` | `nn.BatchNorm1d(128)` | `nn.LayerNorm(128)` |

`global_mlp` already had `LayerNorm` — unchanged.

### Configuration (identical to Run 4)

| Setting | Value |
|---|---|
| `lr` | 3e-4 |
| `gamma` | 0.0 (plain weighted CE + Dice) |
| `dropout` | 0.2 |
| `warmup_epochs` | 5 |
| `patience` | 30 |
| `max_faces` | 12 000 |
| `epochs` | 100 |
| `class_weights` | True |
| Random seed | 42 (split fixed) |
| Dataset split | 1440 train / 180 val / 180 test |

### Trainable parameter count

502 033 — unchanged from Run 4. `LayerNorm(C)` and `BatchNorm1d(C)` both have
`2C` trainable parameters (weight + bias). The model loses 4 pairs of non-trainable
running-stat buffers, which is intentional.

### Expected outcome

**Diagnostic signal to watch (first 15 epochs)**:

| Epoch | Expected val_loss | Train divergence? |
|---|---|---|
| 1–5 | ~1.6–1.8 (warmup) | tracking train |
| 5–10 | ~1.0–1.3 (decreasing) | gap < 0.3 |
| 10–20 | <0.9 | tracking |
| 20+ | continuing to fall | tracking |

The definitive "fix confirmed" signal: **val_loss stays below 1.1 by epoch 15**  
(previous runs: val_loss reached 1.5–1.8 by epoch 15).

### Success criteria

| Outcome | Definition | Interpretation |
|---|---|---|
| **Success** | val_loss ≤ 1.1 at epoch 15; DSC ≥ 35% at run end | BatchNorm was the sole cause. Proceed to Fix 2 (STD pooling) |
| **Partial success** | val_loss no longer diverges explosively but DSC 20–34% | BatchNorm was the cause; secondary limiting factor (capacity, data size). Investigate before Fix 2 |
| **Failure** | Same divergence as Runs 1–4 (val_loss > 1.3 by epoch 15) | Hypothesis was wrong. Stop and re-investigate: check data pipeline, label mapping, KNN graph construction |

### Metrics to log each epoch

1. `train_loss` — should decrease monotonically (with noise)
2. `val_loss` — primary diagnostic; must not diverge
3. `val_dsc` (mean tooth DSC, classes 1–16) — clinical metric
4. `val_loss − train_loss` gap — should stay below 0.3 after warmup

### What to do after this run

- **If success**: implement Fix 2 (add STD pooling to global context alongside existing max-pool, as per the original 2020 MICCAI paper). This is an independent architectural improvement that was identified as a secondary issue.
- **If partial success**: analyse which tooth classes are still failing (per-class DSC from `evaluate.py`). Decide whether to scale the dataset first or proceed to Fix 2.
- **If failure**: do not proceed. Re-read the preprocessing pipeline (`preprocess.py`) and data loading (`dataset.py`) with fresh eyes. Check that `fdi_to_class` maps are consistent between upper and lower arches and that kNN indices are built from normalised centroids.

### Verification performed before launch

- [x] Forward pass (train mode): shape `(5000, 17)`, no NaNs, loss valid, backward OK
- [x] Forward pass (eval mode): shape `(5000, 17)`, no NaNs
- [x] Eval determinism: same input → max delta `0.00e+00` (LayerNorm is stateless)
- [x] `BatchNorm1d` remaining: **0**
- [x] `LayerNorm` count: **9** (6 EdgeConv + 1 global_mlp + 2 classifier)
- [x] Buffer elements (running stats): **0**
- [x] `git diff HEAD`: exactly 4 lines changed, only `model.py`
- [x] `train.py`, `dataset.py`, `preprocess.py`, `evaluate.py`, `infer.py`, `train_kaggle.ipynb`: unchanged

### Results (test split, 180 scans)

| Metric | Upper | Lower |
|---|---|---|
| Best epoch | 98 | 74 |
| Val DSC (best) | 56.5% | 63.8% |
| **Mean tooth DSC** | **52.9%** | **61.2%** |
| Gingiva DSC | 86.3% | 87.4% |
| Overall accuracy | 71.1% | 76.8% |

**Per-tooth DSC — Upper:**

| FDI | DSC | FDI | DSC |
|---|---|---|---|
| 11 | 45.1% | 21 | 49.9% |
| 12 | 36.7% | 22 | 39.1% |
| 13 | 54.5% | 23 | 56.5% |
| 14 | 68.4% | 24 | 64.7% |
| 15 | 67.9% | 25 | 65.2% |
| 16 | 71.2% | 26 | 72.1% |
| 17 | 65.3% | 27 | 65.3% |
| 18 | **8.7%** | 28 | **16.1%** |

**Per-tooth DSC — Lower:**

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

### Key observations

- Val loss tracked train loss throughout all 100 epochs — divergence **completely eliminated**
- Molars (FDI 16/26/36/46): strongest at 71–77% — large, abundant, distinctive
- Lateral incisors (FDI 12/22): weakest regular teeth at 37–40% — small, symmetric, easily confused
- Wisdom teeth (FDI 18/28/38/48): 9–16% — absent in many training scans; class weighting helps but cannot compensate for scarcity

### Conclusion

**Hypothesis confirmed.** BatchNorm running-stats mismatch was the primary cause of train/val divergence. Replacing all `BatchNorm1d` with `LayerNorm` tripled mean tooth DSC from ~18–20% to 52–61%. This is the **validated baseline architecture**. Future experiments must branch from this.

Checkpoints: `meshsegnet_upper_best.pt` (epoch 98) + `meshsegnet_lower_best.pt` (epoch 74)

---

## Run 6 — Fix 2: STD pooling

**Status**: Ready to launch  
**Date (prepared)**: 2026-06-30  
**Branch**: `claude/features`  
**Baseline**: Run 5 (`35676b5`)

### Hypothesis

The original 2020 MICCAI MeshSegNet paper uses `cat([max-pool, std-pool])` over all faces to produce the global context vector, feeding a `(896,)` vector into the global MLP. The current implementation uses only `max-pool`, producing a `(448,)` vector — this halves the expressiveness of the global representation.

Max pooling captures the strongest feature activation anywhere on the mesh ("peak signal"). STD pooling captures the spread/variance of features across all faces ("how heterogeneous is this mesh"). Together they give the model both the extremes and the dispersion of global geometry — relevant for distinguishing wisdom teeth (high local variance, absent in many scans) from central incisors (low variance, bilaterally symmetric).

### Independent variable

**`model.py` only**. Two targeted edits:

1. `global_mlp` Linear input: `local_ch` (448) → `local_ch * 2` (896)
2. `forward()` global context block: add `std(dim=0, unbiased=False)` and concatenate with max

Everything downstream of `global_mlp` is unaffected — its output remains `(1, 256)`, `combined` remains `(F, 704)`, and the classifier is unchanged.

### Configuration (identical to Run 5)

| Setting | Value |
|---|---|
| `lr` | 3e-4 |
| `gamma` | 0.0 |
| `dropout` | 0.2 |
| `warmup_epochs` | 5 |
| `patience` | 30 |
| `max_faces` | 12 000 |
| `epochs` | 100 |
| `class_weights` | True |
| Random seed | 42 |

### Parameter count

| Component | Before | After |
|---|---|---|
| `global_mlp` Linear | 448 × 256 = 114,688 | 896 × 256 = 229,376 |
| Everything else | 387,345 | 387,345 |
| **Total** | **502,033** | **616,721** |

### Outcome definitions

| Outcome | Definition |
|---|---|
| **Success** | Mean tooth DSC improves ≥ 3pp on either arch vs. Run 5 |
| **Neutral** | DSC within ±2pp — STD pooling has no measurable effect at this scale |
| **Failure** | DSC drops — implementation error or interaction with LayerNorm; investigate before Run 7 |

### Metrics to monitor

Primary: mean tooth DSC (upper + lower), val loss trend epochs 1–20  
Secondary: per-class DSC for lateral incisors (FDI 12/22/32/42) and wisdom teeth (FDI 18/28/38/48)
