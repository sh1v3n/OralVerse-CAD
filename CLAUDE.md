# OralVerse — Claude Code Instructions

## Project Overview
OralVerse is an AI-assisted orthodontic CAD platform. It segments dental STL scans into individual teeth using MeshSegNet (GNN), generates staged treatment plans, and provides a 3D viewer for aligner simulation.

## App Structure (Routes)
- `/` — Public landing page (warm cream editorial design, Sketchfab 3D embed)
- `/sign-in` — Clerk sign-in (cream theme)
- `/sign-up` — Clerk sign-up (cream theme)
- `/dashboard` — Protected CAD app (cream theme, requires auth)

## Monorepo Structure
```
OralVerse-1/
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Landing page (public, cream theme)
│   │   ├── dashboard/page.tsx    # CAD app (protected, cream theme)
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   ├── sign-up/[[...sign-up]]/page.tsx
│   │   ├── layout.tsx            # ClerkProvider + signInUrl/signUpUrl, Google Fonts
│   │   └── globals.css
│   ├── components/
│   │   ├── panels/               # WorkflowPanels, CaseListSidebar, etc.
│   │   ├── treatment/            # TreatmentViewer, StageControls, Copilot
│   │   └── ui/                   # PaperTexture.tsx (film grain + corner marks)
│   ├── lib/                      # Zustand stores, api.ts
│   ├── middleware.ts              # Clerk auth — / is public, /dashboard is protected
│   └── .env.local
├── backend/                      # FastAPI server
├── ai/
│   └── orthodontics/
│       └── segmentation/
│           ├── meshsegnet/
│           │   ├── checkpoints/  # upper_best.pt (Run 5, ep98, 52.9% test DSC) + lower_best.pt (ep74, 61.2%)
│           │   ├── model.py      # EdgeConv + MeshSegNet + CombinedLoss (focal loss)
│           │   ├── dataset.py    # TeethSegDataset + augmentation
│           │   ├── train.py      # Training script with --resume support
│           │   ├── train_kaggle.ipynb  # Kaggle training notebook
│           │   └── config.yaml   # Hyperparameter reference
│           ├── heuristic.py
│           ├── factory.py        # get_segmenter() — cached singleton
│           └── interface.py
├── datasets/                     # Demo STL cases for scan browser (4 cases, 108 files)
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
Checkpoints are present — `/api/orthodontics/segment` is functional with `ORALVERSE_SEGMENTER=meshsegnet`.
Use `ORALVERSE_SEGMENTER=heuristic` for instant rule-based fallback (no GPU needed).

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
- Tailwind CSS — unified warm cream palette across all routes:
  - Tokens: `cream`, `surface`, `ink`, `clay` (terracotta `#C2613D`), `line` — defined in `tailwind.config.ts`
  - Landing + dashboard + auth all use `#F6F2EB` bg, `#1C1A16` ink text, espresso buttons, clay accents
  - `PaperTexture` component (film grain + corner registration marks) shared across landing + dashboard
- Three.js 0.169.0 for 3D viewer
- Zustand 4.5.5 (caseStore, scanStore, toothObjectStore, treatmentPlanStore)
- Clerk v5 (`@clerk/nextjs@^5.7.6`) — v7 requires Next.js 15+
  - `signInUrl="/sign-in"` and `signUpUrl="/sign-up"` on `<ClerkProvider>` required to prevent
    middleware redirecting to external `clerk.accounts.dev` domain
- Fonts: Hanken Grotesk (landing), IBM Plex Mono (landing accents)

### Backend
- FastAPI 0.115.0, uvicorn, pydantic v2
- SQLAlchemy + SQLite (`oralverse.db`)
- CORS: `localhost:3000` and `localhost:3001` allowed

### AI / ML
- PyTorch — MeshSegNet GNN (EdgeConv, 17 classes per arch: 0=gingiva, 1-16=teeth)
- trimesh for mesh I/O, scipy for KDTree KNN and connected components
- Training dataset: Teeth3DS+ (2100 scans, 7 parts) — see Track C below
- Checkpoints: `upper_best.pt` (epoch 98, 52.9% test DSC) + `lower_best.pt` (epoch 74, 61.2% test DSC)
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
- MeshSegNet trained with max 12,000 faces (Kaggle notebook); large meshes downsampled at inference
- `get_segmenter()` returns a cached singleton — model loads once per server process

