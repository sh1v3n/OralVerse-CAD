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
│           │   ├── checkpoints/  # EMPTY — awaiting Kaggle run (old ~22% DSC files deleted)
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
**Note:** `checkpoints/` is empty — backend will error on `/api/orthodontics/segment` until
new Kaggle-trained `.pt` files are placed there. Use `ORALVERSE_SEGMENTER=heuristic` as fallback.

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
- Checkpoints: **currently empty** — old ~22% DSC checkpoints deleted; awaiting Kaggle retraining
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

## Track C — MeshSegNet Retraining

### Status (as of 2026-06-29)
Dataset is on Kaggle and preprocessing works. Four training runs completed; all showed the same
failure pattern. Root-cause analysis performed. **Next action: implement Fix 1 (BatchNorm →
LayerNorm) and run on Kaggle.** ~25 GPU hours remaining on the account.

### Kaggle dataset
- Dataset `teeth3ds` uploaded to Kaggle under user `shivenshetty`
- Mounted at: `/kaggle/input/datasets/shivenshetty/teeth3ds/` (pre-extracted folders, no zips)
- All 7 parts present; 1800 scans → 1440 train / 180 val / 180 test (seed=42, fixed)
- Notebook: `train_kaggle.ipynb` on `claude/features` branch; clones repo via git at runtime

### Root cause analysis — train/val divergence
All 4 runs showed: train loss ↓ steadily, val loss explodes by epoch 15–25, DSC ~18–20%.
Hyperparameter changes (LR, focal gamma, warmup, dropout, grad clip) had no effect.

**Confirmed cause: BatchNorm running-stats mismatch with batch_size=1.**
- During training: BatchNorm uses per-mesh statistics (each mesh is its own "batch")
- During eval: BatchNorm switches to stored running stats (population average of all meshes seen)
- Dental meshes have very different per-mesh geometry distributions → running stats diverge
  from individual mesh stats → model normalises differently at train vs eval time
- This is mechanically distinct from the "effective batch size" concern (EdgeConv sees F*k≈60k
  elements, so batch size per se is not the issue — it is the running stats accumulation)

**Secondary finding: STD pooling missing from paper.**
- Original 2020 MICCAI MeshSegNet uses cat([max-pool, std-pool]) for global context
- Current impl uses only max-pool → halves global feature expressiveness
- This is a secondary issue to fix AFTER the BatchNorm fix is validated

### What was implemented (committed to claude/features)
1. **Focal loss + class weights** — `CombinedLoss`, gamma configurable (default now 0.0 — off)
2. **Encoder dropout** — default 0.2 in `EdgeConv` + `MeshSegNet` global MLP
3. **Early stopping on DSC** — `--patience 30` tracking val DSC (not val loss)
4. **LR warmup → cosine** — `LinearLR` 5 epochs → `CosineAnnealingLR`, lr default 3e-4
5. **Grad clip** — 0.5
6. **Mesh augmentation** — mirror-flip, 3-axis rotation, scale, jitter
7. **Resume support** — `_latest.pt` saves full state; `--resume <path>` restarts from epoch

### Next Kaggle run (Fix 1 — isolate BatchNorm → LayerNorm)
Replace all `nn.BatchNorm1d` → `nn.LayerNorm` in `model.py` only. No other changes.
LayerNorm has no running stats; train and eval forward passes are identical.

**After implementing Fix 1:**
1. Run local smoke test (CPU, dummy tensors) — verify no NaN, shape errors, train/eval parity
2. Commit + push to `claude/features`
3. Start fresh Kaggle session → run cell 2 individually to confirm new commit pulled
4. Run All → watch epochs 1–15: val loss should stay below 1.1 (previously spiked to 1.5+)
5. If val loss tracks train loss by epoch 20 → fix confirmed; let run complete
6. Download `_best.pt` files → place in `checkpoints/`

**Fix 2 (STD pooling) — implement only after Fix 1 is validated on Kaggle.**

### Known issues
- `checkpoints/` is empty — `/segment` endpoint errors until `.pt` files are placed there
- Treatment plan generation is heuristic/mock — not clinically validated
- Wisdom teeth (classes 8, 16) scored ~0% DSC historically; class weights target this

## Demo Dataset (scan browser)
`datasets/data/` contains 4 patient cases / 108 STL files — used by `/api/stl/cases` for the
scan browser UI. Not training data. Plan: add Poseidon3D cases (200 real orthodontic STLs,
[zenodo.org/records/15608906](https://zenodo.org/records/15608906)) for more interesting demo cases.
The download was attempted locally but cut off at 577 MB; retry with `curl -C -` to resume.
Backend expects STL files named `0A-*.stl` (upper arch) or `0B-*.stl` (lower arch) in
case subfolders under `datasets/data/`.
