"""Bridges ai.pipeline.analyze with persistence + scoring."""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

from sqlalchemy.orm import Session

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.pipeline import PipelineNotReady, analyze as run_pipeline, assign_fdi  # noqa: E402

from ..models import Finding, Scan, Tooth

SEVERITY_WEIGHT = {"green": 1.0, "yellow": 0.7, "orange": 0.4, "red": 0.1}


def _severity_for(cls: str, conf: float) -> str:
    cls = cls.lower()
    if cls == "healthy":
        return "green"
    if cls == "caries":
        return "yellow" if conf < 0.5 else "orange"
    return "red"


def analyze_scan(db: Session, scan: Scan) -> None:
    try:
        findings = assign_fdi(run_pipeline(Path(scan.storage_path)))
    except PipelineNotReady as e:
        scan.status = "models_unavailable"
        scan.overall_score = None
        db.commit()
        raise

    db.query(Tooth).filter(Tooth.scan_id == scan.id).delete()

    severities: list[str] = []
    caries_count = 0
    for f in findings:
        # Detector (mAP50 ~0.75) is the primary signal; classifier was trained
        # on too few samples to add reliable information and is kept on the
        # finding as evidence only.
        cls = f.detection_class
        conf = f.detection_confidence
        sev = _severity_for(cls, conf)
        severities.append(sev)
        if cls.lower() == "caries":
            caries_count += 1

        tooth = Tooth(
            scan_id=scan.id,
            fdi=f.fdi or 0,
            bbox_xyxy=list(f.bbox_xyxy),
            severity=sev,
            mask_path=f.mask_path,
        )
        db.add(tooth)
        db.flush()
        db.add(Finding(
            tooth_id=tooth.id,
            label=cls,
            confidence=conf,
            source="vision",
            evidence={
                "detection_class": f.detection_class,
                "detection_confidence": f.detection_confidence,
                "classifier_class": f.classifier_class,
                "classifier_confidence": f.classifier_confidence,
            },
        ))

    if severities:
        scan.overall_score = round(
            sum(SEVERITY_WEIGHT.get(s, 0.5) for s in severities) / len(severities), 3
        )
    else:
        scan.overall_score = None
    scan.cavity_risk = round(caries_count / max(len(findings), 1), 3) if findings else None
    scan.missing_teeth_count = max(0, 28 - len(findings))
    scan.status = "analyzed"
    db.commit()


def summary_payload(scan: Scan) -> dict:
    priority = sorted(
        scan.teeth,
        key=lambda t: (
            {"red": 0, "orange": 1, "yellow": 2, "green": 3}.get(t.severity, 4),
            -max((f.confidence for f in t.findings), default=0.0),
        ),
    )
    return {
        "overall_score": scan.overall_score,
        "cavity_risk": scan.cavity_risk,
        "missing_teeth_count": scan.missing_teeth_count,
        "treatment_priority": [t.fdi for t in priority if t.severity != "green"][:8],
    }
