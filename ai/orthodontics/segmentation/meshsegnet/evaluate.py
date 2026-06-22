"""Evaluate a trained MeshSegNet checkpoint on the test split.

Usage
-----
    python -m ai.orthodontics.segmentation.meshsegnet.evaluate \\
        --checkpoint checkpoints/meshsegnet_upper_best.pt \\
        --data_dir   data/

Prints per-class DSC, mean tooth DSC, and overall accuracy.
Saves results to <checkpoint_dir>/eval_<arch>.json.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from .dataset import TeethSegDataset, collate_single
from .model import MeshSegNet
from .prepare_data import LOWER_CLS_TO_FDI, NUM_CLASSES, UPPER_CLS_TO_FDI

K_NEIGHBOURS = 6


@torch.no_grad()
def evaluate(
    model: MeshSegNet,
    loader: DataLoader,
    device: torch.device,
    arch: str,
) -> dict:
    model.eval()
    cls_to_fdi = UPPER_CLS_TO_FDI if arch == "upper" else LOWER_CLS_TO_FDI

    tp   = np.zeros(NUM_CLASSES, dtype=np.float64)
    pred = np.zeros(NUM_CLASSES, dtype=np.float64)
    gt   = np.zeros(NUM_CLASSES, dtype=np.float64)
    total_correct = 0
    total_faces   = 0

    for batch in loader:
        features = batch["features"].to(device)
        labels   = batch["labels"].to(device)
        knn_idx  = batch["knn_idx"].to(device)

        logits = model(features, knn_idx)
        preds  = logits.argmax(dim=-1)

        total_correct += int((preds == labels).sum())
        total_faces   += int(labels.numel())

        for c in range(NUM_CLASSES):
            tp[c]   += int(((preds == c) & (labels == c)).sum())
            pred[c] += int((preds == c).sum())
            gt[c]   += int((labels == c).sum())

    dsc = (2 * tp + 1e-6) / (pred + gt + 1e-6)
    accuracy = total_correct / max(total_faces, 1)

    results = {
        "accuracy": float(accuracy),
        "mean_tooth_dsc": float(dsc[1:].mean()),
        "gingiva_dsc": float(dsc[0]),
        "per_class": {},
    }

    print(f"\n{'='*52}")
    print(f"  MeshSegNet Evaluation — arch: {arch}")
    print(f"{'='*52}")
    print(f"  Overall accuracy : {accuracy*100:.2f}%")
    print(f"  Gingiva DSC      : {dsc[0]*100:.2f}%")
    print(f"  Mean tooth DSC   : {dsc[1:].mean()*100:.2f}%")
    print(f"\n  Per-tooth DSC:")

    for cls_idx in range(1, NUM_CLASSES):
        fdi = int(cls_to_fdi[cls_idx])
        if fdi == 0:
            continue
        d = float(dsc[cls_idx])
        flag = "⚠" if d < 0.80 else ""
        print(f"    FDI {fdi:2d} (class {cls_idx:2d}): {d*100:.1f}% {flag}")
        results["per_class"][str(fdi)] = d

    print(f"{'='*52}\n")
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True, type=Path)
    parser.add_argument("--data_dir",   required=True, type=Path)
    parser.add_argument("--split",      default="test", choices=["train", "val", "test"])
    parser.add_argument("--max_faces",  default=16_000, type=int)
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    ckpt = torch.load(args.checkpoint, map_location=device, weights_only=True)
    arch = ckpt.get("arch", "upper")
    k    = ckpt.get("k", K_NEIGHBOURS)

    model = MeshSegNet(
        in_features=ckpt.get("in_features", 9),
        num_classes=ckpt.get("num_classes", NUM_CLASSES),
        k=k,
    ).to(device)
    model.load_state_dict(ckpt["state_dict"])

    print(f"Checkpoint: {args.checkpoint.name}  (epoch {ckpt.get('epoch','?')}, val DSC {ckpt.get('val_dsc',0)*100:.1f}%)")

    ds = TeethSegDataset(args.data_dir, split=args.split, k_neighbours=k,
                         max_faces=args.max_faces, augment=False)
    dl = DataLoader(ds, batch_size=1, shuffle=False,
                    collate_fn=collate_single, num_workers=2)
    print(f"Evaluating on {len(ds)} {args.split} scans ...\n")

    results = evaluate(model, dl, device, arch)
    results["checkpoint"] = str(args.checkpoint)
    results["split"] = args.split
    results["epoch"] = ckpt.get("epoch")

    out_path = args.checkpoint.parent / f"eval_{arch}_{args.split}.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"Results saved to: {out_path}")


if __name__ == "__main__":
    main()
