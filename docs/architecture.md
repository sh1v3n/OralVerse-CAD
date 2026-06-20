# OralVerse-CAD — Architecture

## System Overview

OralVerse-CAD is a three-tier orthodontic treatment planning application:

```
Browser (Next.js 14 / React Three Fiber)
    ↕  JSON / binary STL over HTTP
FastAPI Backend (Python 3.12)
    ↕  direct Python import (same process)
AI Pipeline (ai/ module)
    ↕  (planned) gRPC / REST
Inference Service (future — PyTorch models)
```

The AI pipeline is currently co-located with the FastAPI process. This is fine for a dev environment but is a blocking problem for production (model loading freezes the HTTP event loop).

---

## Frontend

### Technology

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5.6 |
| 3D Runtime | React Three Fiber 8 + Three.js 0.169 |
| Helpers | @react-three/drei 9 |
| State | Zustand 4.5 |
| Styling | Tailwind CSS 3 |

### Directory Structure

```
frontend/
├── app/                    # Next.js App Router pages
├── components/
│   ├── panels/             # Workflow step sidebars
│   │   └── WorkflowPanels.tsx   # All 8 panel components
│   ├── treatment/
│   │   ├── TreatmentViewer.tsx  # Canvas root
│   │   └── StageControls.tsx    # Aligner playback UI
│   └── viewer/
│       ├── STLDentalScene.tsx   # Scene graph root
│       ├── STLViewerControls.tsx
│       ├── ToothMesh.tsx        # Per-tooth R3F mesh
│       └── AnatomicalTooth.tsx
├── lib/
│   ├── api.ts                   # All fetch() wrappers + DTOs
│   ├── store.ts                 # Global workflow / UI store
│   ├── scanStore.ts             # STL loading + LOD management
│   ├── toothObjectStore.ts      # Segmented tooth objects
│   ├── treatmentPlanStore.ts    # Staged plan + playback
│   ├── caseStore.ts             # Case management (extraction, locking)
│   ├── meshSegmenter.ts         # Heuristic STL segmenter
│   ├── clinicalMeasurements.ts  # Overjet, overbite, crowding math
│   ├── useClinicalDiagnostics.ts # Diagnostics hook
│   ├── stlLoader.ts             # STL parse + LOD generation
│   ├── stlMaterials.ts          # Three.js material presets
│   ├── teeth.ts                 # FDI constants + arch layout
│   └── toothAssets.ts           # GLB tooth asset paths
```

### State Management

Five Zustand stores. Each owns a distinct domain:

```
useTreatmentStore (store.ts)
  ├── workflowStage: WorkflowStage      — which panel is active
  ├── cameraView: CameraView            — preset camera angle
  ├── selectedFdi: number | null        — currently selected tooth
  ├── plan: TreatmentPlanDto | null     — legacy demo plan
  └── compareMode, activeTool, etc.

useSTLScanStore (scanStore.ts)
  ├── cases: CaseManifest[]             — dataset manifest
  ├── upperArch / lowerArch             — active LOD geometries
  ├── upperHighRes / upperLowRes        — LOD pair
  ├── loadingStatus                     — fetch/parse state machine
  └── display settings (opacity, wireframe, materialPreset, etc.)

useToothObjectStore (toothObjectStore.ts)
  ├── teeth: ToothObject[]              — segmented individual teeth
  ├── gingivaUpper / gingivaLower       — separated gingiva geometry
  ├── selectedFdis: Set<number>         — multi-select
  └── per-tooth transforms (translation, rotation, intrusion)

useTreatmentPlanStore (treatmentPlanStore.ts)
  ├── plan: StagedTreatmentPlan | null  — staged interpolation plan
  ├── currentStage: number              — aligner index
  ├── isPlaying / playbackSpeed         — animation state
  └── isDirty                           — plan invalidation flag

useCaseStore (caseStore.ts)
  ├── activeRecord()                    — current case
  ├── extractedTeeth: number[]
  ├── lockedTeeth: number[]
  └── approvalStatus
```

**Known problem:** `selectedFdi` is duplicated between `useTreatmentStore` and `useToothObjectStore.selectedFdis`. They are manually synced at selection callsites. This is a latent divergence bug.

