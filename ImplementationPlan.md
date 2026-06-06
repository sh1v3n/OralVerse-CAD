# OralVerse — Implementation Plan

## Dataset

The project uses the **Dental OPG XRAY Dataset** (currently at `archive2/Dental OPG XRAY Dataset/`).

### Contents

```
archive2/Dental OPG XRAY Dataset/
├── Dental OPG (Classification)/
│   ├── BDC-BDR/         52 images
│   ├── Caries/          119 images
│   ├── Fractured Teeth/ 13 images
│   ├── Healthy Teeth/   223 images
│   ├── Impacted teeth/  87 images
│   └── Infection/       23 images           (Total: 517 images, 6 classes)
└── Dental OPG (Object Detection)/
    ├── Original Dataset/                     231 image+label pairs (YOLO)
    └── Augmented Dataset/
        ├── train/{images,labels}/            558 each
        ├── valid/{images,labels}/            23 each
        └── test/{images,labels}/             23 each
```

YOLO label format (class id, x_center, y_center, w, h — all normalized):
```
5 0.301874 0.384781 0.051881 0.227534
0 0.688191 0.341220 0.063360 0.210826
```
Class IDs observed in samples: `0, 1, 2, 5` — full set to be enumerated in Phase 0.

---

## Modality Note

The dataset is **panoramic dental X-rays (OPGs)**, not intraoral RGB phone photos. The product flow is built around OPG uploads accordingly — the upload UI should accept panoramic X-ray images, not arbitrary mouth photos.

---

## Phase 0 — Data Hygiene (≤1 hr)

- Move `archive2/Dental OPG XRAY Dataset/` → `data/opg/` to eliminate spaces and parentheses (Windows + FastAPI/Python ergonomics).
- Enumerate the full class ID set by scanning every YOLO label file under `data/opg/detection/`.
- Write `data/opg/detection/data.yaml`:
  ```yaml
  path: data/opg/detection/augmented
  train: train/images
  val: valid/images
  test: test/images
  names:
    0: <to be confirmed>
    1: <to be confirmed>
    2: <to be confirmed>
    ...
  ```
- Confirm class semantics against the 6 classification folder names — likely overlap (caries, impacted, etc.).

**Deliverable:** clean `data/opg/` tree + `data.yaml` ready for `ultralytics`.

---

## Phase 1 — YOLO Detector (`ai/detect/`)

- Train YOLOv8n on the pre-split Augmented Dataset:
  ```
  yolo detect train data=data/opg/detection/data.yaml model=yolov8n.pt epochs=80 imgsz=640
  ```
- Validate on `test/` (23 images).
- Export ONNX for FastAPI serving.

**Output per inference:** list of `{class_id, bbox, confidence}` — feeds the "Detected Issues / Severity / Confidence Score" panel in the spec.

---

## Phase 2 — SAM 2 Segmentation (`ai/segment/`)

- Load SAM 2 (`sam2_hiera_small.pt`) on the server.
- For each YOLO bbox → prompt SAM 2 → per-tooth pixel mask.
- Cache masks alongside the original image.

Covers the spec's "tooth segmentation" requirement — SAM 2 produces pixel masks from the YOLO bbox prompts at inference time, so no pre-existing mask annotations are needed.

---

## Phase 3 — Condition Classifier (`ai/classify/`)

- Fine-tune EfficientNet-B0 (or ResNet-50) on the 517-image Classification split, 6 classes.
- Handle class imbalance (Healthy 223 vs Fractured 13): weighted loss + augmentation on minority classes.
- At inference: crop each detected tooth from YOLO bbox → classify → severity color.

**Severity map:**
- Healthy → green
- Caries (small) → yellow, Caries (large) → orange
- Impacted / BDC-BDR / Infection / Fractured → red

---

## Phase 4 — Backend (FastAPI)

