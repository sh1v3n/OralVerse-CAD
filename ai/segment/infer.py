"""SAM 2 wrapper. Bbox-prompted segmentation for each detected tooth.

SAM 2 weights are not bundled. Download a checkpoint (e.g. sam2_hiera_small.pt)
and set SAM2_CHECKPOINT to point at it, or place it at ai/segment/weights/.
"""
from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import numpy as np
from PIL import Image

WEIGHTS_DIR = Path(__file__).parent / "weights"
DEFAULT_CHECKPOINT = WEIGHTS_DIR / "sam2_hiera_small.pt"
MASK_DIR = Path(__file__).resolve().parents[2] / "storage" / "masks"
MASK_DIR.mkdir(parents=True, exist_ok=True)


class Segmenter:
    def __init__(
        self,
        checkpoint: Path | None = None,
        model_cfg: str = "sam2_hiera_s.yaml",
        device: str | None = None,
    ) -> None:
        import torch

        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        ckpt = Path(os.environ.get("SAM2_CHECKPOINT", checkpoint or DEFAULT_CHECKPOINT))
        if not ckpt.exists():
            raise FileNotFoundError(f"SAM 2 checkpoint not found at {ckpt}")
        sam2_model = build_sam2(model_cfg, str(ckpt), device=self.device)
        self.predictor = SAM2ImagePredictor(sam2_model)

    def mask_from_bbox(
        self,
        image: Image.Image,
        bbox_xyxy: tuple[float, float, float, float],
    ) -> tuple[np.ndarray, float]:
        img_arr = np.array(image.convert("RGB"))
        self.predictor.set_image(img_arr)
        box = np.array(bbox_xyxy, dtype=np.float32)
        masks, scores, _ = self.predictor.predict(box=box, multimask_output=False)
        return masks[0].astype(np.uint8), float(scores[0])

    def save_mask(self, mask: np.ndarray) -> Path:
        out = MASK_DIR / f"{uuid4().hex}.png"
        Image.fromarray((mask * 255).astype(np.uint8)).save(out)
        return out
