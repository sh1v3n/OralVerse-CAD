from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..models import Scan, Tooth, get_db
from ..schemas import AnalyzeResponse, FindingOut, ScanOut, SummaryOut, ToothOut, UploadResponse
from ..services.pipeline_runner import analyze_scan, summary_payload
from ..services.storage import save_upload

router = APIRouter(prefix="/api", tags=["scan"])


@router.post("/upload", response_model=UploadResponse)
def upload(file: UploadFile, db: Session = Depends(get_db)) -> UploadResponse:
    image_id, path = save_upload(file)
    scan = Scan(id=image_id, filename=file.filename or "image", storage_path=str(path))
    db.add(scan)
    db.commit()
    return UploadResponse(image_id=image_id, filename=scan.filename)


@router.post("/analyze/{image_id}", response_model=AnalyzeResponse)
def analyze(image_id: str, bg: BackgroundTasks, db: Session = Depends(get_db)) -> AnalyzeResponse:
    scan = db.get(Scan, image_id)
    if scan is None:
        raise HTTPException(404, "scan not found")
    scan.status = "queued"
    db.commit()
    bg.add_task(_run_in_background, image_id)
    return AnalyzeResponse(image_id=image_id, status="queued")


def _run_in_background(image_id: str) -> None:
    from ai.pipeline import PipelineNotReady

    from ..models import SessionLocal

    db = SessionLocal()
    try:
        scan = db.get(Scan, image_id)
        if scan is None:
            return
        try:
            analyze_scan(db, scan)
        except PipelineNotReady:
            # pipeline_runner already set status to "models_unavailable"
            pass
        except Exception as e:  # noqa: BLE001
            scan.status = f"error: {e.__class__.__name__}"
            db.commit()
    finally:
        db.close()


@router.get("/scan/{image_id}", response_model=ScanOut)
def get_scan(image_id: str, db: Session = Depends(get_db)) -> ScanOut:
    scan = db.get(Scan, image_id)
    if scan is None:
        raise HTTPException(404, "scan not found")
    return ScanOut(
        id=scan.id,
        filename=scan.filename,
        status=scan.status,
        created_at=scan.created_at,
        teeth=[
            ToothOut(
                fdi=t.fdi,
                bbox_xyxy=t.bbox_xyxy,
                severity=t.severity,
                mask_path=t.mask_path,
                findings=[
                    FindingOut(label=f.label, confidence=f.confidence,
                               source=f.source, evidence=f.evidence)
                    for f in t.findings
                ],
            )
            for t in scan.teeth
        ],
        summary=SummaryOut(**summary_payload(scan)),
    )


@router.get("/scan/{image_id}/tooth/{fdi}", response_model=ToothOut)
def get_tooth(image_id: str, fdi: int, db: Session = Depends(get_db)) -> ToothOut:
    tooth = (
        db.query(Tooth)
        .filter(Tooth.scan_id == image_id, Tooth.fdi == fdi)
        .first()
    )
    if tooth is None:
        raise HTTPException(404, "tooth not found")
    return ToothOut(
        fdi=tooth.fdi,
        bbox_xyxy=tooth.bbox_xyxy,
        severity=tooth.severity,
        mask_path=tooth.mask_path,
        findings=[
            FindingOut(label=f.label, confidence=f.confidence,
                       source=f.source, evidence=f.evidence)
            for f in tooth.findings
        ],
    )
