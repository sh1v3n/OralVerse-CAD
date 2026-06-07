from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env from project root (one level up from backend/) so the LLM keys
# used by ai/llm/report_parser.py are available without per-shell exports.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.models import Base, engine  # noqa: E402
from app.routes import report, scan, timeline  # noqa: E402

Base.metadata.create_all(bind=engine)

app = FastAPI(title="OralVerse API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(scan.router)
app.include_router(report.router)
app.include_router(timeline.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
