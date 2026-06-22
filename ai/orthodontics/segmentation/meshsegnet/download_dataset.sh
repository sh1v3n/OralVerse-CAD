#!/usr/bin/env bash
# Download the 3DTeethSeg22 challenge dataset from Zenodo.
#
# Usage:
#   bash download_dataset.sh [OUTPUT_DIR]
#
# OUTPUT_DIR defaults to: ai/orthodontics/segmentation/meshsegnet/raw_data
#
# The dataset lives at:
#   https://zenodo.org/record/7151927
#
# Files downloaded (~8 GB total):
#   - 01.zip through 04.zip  (upper + lower OBJ meshes + JSON labels)
#
# After extraction the layout will be:
#   <OUTPUT_DIR>/
#     <case_id>/
#       <case_id>_upper.obj
#       <case_id>_upper.json
#       <case_id>_lower.obj
#       <case_id>_lower.json

set -euo pipefail

ZENODO_RECORD="7151927"
BASE_URL="https://zenodo.org/record/${ZENODO_RECORD}/files"

# File list — update if Zenodo record changes
FILES=(
  "01.zip"
  "02.zip"
  "03.zip"
  "04.zip"
)

OUT_DIR="${1:-$(dirname "$0")/raw_data}"
mkdir -p "$OUT_DIR"

echo "==> Downloading 3DTeethSeg22 dataset to: $OUT_DIR"
echo "    Source: https://zenodo.org/record/${ZENODO_RECORD}"
echo ""

for f in "${FILES[@]}"; do
  url="${BASE_URL}/${f}?download=1"
  dest="${OUT_DIR}/${f}"

  if [[ -f "$dest" ]]; then
    echo "[skip] $f already exists"
    continue
  fi

  echo "[download] $f ..."
  curl -L --progress-bar -o "$dest" "$url"
  echo "[ok] $f"
done

echo ""
echo "==> Extracting archives ..."
for f in "${FILES[@]}"; do
  dest="${OUT_DIR}/${f}"
  echo "[unzip] $f"
  unzip -q -o "$dest" -d "$OUT_DIR"
done

echo ""
echo "==> Done. Dataset extracted to: $OUT_DIR"
echo ""
echo "Next step — preprocess into .npz files:"
echo ""
echo "  python -m ai.orthodontics.segmentation.meshsegnet.prepare_data \\"
echo "    --data_dir $OUT_DIR \\"
echo "    --out_dir  ai/orthodontics/segmentation/meshsegnet/data"
