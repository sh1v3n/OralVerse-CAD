#!/usr/bin/env bash
# RunPod A100 startup script for MeshSegNet training.
#
# ── How to use ────────────────────────────────────────────────────────────────
#
# 1. On RunPod, create a pod:
#      Template : PyTorch 2.4.1 / CUDA 12.1
#      GPU      : A100 SXM 80GB  (or RTX 4090 for a cheaper run)
#      Disk     : 50 GB container + 50 GB volume
#
# 2. In the pod terminal, clone the repo and run this script:
#
#      git clone <your-repo-url> /workspace/OralVerse-1
#      cd /workspace/OralVerse-1
#      bash ai/orthodontics/segmentation/meshsegnet/setup_runpod.sh
#
# 3. The script will:
#      - Install Python deps
#      - Download + preprocess 3DTeethSeg22
#      - Train upper and lower arch models
#      - Save checkpoints to meshsegnet/checkpoints/
#
# 4. Copy checkpoints back to your machine:
#
#      # From your local machine (RunPod exposes SSH):
#      scp -P <port> root@<pod-ip>:/workspace/OralVerse-1/ai/orthodontics/segmentation/meshsegnet/checkpoints/*.pt \
#          ai/orthodontics/segmentation/meshsegnet/checkpoints/
#
# ── Estimated cost ───────────────────────────────────────────────────────────
#   A100 80GB  ~$1.89/hr  ×  ~6 hrs  ≈  $12 total
#   RTX 4090   ~$0.74/hr  ×  ~10 hrs ≈  $7  total  (slower, same quality)
#
# ── Expected results ─────────────────────────────────────────────────────────
#   Target: val DSC > 0.90 on tooth classes (literature: 0.93–0.96)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
SEGNET_DIR="${REPO_ROOT}/ai/orthodontics/segmentation/meshsegnet"
DATA_DIR="${SEGNET_DIR}/data"
RAW_DIR="${SEGNET_DIR}/raw_data"
CKPT_DIR="${SEGNET_DIR}/checkpoints"

echo "============================================================"
echo " OralVerse-CAD — MeshSegNet Training Setup"
echo " Root: ${REPO_ROOT}"
echo "============================================================"
echo ""

# ── 1. Python deps ────────────────────────────────────────────────────────────
echo "[1/4] Installing Python dependencies ..."
pip install -q \
  trimesh==4.4.3 \
  tqdm==4.66.5 \
  scikit-learn==1.5.2 \
  numpy==1.26.4

echo "      torch version: $(python3 -c 'import torch; print(torch.__version__)')"
echo "      CUDA available: $(python3 -c 'import torch; print(torch.cuda.is_available())')"
echo "      GPU: $(python3 -c 'import torch; print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none")')"
echo ""

# ── 2. Download dataset ───────────────────────────────────────────────────────
echo "[2/4] Downloading 3DTeethSeg22 dataset (~8 GB) ..."
mkdir -p "$RAW_DIR"

ZENODO_BASE="https://zenodo.org/record/7151927/files"
for part in 01 02 03 04; do
  zip_file="${RAW_DIR}/${part}.zip"
  if [[ -f "$zip_file" ]]; then
    echo "      [skip] ${part}.zip already downloaded"
  else
    echo "      Downloading ${part}.zip ..."
    curl -L --progress-bar -o "$zip_file" "${ZENODO_BASE}/${part}.zip?download=1"
  fi
  echo "      Extracting ${part}.zip ..."
  unzip -q -o "$zip_file" -d "$RAW_DIR"
done
echo "      Dataset ready at: $RAW_DIR"
echo ""

# ── 3. Preprocess ─────────────────────────────────────────────────────────────
echo "[3/4] Preprocessing scans → .npz files ..."
cd "$REPO_ROOT"
python3 -m ai.orthodontics.segmentation.meshsegnet.prepare_data \
  --data_dir "$RAW_DIR" \
  --out_dir  "$DATA_DIR"
echo "      Preprocessed data at: $DATA_DIR"
echo ""

# ── 4. Train ──────────────────────────────────────────────────────────────────
echo "[4/4] Training MeshSegNet ..."
mkdir -p "$CKPT_DIR"

for arch in upper lower; do
  echo ""
  echo "  --- Training arch: $arch ---"
  python3 -m ai.orthodontics.segmentation.meshsegnet.train \
    --data_dir "$DATA_DIR" \
    --arch     "$arch" \
    --out_dir  "$CKPT_DIR" \
    --epochs   100 \
    --lr       1e-3 \
    --max_faces 16000
done

echo ""
echo "============================================================"
echo " Training complete!"
echo " Checkpoints saved to: $CKPT_DIR"
echo ""
echo " Files to copy back to your local machine:"
ls "${CKPT_DIR}"/*.pt 2>/dev/null || echo "  (no .pt files found — check training logs)"
echo ""
echo " To activate MeshSegNet in production:"
echo "   ORALVERSE_SEGMENTER=meshsegnet"
echo "   MESHSEGNET_WEIGHTS=/path/to/meshsegnet_upper_best.pt"
echo "============================================================"
