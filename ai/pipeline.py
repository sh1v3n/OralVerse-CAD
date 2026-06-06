"""End-to-end inference pipeline: detect -> segment -> classify.

Lazy-imports the heavy ML deps so the backend can boot even when ultralytics /
torch / SAM 2 are not yet installed. analyze() raises PipelineNotReady when
required weights are missing; SAM 2 is optional — if its checkpoint is missing,
we still return findings with mask_path=None.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path


class PipelineNotReady(RuntimeError):
    pass


@dataclass
class ToothFinding:
    fdi: int | None
    bbox_xyxy: tuple[float, float, float, float]
    detection_class: str
    detection_confidence: float
    classifier_class: str | None = None
    classifier_confidence: float | None = None
    mask_path: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


_detector = None
_classifier = None
_segmenter = None
_segmenter_attempted = False


def _load_required() -> tuple[object, object]:
    global _detector, _classifier
    if _detector is None or _classifier is None:
        try:
            from ai.detect.infer import DEFAULT_WEIGHTS as DET_W, Detector
            from ai.classify.infer import DEFAULT_WEIGHTS as CLS_W, Classifier
        except ImportError as e:
            raise PipelineNotReady(f"ML deps missing: {e}") from e
        if not Path(DET_W).exists():
            raise PipelineNotReady(f"YOLO weights not found at {DET_W} — train Phase 1 first")
        if not Path(CLS_W).exists():
            raise PipelineNotReady(f"Classifier weights not found at {CLS_W} — train Phase 3 first")
        _detector = Detector()
        _classifier = Classifier()
    return _detector, _classifier


def _try_load_segmenter() -> object | None:
    global _segmenter, _segmenter_attempted
    if _segmenter_attempted:
        return _segmenter
    _segmenter_attempted = True
    try:
        from ai.segment.infer import Segmenter
        _segmenter = Segmenter()
    except Exception:  # noqa: BLE001  — segmentation is optional
        _segmenter = None
    return _segmenter


def analyze(image_path: Path) -> list[ToothFinding]:
    from PIL import Image

    detector, classifier = _load_required()
    segmenter = _try_load_segmenter()
    img = Image.open(image_path).convert("RGB")

    findings: list[ToothFinding] = []
    for det in detector.detect(image_path):
        x1, y1, x2, y2 = det["bbox_xyxy"]
        crop = img.crop((x1, y1, x2, y2))
        cls_name, cls_conf = classifier.classify(crop)
        mask_path: str | None = None
        if segmenter is not None:
            try:
                mask, _score = segmenter.mask_from_bbox(img, (x1, y1, x2, y2))
                mask_path = str(segmenter.save_mask(mask))
            except Exception:  # noqa: BLE001
                mask_path = None
        findings.append(
            ToothFinding(
                fdi=None,
                bbox_xyxy=(x1, y1, x2, y2),
                detection_class=det["class_name"],
                detection_confidence=det["confidence"],
                classifier_class=cls_name,
                classifier_confidence=cls_conf,
                mask_path=mask_path,
            )
        )
    return findings


def assign_fdi(findings: list[ToothFinding]) -> list[ToothFinding]:
    """Approximate FDI assignment by sorting along the arch curve.

    Heuristic: split by image vertical midline (y) into upper/lower, then by
    horizontal midline (x) into left/right. Sort within each quadrant from the
    midline outward and assign 11-18 / 21-28 / 31-38 / 41-48.
    """
    if not findings:
        return findings
    ys = [(f.bbox_xyxy[1] + f.bbox_xyxy[3]) / 2 for f in findings]
    xs = [(f.bbox_xyxy[0] + f.bbox_xyxy[2]) / 2 for f in findings]
    y_mid = (max(ys) + min(ys)) / 2
    x_mid = (max(xs) + min(xs)) / 2

    quadrants: dict[int, list[tuple[float, ToothFinding]]] = {1: [], 2: [], 3: [], 4: []}
    for f, x, y in zip(findings, xs, ys):
        if y < y_mid and x > x_mid:
            quadrants[1].append((x, f))   # upper right (patient): FDI 11-18
        elif y < y_mid:
            quadrants[2].append((-x, f))  # upper left: FDI 21-28
        elif x < x_mid:
            quadrants[3].append((-x, f))  # lower left: FDI 31-38
        else:
            quadrants[4].append((x, f))   # lower right: FDI 41-48

    bases = {1: 11, 2: 21, 3: 31, 4: 41}
    for q, items in quadrants.items():
        items.sort(key=lambda t: t[0])
        for i, (_, f) in enumerate(items):
            f.fdi = bases[q] + min(i, 7)
    return findings