```
POST /upload           -> store image in Supabase Storage, return image_id
POST /analyze/{id}     -> run detect → segment → classify pipeline
GET  /scan/{id}        -> full result (teeth array + summary scores)
GET  /scan/{id}/tooth/{fdi}  -> single-tooth panel payload
POST /report/upload    -> optional PDF/X-ray for OCR fusion
```

**PostgreSQL tables:** `scans`, `teeth`, `findings`, `reports`.

---

## Phase 5 — 3D Dental Twin (Next.js + React Three Fiber)

- Generic 28-tooth FDI-numbered mesh as the visualization base.
- Color each tooth by the classifier's severity output.
- Click handler → fetch `/scan/{id}/tooth/{fdi}` → side panel with tooth number, issues, severity, confidence, evidence source, recommended action.
- Camera controls: rotate / zoom / pan (R3F `OrbitControls`).

**Limitation to acknowledge in UI:** the 3D twin is a *generic* arch colored by per-tooth findings, not a patient-specific reconstruction. Mapping from OPG to FDI numbers is done by detection order along the arch curve — approximate, not millimetric.

---

## Phase 6 — Health Summary Dashboard

Computed from the per-tooth findings:
- Overall Oral Health Score (weighted average across teeth)
- Cavity Risk (count + severity of caries findings)
- Missing Teeth Count (detection coverage vs expected 28)
- Treatment Priority List (sorted by severity × confidence)

Alignment Score and Gum Health Score are **out of scope** for this dataset — flag as "not assessed" in the UI rather than fake.

---

## Phase 7 — Report OCR + LLM Fusion (Stretch)

- PaddleOCR or Tesseract on uploaded PDFs.
- Claude (`claude-opus-4-7`) prompt: extract tooth-numbered findings from the OCR text, return JSON keyed by FDI.
- Merge with vision findings in the `findings` table with `source: "report" | "vision"`.

---

## Phase 8 — Timeline (Stretch)

- Every scan stored with `created_at`.
- Compare consecutive scans by FDI → delta per tooth (severity up/down, new findings).
- Simple time-series chart of Overall Oral Health Score.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind + Three.js + React Three Fiber |
| Backend | FastAPI (Python 3.12) |
| Detection | YOLOv8 (Ultralytics) |
| Segmentation | SAM 2 |
| Classification | EfficientNet-B0 (PyTorch) |
| OCR | PaddleOCR |
| LLM | Claude `claude-opus-4-7` |
| DB | PostgreSQL |
| Storage | Supabase Storage |

---

## Folder Structure

```
OralVerse/
├── data/
│   └── opg/
│       ├── classification/      # 6 class folders
│       └── detection/
│           ├── augmented/{train,valid,test}/{images,labels}/
│           ├── original/
│           └── data.yaml
├── ai/
│   ├── detect/                  # YOLO training + inference
│   ├── segment/                 # SAM 2 inference
│   ├── classify/                # EfficientNet training + inference
│   └── pipeline.py              # detect → segment → classify orchestration
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   ├── models/              # Pydantic + SQLAlchemy
│   │   └── services/
│   └── main.py
├── frontend/
│   ├── app/
│   ├── components/
│   │   ├── viewer/              # R3F dental viewer
│   │   ├── panels/              # tooth info panel
│   │   └── dashboard/
│   └── lib/api.ts
└── ImplementationPlan.md
```

---

## Execution Order

1. **Phase 0** — clean data, write `data.yaml`
2. **Phase 1** — train YOLO, get a working detector
3. **Phase 4 skeleton** — FastAPI `/upload` + `/analyze` endpoints stubbed
4. **Phase 5 skeleton** — Next.js + R3F dental viewer with mock data
5. **Phase 3** — classifier training (can run in parallel with frontend)
6. **Phase 2** — wire SAM 2 in
7. **Phase 6** — dashboard math
8. **Phase 7–8** — stretch goals if time remains

Phases 1, 3, 4, 5 can be parallelized across teammates after Phase 0.
