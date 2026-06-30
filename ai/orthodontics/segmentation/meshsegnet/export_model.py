"""Verify and inspect a trained MeshSegNet checkpoint before deploying.

Usage
-----
    python -m ai.orthodontics.segmentation.meshsegnet.export_model \\
        --checkpoint checkpoints/meshsegnet_upper_best.pt

Prints model metadata, parameter count, and runs a forward pass on random
input to confirm the checkpoint loads and runs correctly.
Supports --help without torch installed.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

try:
    import numpy as np
    import torch

    from .model import MeshSegNet
    from .preprocess import NUM_CLASSES

    _DEPS_OK = True
except ImportError as _e:
    _DEPS_OK  = False
    _DEPS_ERR = str(_e)

IN_FEATURES  = 9
K_NEIGHBOURS = 6


def _check_deps() -> None:
    if not _DEPS_OK:
        sys.exit(
            f"Missing dependency: {_DEPS_ERR}\n\n"
            "Install with:\n"
            "  pip install -r ai/orthodontics/segmentation/meshsegnet/requirements.txt"
        )


def verify_checkpoint(checkpoint_path: Path) -> None:
    if torch.cuda.is_available():
        device = torch.device("cuda")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")

    print(f"\nLoading: {checkpoint_path}")
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=True)

    arch        = ckpt.get("arch", "unknown")
    epoch       = ckpt.get("epoch", "?")
    val_dsc     = ckpt.get("val_dsc", 0.0)
    in_features = ckpt.get("in_features", IN_FEATURES)
    num_classes = ckpt.get("num_classes", NUM_CLASSES)
    k           = ckpt.get("k", K_NEIGHBOURS)

    print(f"\n{'='*50}")
    print(f"  Checkpoint metadata")
    print(f"{'='*50}")
    print(f"  Arch        : {arch}")
    print(f"  Epoch       : {epoch}")
    print(f"  Val DSC     : {val_dsc*100:.2f}%")
    print(f"  In features : {in_features}")
    print(f"  Num classes : {num_classes}")
    print(f"  k-NN        : {k}")

    model = MeshSegNet(in_features=in_features, num_classes=num_classes, k=k).to(device)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    n_params = sum(p.numel() for p in model.parameters())
    print(f"  Parameters  : {n_params:,}")

    # Forward pass smoke test (F=1000 random faces)
    F   = 1000
    rng = np.random.default_rng(42)
    features = torch.from_numpy(
        rng.standard_normal((F, in_features)).astype(np.float32)
    ).to(device)
    knn_idx = torch.stack([
        torch.arange(F, device=device).roll(-i) for i in range(1, k + 1)
    ], dim=1)

    t0 = time.monotonic()
    with torch.no_grad():
        logits = model(features, knn_idx)
    elapsed_ms = (time.monotonic() - t0) * 1000

    assert logits.shape == (F, num_classes), f"Unexpected output shape: {logits.shape}"

    print(f"\n  Forward pass ({F} faces): {elapsed_ms:.1f} ms  ✓")
    print(f"  Output shape: {tuple(logits.shape)}")
    print(f"\n  Checkpoint is valid and ready for deployment.")
    print(f"\n  To activate in production:")
    print(f"    export ORALVERSE_SEGMENTER=meshsegnet")
    print(f"    export MESHSEGNET_WEIGHTS={checkpoint_path.resolve()}")
    print(f"{'='*50}\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verify a MeshSegNet checkpoint before deployment."
    )
    parser.add_argument("--checkpoint", required=True, type=Path,
                        help="Path to .pt checkpoint file")
    args = parser.parse_args()

    _check_deps()

    if not args.checkpoint.exists():
        sys.exit(f"Checkpoint not found: {args.checkpoint}")

    verify_checkpoint(args.checkpoint)


if __name__ == "__main__":
    main()
