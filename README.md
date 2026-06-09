# OralVerse

AI-powered dental digital twin. Upload a panoramic dental X-ray (OPG), run an
end-to-end detect → segment → classify pipeline, view your teeth as an
interactive 3D model color-coded by severity, attach reports for OCR+LLM
fusion, and track oral health over time.

The repository also includes an **orthodontic copilot layer** over a
reconstructed tooth-pose model: malocclusion analysis, constraint-aware target
generation, aligner staging, animated tooth movement, attachments/IPR,
prediction, grounded copilot queries, and draft clinical reports.

## What's in the box

- **AI pipeline** — YOLOv8 (tooth + condition detection) → SAM 2
  (bbox-prompted segmentation) → EfficientNet-B0 (per-tooth condition
  classification) → Claude opus-4-7 (report parsing)
- **Backend** — FastAPI, SQLAlchemy 2.0, SQLite (Postgres-ready), background
  inference tasks, storage abstraction (local now, Supabase-ready)
- **Frontend** — Next.js 14 (App Router) + TypeScript + Tailwind + Three.js
  via React Three Fiber. Procedural 28-tooth FDI arch, click-to-inspect, live
  health dashboard, timeline, report upload
- **Dataset** — Dental OPG XRAY Dataset (517 classification images across 6
  classes, ~835 YOLO-labeled detection images)

## Repo layout

```
data/opg/                       # dataset (gitignored)
  classification/{healthy,caries,impacted,bdc_bdr,infection,fractured}/
  detection/augmented/{train,valid,test}/{images,labels}/
  detection/original/
  detection/data.yaml

ai/
  detect/{train.py, infer.py, verify_labels.py}
  segment/infer.py              # SAM 2 wrapper
  classify/{train.py, infer.py}
  ocr/extract.py                # Tesseract OCR over PDFs / images
  llm/report_parser.py          # Claude opus-4-7 with prompt caching
  pipeline.py                   # orchestration: detect → segment → classify
  requirements.txt

backend/
  main.py
  app/
    models/{db.py, entities.py} # SQLAlchemy 2.0 + Pydantic 2
    routes/{scan, report, timeline}.py
    services/{storage, pipeline_runner, report_runner}.py
    schemas.py
  requirements.txt

frontend/
  app/{layout.tsx, page.tsx, globals.css}
  components/
    viewer/{DentalViewer, Tooth}.tsx
    panels/ToothPanel.tsx
    dashboard/{HealthSummary, Timeline}.tsx
    UploadDropzone.tsx
    ReportUpload.tsx
  lib/{teeth.ts, api.ts, store.ts}
```

## Running locally

### 1. Backend (boots without ML weights)

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate     # or: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Visit http://localhost:8000/health. `/api/upload` works immediately; `/api/analyze/{id}`
will return `status: models_unavailable` until you train the ML phases below.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:3000. The 3D arch renders right away (all teeth green).

### 3. Train the AI (optional but expected)

```bash
cd <repo root>
pip install -r ai/requirements.txt

# Sanity check the YOLO class-name mapping before training
python ai/detect/verify_labels.py --n 4
# inspect images in ai/detect/label_check/ — edit data/opg/detection/data.yaml
# if any class name is wrong

# Phase 1: YOLOv8 detector
python ai/detect/train.py

# Phase 3: EfficientNet-B0 condition classifier
python ai/classify/train.py
```

Weights land at `ai/detect/runs/opg/weights/best.pt` and
`ai/classify/runs/best.pt`. Restart the backend — the pipeline will pick them
up automatically.

### 4. SAM 2 (optional)

```bash
pip install git+https://github.com/facebookresearch/sam2.git
# Download a checkpoint into ai/segment/weights/sam2_hiera_small.pt
```

Without SAM 2, the pipeline still runs — `mask_path` will just be `null`.

### 5. Report parsing (optional)

OCR needs the Tesseract binary on PATH (Windows installer:
https://github.com/UB-Mannheim/tesseract/wiki). Set `ANTHROPIC_API_KEY` in
your environment to enable Claude-based extraction.

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/upload` | Upload an OPG image |
| `POST` | `/api/analyze/{id}` | Queue background inference |
| `GET`  | `/api/scan/{id}` | Full scan + teeth + summary |
| `GET`  | `/api/scan/{id}/tooth/{fdi}` | Single tooth payload |
| `POST` | `/api/scan/{id}/report` | Upload a dental report (PDF/image) |
| `GET`  | `/api/scans` | All scans (most recent first) |
| `GET`  | `/api/timeline/{a}/vs/{b}` | Per-FDI delta between two scans |
| `GET`  | `/api/orthodontics/demo-plan` | Complete runnable orthodontic demo plan |
| `POST` | `/api/orthodontics/plan` | Plan from reconstructed per-tooth poses |
| `POST` | `/api/orthodontics/copilot` | Plan-grounded clinical copilot query |

### Orthodontic model contract

`POST /api/orthodontics/plan` accepts FDI tooth poses (`position`,
`rotation_deg`, `confidence`) plus overjet, overbite, and midline metrics.
`ai/orthodontics/ml_adapters.py` defines the boundary for PointNet++ or
MeshSegNet segmentation, landmark prediction, and optional PyTorch tooth-graph
refinement. The runnable planner uses explicit movement limits and collision
checks; trained model checkpoints are not bundled.

Set `LOCAL_LLM_URL` to an OpenAI-compatible local server to use an LLM for
copilot phrasing. Without it, a deterministic plan-grounded copilot handles
stage, movement, attachment, IPR, duration, and refinement questions.

## Design notes / honest limitations

- **Modality.** The dataset is panoramic dental X-rays (OPGs), not intraoral
  RGB photos. The upload UI is designed around OPG images.
- **3D twin.** The arch is procedural (28 capsule meshes positioned along a
  parametric horseshoe) — not a patient-specific reconstruction. Mapping from
  OPG detections to FDI numbers uses a quadrant + arch-ordering heuristic.
- **Alignment / gum health.** Not derivable from this dataset. The UI shows
  them as "not assessed (OPG)" rather than fabricating values.
- **Orthodontic planning.** The included case is a synthetic demonstration
  until the reconstruction pipeline supplies patient tooth poses. Outputs are
  decision support and require root/bone, periodontal, functional occlusion,
  and clinician validation before fabrication.
- **Class names.** The shipped YOLO labels had no manifest. `data.yaml`'s
  class names are best-guesses from box-frequency; `ai/detect/verify_labels.py`
  exists specifically to sanity-check this before training.

## License

TBD.
