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

## Track C — MeshSegNet Retraining (code done; awaiting Kaggle run)

### Status
All 5 training improvements implemented and committed to `claude/features`. The old ~22% DSC
checkpoints have been **deleted**. The Kaggle notebook is ready but blocked on two things:
1. **OSF maintenance** until June 26 02:00 UTC — download the dataset after that
2. **Kaggle GPU quota** — 6 hrs remaining on the account; run will use T4, may need resume

### What was implemented
1. **Focal loss + class weights** — `CombinedLoss` uses focal `(1-p_t)^gamma` CE with
   inverse-sqrt-frequency `alpha` weights (`--gamma 2.0`, `--class_weights` default on)
2. **Encoder dropout** — `dropout=0.1` in `EdgeConv` + `MeshSegNet` global MLP; appended at
   end of Sequential so old checkpoint keys (indices 0-5) are unchanged → backward compatible
3. **Early stopping on val loss** — `--patience 20` / `--min_delta 1e-3`
4. **LR warmup → cosine** — `LinearLR` 5 epochs → `CosineAnnealingLR` via `SequentialLR`
5. **Mesh augmentation** — mirror-flip (`i↔i+8` label remap), 3-axis rotation, scale, jitter

### Resume support
`train.py` now saves `meshsegnet_{arch}_latest.pt` after every epoch with full training state
(model + optimizer + scheduler + best_dsc + best_val_loss + patience_left + log).
`--resume <path>` loads it and continues from the saved epoch.

### Kaggle training workflow
**Run 1** (current quota, T4 GPU):
- GPU: **T4** (NOT P100 — P100 is sm_60, incompatible with PyTorch 2.10 which requires sm_70+)
- Notebook reads dataset from `/kaggle/input/teeth3ds/` (Kaggle dataset, not downloaded)
- After run: download `meshsegnet_upper_latest.pt` + `meshsegnet_lower_latest.pt` from Output tab

**Getting the Teeth3DS dataset onto Kaggle (one-time, manual):**
1. After OSF maintenance ends (June 26 02:00 UTC), go to [osf.io/xctdy](https://osf.io/xctdy)
   and log in — OSF now requires authentication for all downloads
2. Download all 7 zip files: `data_part_1.zip` … `data_part_7.zip`
3. Kaggle → Datasets → New Dataset → name it `teeth3ds` → upload all 7 zips → Publish
4. In the notebook settings → Data → Add dataset → attach `teeth3ds`
5. The notebook extracts from `/kaggle/input/teeth3ds/*.zip` automatically

**Run 2** (next quota reset, Monday):
1. Upload `_latest.pt` files as a Kaggle dataset (e.g. `oralverse-checkpoints`)
2. Attach it in notebook settings
3. Set `PRIOR_CKPT_DIR = Path('/kaggle/input/oralverse-checkpoints')` in cell 2b
4. Run — continues from where run 1 stopped

**After training completes:**
Download `meshsegnet_upper_best.pt` + `meshsegnet_lower_best.pt` from Output tab and place in:
`ai/orthodontics/segmentation/meshsegnet/checkpoints/`

### Known Issues
- `checkpoints/` is empty — `/segment` endpoint errors until new `.pt` files are placed there
- Wisdom teeth (FDI 18/28/38/48) scored 0% DSC on old checkpoint — focal loss + class weights
  + mirror-flip augmentation target this in the new training run
- Treatment plan generation is heuristic/mock — not clinically validated

## Demo Dataset (scan browser)
`datasets/data/` contains 4 patient cases / 108 STL files — used by `/api/stl/cases` for the
scan browser UI. Not training data. Plan: add Poseidon3D cases (200 real orthodontic STLs,
[zenodo.org/records/15608906](https://zenodo.org/records/15608906)) for more interesting demo cases.
The download was attempted locally but cut off at 577 MB; retry with `curl -C -` to resume.
Backend expects STL files named `0A-*.stl` (upper arch) or `0B-*.stl` (lower arch) in
case subfolders under `datasets/data/`.
