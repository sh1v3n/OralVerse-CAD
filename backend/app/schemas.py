from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class FindingOut(BaseModel):
    label: str
    confidence: float
    source: str
    evidence: dict | None = None


class ToothOut(BaseModel):
    fdi: int
    bbox_xyxy: list[float]
    severity: str
    mask_path: str | None = None
    findings: list[FindingOut] = []


class SummaryOut(BaseModel):
    overall_score: float | None
    cavity_risk: float | None
    missing_teeth_count: int | None
    treatment_priority: list[int] = []  # FDI numbers sorted by severity x confidence


class ScanOut(BaseModel):
    id: str
    filename: str
    status: str
    created_at: datetime
    teeth: list[ToothOut] = []
    summary: SummaryOut


class UploadResponse(BaseModel):
    image_id: str
    filename: str


class AnalyzeResponse(BaseModel):
    image_id: str
    status: str
    detail: str | None = None
