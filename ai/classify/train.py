"""Phase 3 — EfficientNet-B0 fine-tuning on the 6-class OPG classification split.

The folder layout is one subdir per class (ImageFolder format). The dataset is
not pre-split, so we do a stratified 80/10/10 split here and persist indices to
ensure reproducibility.

Run:
    python ai/classify/train.py

Override via env:
    EPOCHS=40 BATCH=32 LR=3e-4 python ai/classify/train.py
"""
from __future__ import annotations

import json
import os
import random
from collections import Counter
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, transforms
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "opg" / "classification"
OUT_DIR = ROOT / "ai" / "classify" / "runs"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SEED = 42
random.seed(SEED)
torch.manual_seed(SEED)


def stratified_split(targets: list[int], ratios=(0.8, 0.1, 0.1)) -> tuple[list[int], list[int], list[int]]:
    by_class: dict[int, list[int]] = {}
    for i, t in enumerate(targets):
        by_class.setdefault(t, []).append(i)
    train, val, test = [], [], []
    for cls, idxs in by_class.items():
        random.shuffle(idxs)
        n = len(idxs)
        n_train = int(n * ratios[0])
        n_val = int(n * ratios[1])
        train += idxs[:n_train]
        val += idxs[n_train:n_train + n_val]
        test += idxs[n_train + n_val:]
    return train, val, test


def main() -> None:
    epochs = int(os.environ.get("EPOCHS", "30"))
    batch = int(os.environ.get("BATCH", "16"))
    lr = float(os.environ.get("LR", "3e-4"))
    device = "cuda" if torch.cuda.is_available() else "cpu"

    weights = EfficientNet_B0_Weights.IMAGENET1K_V1
    train_tf = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomResizedCrop(224, scale=(0.8, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.2, contrast=0.2),
        transforms.ToTensor(),
        transforms.Normalize(weights.transforms().mean, weights.transforms().std),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(weights.transforms().mean, weights.transforms().std),
    ])

    full_train = datasets.ImageFolder(str(DATA_DIR), transform=train_tf)
    full_eval = datasets.ImageFolder(str(DATA_DIR), transform=eval_tf)
    classes = full_train.classes
    targets = [t for _, t in full_train.samples]
    train_idx, val_idx, test_idx = stratified_split(targets)

    train_ds = Subset(full_train, train_idx)
    val_ds = Subset(full_eval, val_idx)
    test_ds = Subset(full_eval, test_idx)

    train_loader = DataLoader(train_ds, batch_size=batch, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_ds, batch_size=batch, num_workers=2)
    test_loader = DataLoader(test_ds, batch_size=batch, num_workers=2)

    # class-weighted loss for imbalance (Healthy 223 vs Fractured 13)
    counts = Counter([targets[i] for i in train_idx])
    n = sum(counts.values())
    weight = torch.tensor([n / (len(classes) * counts[c]) for c in range(len(classes))], device=device)
    criterion = nn.CrossEntropyLoss(weight=weight)

    model = efficientnet_b0(weights=weights)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(classes))
    model = model.to(device)
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    best_val = 0.0
    best_path = OUT_DIR / "best.pt"
    for ep in range(1, epochs + 1):
        model.train()
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            loss = criterion(model(x), y)
            loss.backward()
            optimizer.step()
        scheduler.step()

        model.eval()
        correct = total = 0
        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                pred = model(x).argmax(1)
                correct += (pred == y).sum().item()
                total += y.size(0)
        val_acc = correct / max(total, 1)
        print(f"epoch {ep:02d}  val_acc={val_acc:.4f}")
        if val_acc > best_val:
            best_val = val_acc
            torch.save(model.state_dict(), best_path)

    # final test eval with best weights
    model.load_state_dict(torch.load(best_path, map_location=device))
    model.eval()
    correct = total = 0
    with torch.no_grad():
        for x, y in test_loader:
            x, y = x.to(device), y.to(device)
            pred = model(x).argmax(1)
            correct += (pred == y).sum().item()
            total += y.size(0)
    test_acc = correct / max(total, 1)
    print(f"best_val={best_val:.4f}  test_acc={test_acc:.4f}")

    (OUT_DIR / "classes.json").write_text(json.dumps(classes, indent=2))
    (OUT_DIR / "split.json").write_text(json.dumps(
        {"train": train_idx, "val": val_idx, "test": test_idx}, indent=2
    ))
    print(f"saved weights -> {best_path}")


if __name__ == "__main__":
    main()