### Geometry Pipeline (Frontend)

```
Dataset HTTP endpoint
    ↓  fetch binary STL
stlLoader.ts → STLLoader (Three.js)
    ↓  BufferGeometry (non-indexed, world-space)
    ↓  SimplifyModifier → LOD pair (highRes / lowRes)
useSTLScanStore
    ↓  translate(0, ±1.0, 0)  ← hardcoded Y separation
STLDentalScene
    ↓  renders as single mesh (arch view)
    ↓  or:
meshSegmenter.ts → segmentArch()
    ↓  Y-threshold + spatial clustering + FDI assignment
    ↓  builds per-tooth BufferGeometry
useToothObjectStore → teeth[]
    ↓
ToothMesh (one per tooth)
    ↓  useFrame() → lerp/slerp animation
```

### Coordinate System

```
X: Patient Left (+) ← → Patient Right (-)   (midline ≈ 0)
Y: Superior (+) ↑ ↓ Inferior (-)            (occlusal plane ≈ 0)
Z: Anterior (+) → ← Posterior (-)
```

This is documented in `clinicalMeasurements.ts` and is consistent across the codebase.

---

## Backend

### Technology

| Layer | Choice |
|---|---|
| Framework | FastAPI 0.115 |
| Server | Uvicorn (ASGI) |
| Validation | Pydantic 2.9 |
| ORM | SQLAlchemy 2.0 |
| Database | SQLite (local dev) / Supabase (cloud) |
| Storage | Local filesystem + Supabase client |

### Router Map

```
main.py
├── /api/scan/*           (scan.py)       — image upload, analyze, get
├── /api/scan/*/report    (report.py)     — PDF/OCR report ingestion
├── /api/timeline/*       (timeline.py)   — scan comparison over time
├── /api/orthodontics/*   (orthodontics.py) — treatment plan + copilot
└── /api/stl/*            (stl_dataset.py) — dataset manifest + file serving
```

The scan/report/timeline routes are legacy from an X-ray analysis phase and are not currently used by the STL-first workflow.

### Orthodontics API

```
POST /api/orthodontics/staged-plan
    Input:  { teeth: [{ id, initial: {pos,rot}, target: {pos,rot} }] }
    Output: { totalStages, constraints, teeth: { FDI: { initial, target, stages[] } } }

GET  /api/orthodontics/demo-plan
    Output: full TreatmentPlanDto (hardcoded demo case)

POST /api/orthodontics/plan
    Input:  ModelInput (tooth poses + bite metrics)
    Output: full TreatmentPlanDto

POST /api/orthodontics/copilot
    Input:  { question, plan }
    Output: { answer, highlight_teeth, source, clinical_notice }
```

---

## AI Module

### Directory Structure

```
ai/
├── orthodontics/
│   ├── pipeline.py       — build_treatment_plan() orchestrator
│   ├── catalog.py        — FDI table, ideal_pose(), demo_model()
│   ├── geometry.py       — analyze_geometry() (crowding, spacing, issues)
│   ├── movement.py       — create_movements() (attachment, IPR recs)
│   ├── staging.py        — create_stages() (per-stage deltas)
│   ├── constraints.py    — validate_plan() + collision sweep
│   ├── prediction.py     — predict_outcome() (duration, risk, refinement)
│   ├── report.py         — generate_report()
│   ├── staged_planner.py — build_staged_plan() (the active viewer planner)
│   ├── copilot.py        — keyword-pattern Q&A engine
│   ├── reasoning.py      — answer_with_local_llm() (LLM wrapper)
│   ├── ml_adapters.py    — Protocol interfaces + ToothGraphRefiner sketch
│   └── __init__.py       — re-exports build_treatment_plan
├── segment/
│   └── infer.py          — SAM 2 wrapper (2D bounding-box → mask)
├── classify/             — 2D X-ray classification (YOLO/CNN)
├── detect/               — 2D X-ray detection (YOLO)
├── llm/                  — Anthropic/OpenAI report parser
└── ocr/                  — OCR for PDF dental reports
```

### Treatment Plan Pipeline

