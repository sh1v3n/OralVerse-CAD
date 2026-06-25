# OralVerse — Claude Code Instructions

## Project Overview
OralVerse is an AI-assisted orthodontic CAD platform. It segments dental STL scans into individual teeth using MeshSegNet (GNN), generates staged treatment plans, and provides a 3D viewer for aligner simulation.

## App Structure (Routes)
- `/` — Public landing page (warm cream editorial design, Sketchfab 3D embed)
- `/sign-in` — Clerk sign-in (dark theme)
- `/sign-up` — Clerk sign-up (dark theme)
- `/dashboard` — Protected CAD app (dark theme, requires auth)

## Monorepo Structure
```
OralVerse-1/
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Landing page (public, light theme)
│   │   ├── dashboard/page.tsx    # CAD app (protected, dark theme)
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   ├── sign-up/[[...sign-up]]/page.tsx
│   │   ├── layout.tsx            # ClerkProvider, Google Fonts
│   │   └── globals.css
│   ├── components/
│   │   ├── panels/               # WorkflowPanels, CaseListSidebar, etc.
│   │   └── treatment/            # TreatmentViewer, StageControls
│   ├── lib/                      # Zustand stores, api.ts
│   ├── middleware.ts              # Clerk auth — / is public, /dashboard is protected
│   └── .env.local
├── backend/                      # FastAPI server
├── ai/
│   └── orthodontics/
│       └── segmentation/
│           ├── meshsegnet/
│           │   └── checkpoints/  # meshsegnet_upper_best.pt, meshsegnet_lower_best.pt
│           ├── heuristic.py
│           ├── factory.py        # get_segmenter() — cached singleton
│           └── interface.py
├── datasets/                     # STL scan datasets
├── storage/
├── ml-env/                       # Python venv with PyTorch (gitignored)
├── .env                          # Backend env vars (gitignored)
└── CLAUDE.md
```

## How to Run

### Backend (Terminal 1)
```bash
cd /Users/ampa/Desktop/webdev/dental/OralVerse-1/backend
../ml-env/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Uses `ml-env` (not `venv`) — it contains PyTorch, trimesh, scipy needed for MeshSegNet.

### Frontend (Terminal 2)
```bash
cd /Users/ampa/Desktop/webdev/dental/OralVerse-1/frontend
npm run dev
```
Runs on `localhost:3000`. Kill stray processes first: `lsof -ti :3000 | xargs kill -9`

## Environment Variables

### Root `.env` (read by backend at startup, gitignored)
```
ORALVERSE_SEGMENTER=meshsegnet
MESHSEGNET_CHECKPOINT_DIR=/Users/ampa/Desktop/webdev/dental/OralVerse-1/ai/orthodontics/segmentation/meshsegnet/checkpoints
```
Switch to `ORALVERSE_SEGMENTER=heuristic` for fast rule-based fallback (no GPU needed).

### `frontend/.env.local` (gitignored)
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

## Tech Stack

### Frontend
- Next.js 14.2.13, React 18, TypeScript
- Tailwind CSS
  - Landing page: warm cream (`#F6F2EB` → `#E6DECF`), text `#1C1A16`
  - Dashboard/auth: dark theme `#070b11` bg, `#0d1520` panels, cyan-500 primary, violet-600 secondary
- Three.js 0.169.0 for 3D viewer
- Zustand 4.5.5 (caseStore, scanStore, toothObjectStore, treatmentPlanStore)
- Clerk v5 (`@clerk/nextjs@^5.7.6`) — v7 requires Next.js 15+
- Fonts: Hanken Grotesk (landing), IBM Plex Mono (landing accents)

### Backend
- FastAPI 0.115.0, uvicorn, pydantic v2
- SQLAlchemy + SQLite (`oralverse.db`)
- CORS: `localhost:3000` and `localhost:3001` allowed

### AI / ML
- PyTorch — MeshSegNet GNN (EdgeConv, 17 classes per arch: 0=gingiva, 1-16=teeth)
- trimesh for mesh I/O, scipy for KDTree KNN and connected components
- Trained on Teeth3DS+ (1800 scans, parts 1-6)
- Current best val DSC: ~22% (overfitting — needs retraining, see Track C below)
- Segmenter cached in memory after first load (`factory.py`)

## Backend API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/orthodontics/segment` | Segment arch mesh → tooth FDI labels |
| POST | `/api/orthodontics/staged-plan` | Generate staged treatment plan |
| GET | `/api/orthodontics/demo-plan` | Demo treatment plan |
| GET | `/api/stl/cases` | List STL datasets |
| GET | `/api/stl/file/{case}/{file}` | Serve STL file |

## Key Conventions
- Segmenter: `ORALVERSE_SEGMENTER` env var (`heuristic` | `meshsegnet`)
- FDI: upper arch classes 1-16 → FDI 11-28; lower → FDI 41-48, 31-38
- All geometry in mm (STL native units)
- MeshSegNet trained with max 16,000 faces; large meshes may need downsampling at inference
- `get_segmenter()` returns a cached singleton — model loads once per server process

## Track C — Improving MeshSegNet (Code implemented; awaiting Kaggle run)
Baseline: ~22% mean tooth DSC, severe overfitting (train loss 0.21, val loss 2.4).
Target for clinical use: ~85%+ DSC. **The five training-side changes below are now
implemented** in `model.py` / `dataset.py` / `train.py` (and wired into the notebook).
What remains is to run `train_kaggle.ipynb` on Kaggle to produce new checkpoints.

1. **Focal loss + class weights** — `CombinedLoss` uses focal `(1-p_t)^gamma` CE with
   optional inverse-sqrt-frequency `alpha` weights (`--gamma`, `--class_weights` in train.py)
2. **Dropout** — `dropout` param added to `EdgeConv` + `MeshSegNet` encoder/global MLP
   (default 0.1; classifier keeps 0.4/0.3). Inference-compatible (no new state_dict keys)
3. **Early stopping on val loss** — `--patience` / `--min_delta`; still saves best-by-DSC checkpoint
4. **Learning rate warmup** — `LinearLR` warmup (`--warmup_epochs`) → `CosineAnnealingLR` via `SequentialLR`
5. **Mesh augmentation** — `dataset.py` `_augment(features, labels)`: mid-sagittal mirror-flip
   with `i↔i+8` label remap, 3-axis rotation, isotropic scale, Gaussian jitter

New hyperparameters documented in `config.yaml`. Notebook: `train_kaggle.ipynb` (train cells pass
`--gamma 2.0 --warmup_epochs 5 --patience 20`; class weights + augmentation are default-on).

## Known Issues
- MeshSegNet DSC ~22% on the *current* checkpoint — Track C training improvements are
  implemented in code but a fresh Kaggle run is needed to realise the gain
- Wisdom teeth (FDI 18/28/38/48) score 0% DSC on the current checkpoint — Track C focal
  loss + class weights + mirror-flip augmentation target this
- Treatment plan generation is heuristic/mock — not clinically validated
