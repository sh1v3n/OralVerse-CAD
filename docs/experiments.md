# MeshSegNet Training Experiments

Chronological log — one entry per Kaggle run.  
Deep analysis, per-tooth metrics, and architectural investigations are in [`docs/research/segmentation_findings.md`](research/segmentation_findings.md).

---

## Summary Table

| Run | Commit | Key change | Upper val DSC | Lower val DSC | Outcome |
|---|---|---|---|---|---|
| 1 | `0307b18` | Baseline (BN, focal γ=2, lr=1e-3) | ~18% | ~18% | Val diverges ep 20 |
| 2 | `0698d7e` | Lower gamma (0.5), more dropout (0.2) | ~18% | ~18% | Val diverges ep 20 |
| 3 | `c5b97f5` | Lower LR (3e-4), longer warmup | ~18% | ~18% | Val diverges ep 15 |
| 4 | `1ea83ef` | Drop focal loss (γ=0) | ~18% | ~18% | Val diverges ep 15 |
| **5** | `35676b5` | **BatchNorm → LayerNorm** | **56.5%** | **63.8%** | **Divergence eliminated ✓ PRODUCTION** |
| 6 | `6c2f215` | STD pooling (max+std global context) | 33.5% | 64.2% | Upper −23pp; lower neutral. Not adopted. |

---

## Run 1–4: Baseline Hyperparameter Search

**Root cause of divergence (confirmed after Run 4)**: `nn.BatchNorm1d` accumulates running stats across training meshes. With `batch_size=1`, each val mesh is normalised against population averages from 1440 training scans rather than its own geometry. Dental scans vary substantially in arch size, crowding, and orientation — the normalisation mismatch worsens monotonically through training.

No hyperparameter change could fix a structural train/eval split in the normalisation layer. See `docs/research/segmentation_findings.md` §Runs 1–4 for the full diagnosis.

---

## Run 5 — BatchNorm → LayerNorm

**Date**: 2026-06-29 (prepared) / 2026-06-30 (evaluated)  
**Commit**: `35676b5`

**Change**: 4× `nn.BatchNorm1d` → `nn.LayerNorm` in `model.py` (EdgeConv blocks + classifier). `global_mlp` already had LayerNorm. No other changes.

**Configuration**: lr=3e-4, gamma=0.0, dropout=0.2, warmup=5, patience=30, epochs=100

**Results**:

| Arch | Best epoch | Val DSC | Test DSC | Gingiva DSC | Accuracy |
|---|---|---|---|---|---|
| Upper | 98 | 56.5% | 52.9% | 86.3% | 71.1% |
| Lower | 74 | 63.8% | 61.2% | 87.4% | 76.8% |

Val loss tracked train loss throughout — divergence completely eliminated.

**Conclusion**: Hypothesis confirmed. BatchNorm running-stats mismatch was the sole cause of all prior failures. 3× DSC improvement. **This is the validated production baseline.**

---

## Run 6 — STD Pooling

**Date**: 2026-06-30  
**Commit**: `6c2f215`

**Change**: Add `std(dim=0)` to global context alongside `max(dim=0)`, concatenating to produce `(896,)` input to `global_mlp` (was `(448,)`). Params: 502,033 → 616,721.

**Motivation**: The original 2020 MICCAI paper uses `cat(max-pool, std-pool)` for the global context. Run 5 used max-pool only.

**Configuration**: Identical to Run 5.

**Results**:

| Arch | Best epoch | Val DSC | vs Run 5 |
|---|---|---|---|
| Upper | 98 | 33.5% | **−23pp** |
| Lower | 85 | 64.2% | +0.4pp |

Upper arch training curve: DSC crawled from 3% to 33.5% with no phase transition. Val loss stuck at ~0.64 throughout. Lower arch had a normal phase transition at epoch 22.

**Root cause analysis**: `std(dim=0)` over LayerNorm-normalised features is near-degenerate — cosine similarity 0.9978 between any two meshes, and 95% of its variance fits in 5 PCA components. `global_max` has cosine similarity 0.9938 and remains >20-dimensional. Both `global_mean` (cosine sim 0.9964) and `global_std` collapse to ~2D signals after the LayerNorm pipeline. Adding a near-constant 448-dimensional input doubled `global_mlp` parameter count, increasing optimisation burden without adding signal. Upper arch (harder, slower convergence) failed to converge in 100 epochs; lower arch (easier) survived the extra noise.

**Full analysis**: `docs/research/segmentation_findings.md` §Run 6 and §Analysis: Global Descriptor Discriminability.  
**Analysis script**: `ai/orthodontics/segmentation/meshsegnet/analyze_global_descriptors.py`

**Conclusion**: Not adopted. Architecture reverted to Run 5. Production baseline unchanged.
