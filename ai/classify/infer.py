"""Classifier inference wrapper consumed by the backend pipeline."""
from __future__ import annotations

import json
from pathlib import Path

import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0

RUN_DIR = Path(__file__).parent / "runs"
DEFAULT_WEIGHTS = RUN_DIR / "best.pt"
CLASSES_FILE = RUN_DIR / "classes.json"


class Classifier:
    def __init__(
        self,
        weights: Path = DEFAULT_WEIGHTS,
        classes_file: Path = CLASSES_FILE,
        device: str | None = None,
    ) -> None:
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.classes: list[str] = json.loads(classes_file.read_text())
        w = EfficientNet_B0_Weights.IMAGENET1K_V1
        model = efficientnet_b0(weights=None)
        model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(self.classes))
        model.load_state_dict(torch.load(weights, map_location=self.device))
        model.to(self.device).eval()
        self.model = model
        self.tf = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(w.transforms().mean, w.transforms().std),
        ])

    def classify(self, image: Image.Image | Path) -> tuple[str, float]:
        if isinstance(image, Path):
            image = Image.open(image).convert("RGB")
        x = self.tf(image).unsqueeze(0).to(self.device)
        with torch.no_grad():
            logits = self.model(x)
            probs = torch.softmax(logits, dim=1)[0]
            idx = int(probs.argmax().item())
        return self.classes[idx], float(probs[idx].item())
