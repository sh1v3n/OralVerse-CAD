"""Training script for MeshSegNet.

Usage
-----
    python -m ai.orthodontics.segmentation.meshsegnet.train \\
        --data_dir ai/orthodontics/segmentation/meshsegnet/data \\
        --arch     upper \\
        --out_dir  ai/orthodontics/segmentation/meshsegnet/checkpoints \\
        --epochs   100

See config.yaml for default hyperparameter values.
Supports --help without torch installed.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# Heavy imports deferred so --help works without torch installed.
try:
    import numpy as np
    import torch
    import torch.optim as optim
    from torch.utils.data import DataLoader

    from .dataset import TeethSegDataset, collate_single
    from .model import CombinedLoss, MeshSegNet

    _DEPS_OK = True
except ImportError as _e:
    _DEPS_OK  = False
    _DEPS_ERR = str(_e)

NUM_CLASSES  = 17
IN_FEATURES  = 9
K_NEIGHBOURS = 6


def _check_deps() -> None:
    if not _DEPS_OK:
        sys.exit(
            f"Missing dependency: {_DEPS_ERR}\n\n"
            "Install with:\n"
            "  pip install -r ai/orthodontics/segmentation/meshsegnet/requirements.txt"
        )


def train_epoch(model, loader, optimizer, loss_fn, device) -> float:
    model.train()
    total_loss = 0.0
    for batch in loader:
        features = batch["features"].to(device)
        labels   = batch["labels"].to(device)
        knn_idx  = batch["knn_idx"].to(device)

        optimizer.zero_grad()
        logits = model(features, knn_idx)
        loss   = loss_fn(logits, labels)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        total_loss += loss.item()
    return total_loss / len(loader)


def eval_epoch(model, loader, loss_fn, device) -> tuple[float, float]:
    """Returns (avg_loss, mean_DSC_over_tooth_classes)."""
    model.eval()
    total_loss = 0.0
    tp   = torch.zeros(NUM_CLASSES, device=device)
    pred = torch.zeros(NUM_CLASSES, device=device)
    gt   = torch.zeros(NUM_CLASSES, device=device)

    with torch.no_grad():
        for batch in loader:
            features = batch["features"].to(device)
            labels   = batch["labels"].to(device)
            knn_idx  = batch["knn_idx"].to(device)

            logits = model(features, knn_idx)
            total_loss += loss_fn(logits, labels).item()

            preds = logits.argmax(dim=-1)
            for c in range(NUM_CLASSES):
                tp[c]   += ((preds == c) & (labels == c)).sum()
                pred[c] += (preds == c).sum()
                gt[c]   += (labels == c).sum()

    dsc = (2 * tp[1:] + 1e-6) / (pred[1:] + gt[1:] + 1e-6)
    return total_loss / len(loader), dsc.mean().item()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train MeshSegNet for per-face tooth segmentation."
    )
    parser.add_argument("--data_dir",  required=True, type=Path,
                        help="Preprocessed .npz directory (output of preprocess.py)")
    parser.add_argument("--arch",      default="upper", choices=["upper", "lower"])
    parser.add_argument("--out_dir",   default=Path(__file__).parent / "checkpoints", type=Path)
    parser.add_argument("--epochs",    default=100, type=int)
    parser.add_argument("--lr",        default=1e-3, type=float)
    parser.add_argument("--k",         default=K_NEIGHBOURS, type=int)
    parser.add_argument("--max_faces", default=16_000, type=int,
                        help="Subsample meshes larger than this (memory/speed)")
    args = parser.parse_args()

    _check_deps()

    if torch.cuda.is_available():
        device = torch.device("cuda")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")
    print(f"Device: {device}  |  arch: {args.arch}")

    train_ds = TeethSegDataset(args.data_dir, split="train", k_neighbours=args.k,
                               max_faces=args.max_faces, augment=True)
    val_ds   = TeethSegDataset(args.data_dir, split="val",   k_neighbours=args.k,
                               max_faces=args.max_faces, augment=False)
    pin      = device.type == "cuda"
    train_dl = DataLoader(train_ds, batch_size=1, shuffle=True,
                          collate_fn=collate_single, num_workers=4, pin_memory=pin)
    val_dl   = DataLoader(val_ds,   batch_size=1, shuffle=False,
                          collate_fn=collate_single, num_workers=2, pin_memory=pin)

    print(f"Train: {len(train_ds)} | Val: {len(val_ds)}")

    model    = MeshSegNet(in_features=IN_FEATURES, num_classes=NUM_CLASSES, k=args.k).to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Parameters: {n_params:,}")

    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)
    loss_fn   = CombinedLoss(num_classes=NUM_CLASSES, ce_weight=0.5).to(device)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    best_dsc = 0.0
    log: list[dict] = []

    for epoch in range(1, args.epochs + 1):
        t0                  = time.time()
        train_loss          = train_epoch(model, train_dl, optimizer, loss_fn, device)
        val_loss, val_dsc   = eval_epoch(model, val_dl, loss_fn, device)
        scheduler.step()

        print(
            f"Epoch {epoch:3d}/{args.epochs} | "
            f"train={train_loss:.4f} | val={val_loss:.4f} | "
            f"DSC={val_dsc:.4f} | {time.time() - t0:.0f}s"
        )
        log.append({"epoch": epoch, "train_loss": train_loss,
                    "val_loss": val_loss, "val_dsc": val_dsc})

        if val_dsc > best_dsc:
            best_dsc  = val_dsc
            ckpt_path = args.out_dir / f"meshsegnet_{args.arch}_best.pt"
            torch.save({
                "epoch":       epoch,
                "state_dict":  model.state_dict(),
                "val_dsc":     val_dsc,
                "arch":        args.arch,
                "in_features": IN_FEATURES,
                "num_classes": NUM_CLASSES,
                "k":           args.k,
            }, ckpt_path)
            print(f"  saved best (DSC={val_dsc:.4f}) -> {ckpt_path}")

    (args.out_dir / f"log_{args.arch}.json").write_text(json.dumps(log, indent=2))
    print(f"\nBest val DSC: {best_dsc:.4f}")


if __name__ == "__main__":
    main()
