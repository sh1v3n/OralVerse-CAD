from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..models import Report, Scan, get_db
from ..services.report_runner import ingest_report
from ..services.storage import save_upload

router = APIRouter(prefix="/api", tags=["report"])


@router.post("/scan/{image_id}/report")
async def upload_report(image_id: str, file: UploadFile, db: Session = Depends(get_db)) -> dict:
    scan = db.get(Scan, image_id)
    if scan is None:
        raise HTTPException(404, "scan not found")

    _id, path = save_upload(file)
    report = Report(scan_id=scan.id, filename=file.filename or "report", storage_path=str(path))
    db.add(report)
    db.commit()
    db.refresh(report)

    try:
        ingest_report(db, scan, report)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"report ingestion failed: {e}") from e

    return {
        "report_id": report.id,
        "scan_id": scan.id,
        "findings_added": len((report.extracted or {}).get("findings", [])),
    }
