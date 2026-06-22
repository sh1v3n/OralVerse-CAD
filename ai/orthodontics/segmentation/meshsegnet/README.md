# MeshSegNet — per-tooth segmentation

EdgeConv graph neural network for labelling every face of a dental STL mesh with its FDI tooth number. Trained on [3DTeethSeg22](https://zenodo.org/record/7151927) (~1800 clinical scans).

## Files

| File | Purpose |
|---|---|
| `model.py` | `MeshSegNet` + `CombinedLoss` (CE + Dice) |
| `dataset.py` | `TeethSegDataset` — loads `.npz` files produced by preprocess |
| `preprocess.py` | OBJ + JSON → `.npz` feature files |
| `train.py` | Training loop — AdamW + CosineAnnealingLR |
| `evaluate.py` | Per-class DSC + accuracy on a split |
| `export_model.py` | Verify a checkpoint before deployment |
| `infer.py` | `MeshSegNetSegmenter` — production inference wrapper |
| `config.yaml` | Default hyperparameters |
| `requirements.txt` | Python dependencies |
| `train_kaggle.ipynb` | One-click training on Kaggle (free P100 GPU) |
| `download_dataset.sh` | Fetch 3DTeethSeg22 from Zenodo |

`prepare_data.py` and `segmenter.py` are backward-compatible shims that re-export from `preprocess.py` and `infer.py`.

## Quickstart

```bash
pip install -r requirements.txt
```

### 1. Download dataset

```bash
bash download_dataset.sh            # ~8 GB, saves to raw_data/
```

### 2. Preprocess

```bash
python -m ai.orthodontics.segmentation.meshsegnet.preprocess \
    --data_dir ai/orthodontics/segmentation/meshsegnet/raw_data \
    --out_dir  ai/orthodontics/segmentation/meshsegnet/data
```

### 3. Train

```bash
# Upper arch
python -m ai.orthodontics.segmentation.meshsegnet.train \
    --data_dir ai/orthodontics/segmentation/meshsegnet/data \
    --arch upper --epochs 100

# Lower arch
python -m ai.orthodontics.segmentation.meshsegnet.train \
    --data_dir ai/orthodontics/segmentation/meshsegnet/data \
    --arch lower --epochs 100
```

Checkpoints saved to `checkpoints/meshsegnet_{arch}_best.pt` (best val DSC).

### 4. Evaluate

```bash
python -m ai.orthodontics.segmentation.meshsegnet.evaluate \
    --checkpoint checkpoints/meshsegnet_upper_best.pt \
    --data_dir   ai/orthodontics/segmentation/meshsegnet/data
```

### 5. Verify before deploy

```bash
python -m ai.orthodontics.segmentation.meshsegnet.export_model \
    --checkpoint checkpoints/meshsegnet_upper_best.pt
```

### 6. Activate in production

```bash
export ORALVERSE_SEGMENTER=meshsegnet
export MESHSEGNET_WEIGHTS=/path/to/checkpoints/meshsegnet_upper_best.pt
```

## Free GPU training

Upload `train_kaggle.ipynb` to [Kaggle](https://kaggle.com) → New Notebook.  
Settings → Accelerator: **GPU P100** → Run all. (~5 hrs, free 30 hrs/week)

See the notebook for full instructions.

## Architecture

```
Input: (F, 9) per-face features
  centroid xyz (normalised)
  face normal xyz
  log face area (normalised)
  principal curvatures κ₁, κ₂

EdgeConv(9→64) → EdgeConv(64→128) → EdgeConv(128→256)
  ↓
Local features: cat([x1, x2, x3])  →  (F, 448)
Global context: max-pool → MLP    →  (F, 256)
Classifier: (F, 704) → (F, 17)
```

Each EdgeConv: for face i with k nearest neighbours j:
`edge[i,j] = MLP([xᵢ, xⱼ - xᵢ])`, then `xᵢ' = max_j(edge[i,j])`

## Expected results

Literature (3DTeethSeg22 test set): mean tooth DSC **0.93–0.96**  
With 450 scans + 50 epochs (Kaggle free tier): ~0.87–0.91

## FDI class mapping

Both arches use 17 classes (0=gingiva, 1–16=teeth):

| Class | Upper FDI | Lower FDI |
|---|---|---|
| 1–8 | 11–18 (Q1) | 41–48 (Q4) |
| 9–16 | 21–28 (Q2) | 31–38 (Q3) |
