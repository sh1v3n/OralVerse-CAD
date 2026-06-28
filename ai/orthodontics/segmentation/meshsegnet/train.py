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
        torch.nn.utils.clip_grad_norm_(model.parameters(), 0.5)
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


def compute_class_weights(files, num_classes: int, cap: float = 10.0):
    """Inverse-sqrt-frequency per-class weights from the training labels.

    Reads only the ``labels`` array from each .npz (cheap), so wisdom teeth and
    other rare classes get upweighted in the focal CE term. Present classes are
    normalised to mean 1 and clipped to ``cap``; classes absent from training
    are left neutral (1.0).
    """
    counts = np.zeros(num_classes, dtype=np.float64)
    for p in files:
        lbl = np.load(p, allow_pickle=False)["labels"].astype(np.int64)
        counts += np.bincount(lbl, minlength=num_classes)[:num_classes]

    present = counts > 0
    freq = counts / max(counts.sum(), 1.0)
    weights = np.where(present, 1.0 / np.sqrt(freq + 1e-6), 1.0)
    if present.any():
        weights[present] /= weights[present].mean()
    weights = np.clip(weights, 0.0, cap)
    return torch.tensor(weights, dtype=torch.float32)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train MeshSegNet for per-face tooth segmentation."
    )
    parser.add_argument("--data_dir",  required=True, type=Path,
                        help="Preprocessed .npz directory (output of preprocess.py)")
    parser.add_argument("--arch",      default="upper", choices=["upper", "lower"])
    parser.add_argument("--out_dir",   default=Path(__file__).parent / "checkpoints", type=Path)
    parser.add_argument("--epochs",    default=100, type=int)
    parser.add_argument("--lr",        default=3e-4, type=float)
    parser.add_argument("--k",         default=K_NEIGHBOURS, type=int)
    parser.add_argument("--max_faces", default=16_000, type=int,
                        help="Subsample meshes larger than this (memory/speed)")
    parser.add_argument("--gamma",     default=2.0, type=float,
                        help="Focal-loss focusing parameter (0 = plain CE)")
    parser.add_argument("--dropout",   default=0.1, type=float,
                        help="Dropout in the EdgeConv encoder + global MLP")
    parser.add_argument("--warmup_epochs", default=10, type=int,
                        help="Linear LR warmup epochs before cosine decay")
    parser.add_argument("--patience",  default=30, type=int,
                        help="Early stop after N epochs without DSC improvement")
    parser.add_argument("--min_delta", default=5e-3, type=float,
                        help="Minimum DSC improvement to reset patience")
    parser.add_argument("--class_weights", action=argparse.BooleanOptionalAction,
                        default=True,
                        help="Weight the focal CE term by inverse-sqrt class frequency")
    parser.add_argument("--resume", default=None, type=Path,
                        help="Path to a *_latest.pt checkpoint to resume training from")
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

    model    = MeshSegNet(in_features=IN_FEATURES, num_classes=NUM_CLASSES,
                          k=args.k, dropout=args.dropout).to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Parameters: {n_params:,}")

    # Per-class focal weights (rare wisdom teeth get upweighted).
    alpha = None
    if args.class_weights:
        alpha = compute_class_weights(train_ds.files, NUM_CLASSES).to(device)
        print("Class weights:", np.round(alpha.cpu().numpy(), 2).tolist())

    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)

    # LR schedule: linear warmup → cosine decay.
    warmup_epochs = max(0, min(args.warmup_epochs, args.epochs - 1))
    cosine = optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=max(1, args.epochs - warmup_epochs), eta_min=1e-5)
    if warmup_epochs > 0:
        warmup = optim.lr_scheduler.LinearLR(
            optimizer, start_factor=0.01, total_iters=warmup_epochs)
        scheduler = optim.lr_scheduler.SequentialLR(
            optimizer, [warmup, cosine], milestones=[warmup_epochs])
    else:
        scheduler = cosine

    loss_fn = CombinedLoss(num_classes=NUM_CLASSES, ce_weight=0.5,
                           gamma=args.gamma, alpha=alpha).to(device)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    best_dsc      = 0.0
    best_val_loss = float("inf")
    patience_left = args.patience
    start_epoch   = 1
    log: list[dict] = []

    # Resume from a previous run's latest checkpoint if provided.
    if args.resume:
        if not args.resume.is_file():
            sys.exit(f"Resume checkpoint not found: {args.resume}")
        ckpt = torch.load(args.resume, map_location=device)
        model.load_state_dict(ckpt["state_dict"])
        optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        scheduler.load_state_dict(ckpt["scheduler_state_dict"])
        start_epoch   = ckpt["epoch"] + 1
        best_dsc      = ckpt.get("best_dsc", 0.0)
        best_val_loss = ckpt.get("best_val_loss", float("inf"))
        patience_left = ckpt.get("patience_left", args.patience)
        log           = ckpt.get("log", [])
        print(f"Resumed from epoch {ckpt['epoch']} "
              f"(best DSC={best_dsc:.4f}, best val loss={best_val_loss:.4f})")

    for epoch in range(start_epoch, args.epochs + 1):
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

        # Save the best checkpoint by clinical metric (DSC).
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

        # Early stopping on DSC plateau — more stable than val loss under focal loss.
        if val_dsc > best_dsc - args.min_delta:
            patience_left = args.patience
        else:
            patience_left -= 1
            if patience_left <= 0:
                print(f"  early stop: DSC has not improved for "
                      f"{args.patience} epochs (best DSC={best_dsc:.4f})")
                break

        # Save latest checkpoint every epoch for resume support.
        torch.save({
            "epoch":                epoch,
            "state_dict":           model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scheduler_state_dict": scheduler.state_dict(),
            "best_dsc":             best_dsc,
            "best_val_loss":        best_val_loss,
            "patience_left":        patience_left,
            "log":                  log,
            "arch":                 args.arch,
            "in_features":          IN_FEATURES,
            "num_classes":          NUM_CLASSES,
            "k":                    args.k,
        }, args.out_dir / f"meshsegnet_{args.arch}_latest.pt")

    (args.out_dir / f"log_{args.arch}.json").write_text(json.dumps(log, indent=2))
    print(f"\nBest val DSC: {best_dsc:.4f}  |  best val loss: {best_val_loss:.4f}")


if __name__ == "__main__":
    main()
