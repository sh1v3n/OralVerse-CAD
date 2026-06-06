from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return uuid4().hex


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    filename: Mapped[str] = mapped_column(String)
    storage_path: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="uploaded")
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    cavity_risk: Mapped[float | None] = mapped_column(Float, nullable=True)
    missing_teeth_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    teeth: Mapped[list[Tooth]] = relationship(back_populates="scan", cascade="all, delete-orphan")
    reports: Mapped[list[Report]] = relationship(back_populates="scan", cascade="all, delete-orphan")


class Tooth(Base):
    __tablename__ = "teeth"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id"))
    fdi: Mapped[int] = mapped_column(Integer)
    bbox_xyxy: Mapped[list] = mapped_column(JSON)
    mask_path: Mapped[str | None] = mapped_column(String, nullable=True)
    severity: Mapped[str] = mapped_column(String, default="green")  # green|yellow|orange|red

    scan: Mapped[Scan] = relationship(back_populates="teeth")
    findings: Mapped[list[Finding]] = relationship(back_populates="tooth", cascade="all, delete-orphan")


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    tooth_id: Mapped[str] = mapped_column(ForeignKey("teeth.id"))
    label: Mapped[str] = mapped_column(String)
    confidence: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String, default="vision")  # vision|report
    evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    tooth: Mapped[Tooth] = relationship(back_populates="findings")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id"))
    filename: Mapped[str] = mapped_column(String)
    storage_path: Mapped[str] = mapped_column(String)
    ocr_text: Mapped[str | None] = mapped_column(String, nullable=True)
    extracted: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    scan: Mapped[Scan] = relationship(back_populates="reports")
