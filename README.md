# OralVerse-CAD

AI-powered orthodontic treatment planning. Upload upper/lower arch STL scans, get automatic tooth segmentation, FDI labeling, movement simulation, and a draft clinical report — all in the browser.

## What's in the box

- **STL viewer** — React Three Fiber + Three.js, per-tooth color coding, upper/lower toggle, segmentation highlight
- **Tooth segmentation** — heuristic (instant, no GPU) + MeshSegNet (deep learning, trained separately)
- **Verification panel** — per-tooth FDI reassignment, merge, confidence bars, verification state badges
- **Orthodontic planner** — movement targets, IPR, attachments, aligner staging, animated simulation
- **AI backend** — FastAPI + SQLAlchemy, background inference, SQLite (Postgres-ready)
- **OPG pipeline** — YOLOv8 detect → SAM 2 segment → EfficientNet classify → Claude report parse (panoramic X-ray flow, separate from STL)

## Repo layout

```
frontend/                     # Next.js 14 + TypeScript + Tailwind
  app/
  components/
    viewer/
      STLDentalScene.tsx       # main 3D scene
      ToothMesh.tsx            # per-tooth mesh + material
    panels/
      WorkflowPanels.tsx       # segmentation verification panel
  lib/
    toothObjectStore.ts        # Zustand store (segmentation state)
    meshSegmenter.ts           # browser-side heuristic segmenter

ai/
  orthodontics/
    segmentation/
      heuristic.py             # adaptive gingiva threshold + arch-curve k-means
      meshsegnet/
        model.py               # EdgeConv MeshSegNet
        dataset.py             # 3DTeethSeg22 PyTorch Dataset
        prepare_data.py        # OBJ + JSON → .npz features
        train.py               # AdamW + CosineAnnealingLR, saves best DSC
        segmenter.py           # MeshSegNetSegmenter (production inference)
        evaluate.py            # per-class DSC + accuracy
        export_model.py        # verify checkpoint before deploy
        train_kaggle.ipynb     # one-click free training on Kaggle
        download_dataset.sh    # fetch 3DTeethSeg22 from Zenodo
      factory.py               # get_segmenter("heuristic" | "meshsegnet")
  detect/                      # YOLOv8 OPG tooth detection
  segment/                     # SAM 2 segmentation
  classify/                    # EfficientNet-B0 condition classification
  ocr/                         # Tesseract PDF/image extraction
  llm/                         # Claude report parser
  requirements.txt

backend/                       # FastAPI REST API
  main.py
  app/
    models/                    # SQLAlchemy 2.0 + Pydantic 2
    routes/                    # scan, report, timeline, orthodontics
    services/
  requirements.txt
```

## Running locally

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:3000. Upload an STL via the viewer — segmentation runs instantly in the browser (heuristic mode).

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API available at http://localhost:8000. `/api/upload` and `/api/orthodontics/demo-plan` work without ML weights.

### Python AI deps

```bash
pip install -r ai/requirements.txt
```

## Training MeshSegNet (free)

MeshSegNet gives significantly better tooth separation than the heuristic. Train for free on Kaggle (30 GPU hrs/week) or Google Colab.

**Kaggle (recommended):**
1. Push this repo to GitHub
2. New Kaggle Notebook → Settings → Accelerator: GPU P100
3. Upload `ai/orthodontics/segmentation/meshsegnet/train_kaggle.ipynb`
4. Set `REPO_URL` to your GitHub URL, run all
5. Download `meshsegnet_upper_best.pt` + `meshsegnet_lower_best.pt` from Output tab (~5 hrs)

**Apple Silicon (local, no cost):**
```bash
# Download dataset
bash ai/orthodontics/segmentation/meshsegnet/download_dataset.sh

# Preprocess
python -m ai.orthodontics.segmentation.meshsegnet.prepare_data \
  --data_dir ai/orthodontics/segmentation/meshsegnet/raw_data \
  --out_dir  ai/orthodontics/segmentation/meshsegnet/data

# Train (auto-detects MPS)
python -m ai.orthodontics.segmentation.meshsegnet.train \
  --data_dir ai/orthodontics/segmentation/meshsegnet/data \
  --arch upper --epochs 50 --max_faces 8000
```

**Activate after training:**
```bash
export ORALVERSE_SEGMENTER=meshsegnet
export MESHSEGNET_WEIGHTS=/path/to/meshsegnet_upper_best.pt
```

Verify a checkpoint:
```bash
python -m ai.orthodontics.segmentation.meshsegnet.export_model \
  --checkpoint ai/orthodontics/segmentation/meshsegnet/checkpoints/meshsegnet_upper_best.pt
```

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/upload` | Upload OPG image |
| `POST` | `/api/analyze/{id}` | Queue inference |
| `GET`  | `/api/scan/{id}` | Full scan + teeth |
| `GET`  | `/api/scan/{id}/tooth/{fdi}` | Single tooth |
| `POST` | `/api/scan/{id}/report` | Upload dental report |
| `GET`  | `/api/scans` | All scans |
| `GET`  | `/api/timeline/{a}/vs/{b}` | Per-FDI delta |
| `GET`  | `/api/orthodontics/demo-plan` | Runnable demo plan |
| `POST` | `/api/orthodontics/plan` | Plan from tooth poses |
| `POST` | `/api/orthodontics/copilot` | Clinical copilot query |

## Segmentation modes

| Mode | Speed | Accuracy | Requires |
|---|---|---|---|
| `heuristic` | Instant (browser) | Good, struggles with palate/posterior | Nothing |
| `meshsegnet` | ~2s/scan (GPU) | Excellent (DSC ~0.93–0.96) | Trained `.pt` weights |

The heuristic uses adaptive gingiva thresholding + arch-curve k-means seeding. MeshSegNet uses EdgeConv graph convolutions trained on [3DTeethSeg22](https://zenodo.org/record/7151927) (~1800 clinical scans).

## License

TBD.
