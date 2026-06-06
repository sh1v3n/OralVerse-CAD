from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import Base, engine
from app.routes import report, scan, timeline

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
