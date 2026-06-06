"""Glue between OCR + LLM extraction and the findings table."""
from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy.orm import Session

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.llm.report_parser import parse_report  # noqa: E402
from ai.ocr.extract import extract_text  # noqa: E402

from ..models import Finding, Report, Scan, Tooth


def ingest_report(db: Session, scan: Scan, report: Report) -> Report:
    ocr_text = extract_text(Path(report.storage_path))
    report.ocr_text = ocr_text

    findings = parse_report(ocr_text)
    report.extracted = {"findings": findings}

    teeth_by_fdi = {t.fdi: t for t in scan.teeth}
    for f in findings:
        tooth = teeth_by_fdi.get(f.get("fdi", -1))
        if tooth is None:
            tooth = Tooth(
                scan_id=scan.id,
                fdi=f["fdi"],
                bbox_xyxy=[0, 0, 0, 0],
                severity="yellow",
            )
            db.add(tooth)
            db.flush()
            teeth_by_fdi[f["fdi"]] = tooth
        db.add(
            Finding(
                tooth_id=tooth.id,
                label=f.get("label", "unknown"),
                confidence=float(f.get("confidence", 0.7)),
                source="report",
                evidence={"note": f.get("note", "")},
            )
        )
    db.commit()
    return report
