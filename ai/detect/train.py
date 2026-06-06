"""Phase 1 — YOLOv8 training on the OPG detection split.

Run:
    python ai/detect/train.py

Override defaults with env vars:
    YOLO_MODEL=yolov8s.pt EPOCHS=120 IMGSZ=768 python ai/detect/train.py
"""
from __future__ import annotations

import os
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[2]
DATA_YAML = ROOT / "data" / "opg" / "detection" / "data.yaml"


def main() -> None:
    model_name = os.environ.get("YOLO_MODEL", "yolov8n.pt")
    epochs = int(os.environ.get("EPOCHS", "80"))
    imgsz = int(os.environ.get("IMGSZ", "640"))
    batch = int(os.environ.get("BATCH", "16"))
    project = ROOT / "ai" / "detect" / "runs"

    model = YOLO(model_name)
    model.train(
        data=str(DATA_YAML),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        project=str(project),
        name="opg",
        exist_ok=True,
    )

    metrics = model.val(data=str(DATA_YAML), split="test")
    print(f"test mAP50: {metrics.box.map50:.4f}  mAP50-95: {metrics.box.map:.4f}")

    export_path = model.export(format="onnx", dynamic=True, simplify=True)
    print(f"ONNX exported to: {export_path}")


if __name__ == "__main__":
    main()
