# OralVerse — Claude Code Instructions

## Project Overview
OralVerse is an AI-assisted orthodontic CAD platform. It segments dental STL scans into individual teeth using MeshSegNet (GNN), generates staged treatment plans, and provides a 3D viewer for aligner simulation.

## Monorepo Structure
```
OralVerse-1/
├── frontend/        # Next.js 14 app (React 18, TypeScript, Tailwind, Three.js)
├── backend/         # FastAPI server (Python 3.12)
├── ai/              # ML inference code (PyTorch, trimesh, scipy)
│   └── orthodontics/
│       └── segmentation/
│           ├── meshsegnet/          # MeshSegNet GNN model
│           │   └── checkpoints/     # meshsegnet_upper_best.pt, meshsegnet_lower_best.pt
│           ├── heuristic.py         # Rule-based fallback segmenter
│           ├── factory.py           # get_segmenter() — reads ORALVERSE_SEGMENTER env var
│           └── interface.py         # DentalMesh, SegmentationResult, ToothSegment
├── datasets/        # STL scan datasets (served by backend)
├── storage/         # Uploads and processed files
└── ml-env/          # Python venv with PyTorch — used to run the backend
```

## How to Run

### Backend (Terminal 1)
```bash
cd /Users/ampa/Desktop/webdev/dental/OralVerse-1/backend
../ml-env/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Uses `ml-env` (not `venv`) because it contains PyTorch, trimesh, scipy needed for MeshSegNet.

### Frontend (Terminal 2)
```bash
cd /Users/ampa/Desktop/webdev/dental/OralVerse-1/frontend
npm run dev
```
Runs on `localhost:3000`. Kill stray processes first: `lsof -ti :3000 | xargs kill -9`

## Environment Variables

### Root `.env` (read by backend at startup via python-dotenv)
```
ORALVERSE_SEGMENTER=meshsegnet
MESHSEGNET_CHECKPOINT_DIR=/Users/ampa/Desktop/webdev/dental/OralVerse-1/ai/orthodontics/segmentation/meshsegnet/checkpoints
```
Switch to `ORALVERSE_SEGMENTER=heuristic` for fast rule-based fallback (no GPU needed).

### `frontend/.env.local`
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
- Tailwind CSS — dark theme: `#070b11` bg, `#0d1520` panels, cyan-500 primary, violet-600 secondary
- Three.js 0.169.0 for 3D viewer
- Zustand 4.5.5 for state (caseStore, scanStore, toothObjectStore, treatmentPlanStore)
- Clerk v5 (`@clerk/nextjs@^5.7.6`) for auth — v7 requires Next.js 15+

### Backend
- FastAPI 0.115.0, uvicorn, pydantic v2
- SQLAlchemy + SQLite (`oralverse.db`)
- CORS: `localhost:3000` and `localhost:3001` allowed

### AI / ML
- PyTorch (MeshSegNet GNN — EdgeConv, 17 classes per arch)
- trimesh for mesh loading
- scipy for KDTree KNN and connected components
- Trained on Teeth3DS+ (1800 scans, parts 1-6); best val DSC ~22% (overfitting — needs retraining)
- Segmenter is cached in memory after first load (see `factory.py`)

## Backend API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/orthodontics/segment` | Segment arch mesh → tooth FDI labels |
| POST | `/api/orthodontics/staged-plan` | Generate staged treatment plan |
| GET | `/api/orthodontics/demo-plan` | Demo treatment plan |
| GET | `/api/stl/cases` | List STL datasets |
| GET | `/api/stl/file/{case}/{file}` | Serve STL file |

## Ownership (Multi-Claude Sessions)
When two Claude sessions are running simultaneously:

**This Claude (backend/AI terminal) owns:**
- `backend/`
- `ai/`
- `frontend/lib/` (api.ts, stores)
- Root `.env`

**Other Claude (frontend terminal) owns:**
- `frontend/app/` (pages, layout, middleware)
- `frontend/components/`
- `frontend/.env.local`

Never edit the same file from two Claude sessions simultaneously.

## Key Conventions
- Segmenter selection: `ORALVERSE_SEGMENTER` env var (`heuristic` | `meshsegnet`)
- FDI numbering: upper arch classes 1-16 → FDI 11-28; lower arch → FDI 41-48, 31-38
- All tooth geometry is in mm (STL native units)
- MeshSegNet expects faces ≤ 16,000 (subsampled during training); large meshes may need downsampling at inference
- `get_segmenter()` caches the instance — model loads once per server process

## Known Issues / Pending Work
- MeshSegNet DSC ~22% — needs retraining with dropout, focal loss, early stopping
- Wisdom teeth (FDI 18/28/38/48) always score 0% DSC — class imbalance issue
- WorkflowPanels.tsx still has some light-themed Tailwind classes
- Treatment plan generation is heuristic/mock — not clinically validated