## Track C — MeshSegNet (Segmentation)

### Status (as of 2026-06-30) — STABLE

Segmentation module is **frozen** at the Run 5 validated baseline. No pending architectural changes.

Future segmentation improvements are independent research experiments; start from Run 5.  
Full experiment history and analyses: [`docs/research/segmentation_findings.md`](docs/research/segmentation_findings.md)  
Concise run log: [`docs/experiments.md`](docs/experiments.md)

### Production architecture — Run 5

- 3× EdgeConv blocks: 9→64→128→256 channels
- Local features: `cat([x1, x2, x3])` → `(F, 448)`
- Global context: `local_feat.max(dim=0)` → `(448,)` → Linear(448→256) + LayerNorm → `(F, 256)`
- Classifier: `(F, 704)` → `(F, 17)` (2-layer MLP)
- **All normalisation: LayerNorm** — no BatchNorm, no running-stat buffers
- **Trainable params: 502,033**
- Train and eval forward passes are identical

### Production checkpoints

- `checkpoints/meshsegnet_upper_best.pt` — epoch 98, val DSC 56.5%, test DSC 52.9%
- `checkpoints/meshsegnet_lower_best.pt` — epoch 74, val DSC 63.8%, test DSC 61.2%
- Backend functional with `ORALVERSE_SEGMENTER=meshsegnet`

### Experiment summary

| Run | Key change | Upper val DSC | Lower val DSC | Outcome |
|---|---|---|---|---|
| 1–4 | Hyperparameter search (BatchNorm) | ~18% | ~18% | Train/val divergence — BatchNorm bug |
| **5** | **BatchNorm → LayerNorm** | **56.5%** | **63.8%** | **Divergence eliminated ✓ PRODUCTION** |
| 6 | STD pooling (research experiment) | 33.5% | 64.2% | Upper −23pp. Not adopted. Archived. |

### Kaggle setup (for future research runs)

- Dataset `teeth3ds`: `shivenshetty/teeth3ds`, mounted at `/kaggle/input/datasets/shivenshetty/teeth3ds/`
- 1800 scans → 1440 train / 180 val / 180 test (seed=42, fixed)
- Notebook: `train_kaggle.ipynb` on `claude/features`; clones repo via git
- Checkpoints dataset: `shivenshetty/oralverse-checkpoints`
- **Always confirm `--gamma "0.0"` in notebook cells** — the notebook has a stale default of `"1.0"`

### Training pipeline (do not change without updating docs/experiments.md)

1. `CombinedLoss`, `gamma=0.0` (plain CE + Dice), class weights (inverse-sqrt frequency)
2. Encoder dropout 0.2 in EdgeConv blocks + global MLP
3. Early stopping on DSC, `patience=30`
4. LR warmup 5 epochs → `CosineAnnealingLR`; lr=3e-4, AdamW, `weight_decay=1e-4`
5. Grad clip 0.5
6. Augmentation: mirror-flip + label remap, 3-axis rotation, isotropic scale, jitter
7. Resume: `_latest.pt` saves full state; `--resume <path>` restarts from epoch
8. `max_faces=12,000`

### Known limitations

- Wisdom teeth (FDI 18/28/38/48): 9–16% DSC — absent in many scans; data scarcity ceiling
- Lateral incisors (FDI 12/22): 37–40% DSC — small, symmetric, difficult to disambiguate
- Treatment plan generation is heuristic/mock — not clinically validated
- Poseidon3D demo dataset (200 cases) download interrupted at 577 MB; resume with `curl -C -`

## Demo Dataset (scan browser)
`datasets/data/` contains 4 patient cases / 108 STL files — used by `/api/stl/cases` for the
scan browser UI. Not training data. Plan: add Poseidon3D cases (200 real orthodontic STLs,
[zenodo.org/records/15608906](https://zenodo.org/records/15608906)) for more interesting demo cases.
The download was attempted locally but cut off at 577 MB; retry with `curl -C -` to resume.
Backend expects STL files named `0A-*.stl` (upper arch) or `0B-*.stl` (lower arch) in
case subfolders under `datasets/data/`.
