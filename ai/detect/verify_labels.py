"""Quick sanity-check: render N labeled images with their YOLO boxes overlaid.

Use this before training to confirm the class-name mapping in data.yaml.

    python ai/detect/verify_labels.py --n 4
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

import cv2
import yaml

ROOT = Path(__file__).resolve().parents[2]
DATA_YAML = ROOT / "data" / "opg" / "detection" / "data.yaml"
IMG_DIR = ROOT / "data" / "opg" / "detection" / "augmented" / "train" / "images"
LBL_DIR = ROOT / "data" / "opg" / "detection" / "augmented" / "train" / "labels"
OUT_DIR = ROOT / "ai" / "detect" / "label_check"

COLORS = [(0, 0, 255), (0, 165, 255), (0, 255, 255), (255, 0, 255), (255, 128, 0), (0, 255, 0)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=4)
    args = ap.parse_args()

    names = yaml.safe_load(DATA_YAML.read_text())["names"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    images = list(IMG_DIR.glob("*.jpg"))
    random.shuffle(images)

    for img_path in images[: args.n]:
        lbl_path = LBL_DIR / f"{img_path.stem}.txt"
        if not lbl_path.exists():
            continue
        img = cv2.imread(str(img_path))
        h, w = img.shape[:2]
        for line in lbl_path.read_text().strip().splitlines():
            cid, xc, yc, bw, bh = line.split()
            cid = int(cid)
            xc, yc, bw, bh = float(xc) * w, float(yc) * h, float(bw) * w, float(bh) * h
            x1, y1 = int(xc - bw / 2), int(yc - bh / 2)
            x2, y2 = int(xc + bw / 2), int(yc + bh / 2)
            color = COLORS[cid % len(COLORS)]
            cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
            cv2.putText(img, names[cid], (x1, max(y1 - 4, 12)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
        out_path = OUT_DIR / f"check_{img_path.stem}.jpg"
        cv2.imwrite(str(out_path), img)
        print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
