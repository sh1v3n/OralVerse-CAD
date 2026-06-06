from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models import Scan, get_db

router = APIRouter(prefix="/api", tags=["timeline"])


SEV_RANK = {"green": 0, "yellow": 1, "orange": 2, "red": 3}


@router.get("/scans")
def list_scans(db: Session = Depends(get_db)) -> list[dict]:
    scans = db.query(Scan).order_by(Scan.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "filename": s.filename,
            "status": s.status,
            "created_at": s.created_at.isoformat(),
            "overall_score": s.overall_score,
            "cavity_risk": s.cavity_risk,
            "missing_teeth_count": s.missing_teeth_count,
        }
        for s in scans
    ]


@router.get("/timeline/{scan_a}/vs/{scan_b}")
def compare(scan_a: str, scan_b: str, db: Session = Depends(get_db)) -> dict:
    a = db.get(Scan, scan_a)
    b = db.get(Scan, scan_b)
    if a is None or b is None:
        raise HTTPException(404, "scan not found")

    a_map = {t.fdi: t.severity for t in a.teeth}
    b_map = {t.fdi: t.severity for t in b.teeth}

    deltas: list[dict] = []
    for fdi in sorted(set(a_map) | set(b_map)):
        sa = a_map.get(fdi, "green")
        sb = b_map.get(fdi, "green")
        if sa == sb:
            continue
        deltas.append(
            {
                "fdi": fdi,
                "from": sa,
                "to": sb,
                "direction": "worsened" if SEV_RANK[sb] > SEV_RANK[sa] else "improved",
            }
        )
    return {
        "scan_a": {"id": a.id, "score": a.overall_score, "at": a.created_at.isoformat()},
        "scan_b": {"id": b.id, "score": b.overall_score, "at": b.created_at.isoformat()},
        "delta_score": (b.overall_score or 0) - (a.overall_score or 0),
        "tooth_changes": deltas,
    }
