"""Lightweight inference wrapper used by the backend pipeline."""
from __future__ import annotations

from pathlib import Path

from ultralytics import YOLO

DEFAULT_WEIGHTS = Path(__file__).parent / "runs" / "opg" / "weights" / "best.pt"


class Detector:
    def __init__(self, weights: Path = DEFAULT_WEIGHTS) -> None:
        self.model = YOLO(str(weights))

    def detect(self, image_path: Path, conf: float = 0.25) -> list[dict]:
        results = self.model.predict(source=str(image_path), conf=conf, verbose=False)
        out: list[dict] = []
        for r in results:
            names = r.names
            for box, cls_id, score in zip(
                r.boxes.xyxy.tolist(),
                r.boxes.cls.tolist(),
                r.boxes.conf.tolist(),
            ):
                out.append(
                    {
                        "bbox_xyxy": tuple(box),
                        "class_id": int(cls_id),
                        "class_name": names[int(cls_id)],
                        "confidence": float(score),
                    }
                )
        return out