```
build_treatment_plan(model_dict)
    │
    ├── analyze_geometry()
    │       Computes deviation from ideal_pose() per tooth.
    │       Produces: crowding_mm, spacing_mm, rotation issues,
    │                 arch_asymmetry, overjet/overbite flags.
    │
    ├── create_movements()
    │       For each tooth: delta from current → ideal_pose().
    │       Recommends attachment type (if rotation ≥ 8° or vertical ≥ 0.12mm).
    │       Recommends IPR (if crowding ≥ 1mm and anterior teeth).
    │       Computes risk score.
    │
    ├── create_stages()
    │       Determines total active stages from max(movement) ÷ clinical limits.
    │       Minimum 10 active + 2 passive stages.
    │       Per-stage delta = total_movement / active_stages (uniform).
    │
    ├── predict_outcome()
    │       Heuristic duration = sum(wear_days).
    │       Refinement probability from risk count + max rotation.
    │
    ├── validate_plan()
    │       Checks per-stage movement ≤ clinical limits.
    │       Centroid-based collision sweep (not mesh-based).
    │
    └── generate_report()
```

### Staged Planner (Active)

`staged_planner.py:build_staged_plan()` is what the frontend actually calls.

```
Input: teeth[{ id, initial: {pos,rot}, target: {pos,rot} }]

For each tooth:
    stages_needed = max(
        ceil(translation_3d / 0.25mm),
        ceil(max_rotation_deg / 2.0°),
        ceil(intrusion_y / 0.15mm)
    )

global_stages = max(MIN_STAGES=8, max over all teeth)

For each tooth, for each stage 1..N:
    t = stage / total_stages
    pos = lerp(initial.pos, target.pos, t)
    rot = lerp(initial.rot, target.rot, t)
```

This is purely linear interpolation. The clinical limits determine stage count but do not shape the movement path.

### ML Adapter Interface

`ml_adapters.py` defines Protocol interfaces that are ready for implementation:

```python
class ToothSegmentationModel(Protocol):
    def segment(self, vertices, faces) -> labels: ...

class LandmarkModel(Protocol):
    def predict_poses(self, segmented_mesh) -> list[dict]: ...

class ReconstructionModelStack:
    segmenter: ToothSegmentationModel
    landmark_model: LandmarkModel
    graph_refiner: ToothGraphRefiner | None
```

`ToothGraphRefiner` is a single-layer GNN defined with PyTorch (7 output dims: 3 position + 4 quaternion). This is a skeleton — there are no weights, no training, and no inference path to the frontend.

---

## Frontend / Backend Boundary

| Concern | Location |
|---|---|
| STL file serving | Backend (binary stream, 24-hour cache) |
| Dataset manifest | Backend (filesystem scan at request time) |
| Staged plan generation | Backend (`/api/orthodontics/staged-plan`) |
| Segmentation | **Frontend** (JavaScript, main thread) |
| Clinical measurements | **Frontend** (JavaScript) |
| Collision detection | Backend (centroid-level only) |
| Attachment visualization | Frontend (toggle only, no 3D geometry) |
| Camera control | Frontend (Zustand + useFrame) |

The segmentation boundary is the most critical architectural decision to revisit. Running mesh segmentation in the browser blocks the UI thread and prevents accurate ML models from ever being used (PyTorch cannot run in the browser at dental mesh scale). See `segmentation-strategy.md`.

---

## Data Flow Summary

```
User selects case in ScanBrowser
    → scanStore.loadCase()
    → GET /api/stl/file/{case}/{file}
    → STLLoader.parse() → highRes BufferGeometry
    → SimplifyModifier → lowRes clone
    → geometryCache[caseId]  (in-memory, session lifetime)

STL loaded → auto-trigger segmentArch() [main thread]
    → ToothObject[] → useToothObjectStore.teeth

User clicks "Generate Treatment Plan"
    → POST /api/orthodontics/staged-plan
    → build_staged_plan() [Python]
    → StagedTreatmentPlan → useTreatmentPlanStore.plan

User drags stage slider
    → useTreatmentPlanStore.currentStage
    → ToothMesh.useFrame() reads getStageTransform()
    → lerp/slerp current mesh position toward stage target
```
