# OralVerse-CAD — Technical Debt

## Critical Bugs

### 1. Treatment Plan Target Is Inverted

**File:** `frontend/lib/treatmentPlanStore.ts:127–132`

```typescript
// Current code — WRONG
const targetPos: [number, number, number] = [
  tooth.centroid.x,    // raw segmented centroid, zero rotation
  tooth.centroid.y,
  tooth.centroid.z,
];
const targetRot: [number, number, number] = [0, 0, 0];
```

The "target" position of the treatment plan is the raw segmented centroid with zero rotation. The "initial" position is the centroid plus any manual transform the clinician applied in the Initial Position step.

This means the staged plan animates teeth **from the clinician-adjusted position back toward the segmentation centroid**. The manual slider adjustments made in the Initial Position panel are treated as the malocclusion, and the un-adjusted centroid is treated as the correction.

The clinical intent is the opposite: the clinician uses the Initial Position panel to correct segmentation errors, and the treatment target should be set separately (either by clinician input or by an arch-fitting algorithm).

**Impact:** Every generated treatment plan is clinically inverted. The viewer animation plays backward from the clinical perspective.

**Fix:** Separate the segmentation correction pass (Initial Position) from the treatment target setting. Add a dedicated Target Position step where the clinician or an algorithm sets the desired final position per tooth.

---

### 2. Duplicate Selection State

**Files:** `frontend/lib/store.ts:36` (`selectedFdi: number | null`) and `frontend/lib/toothObjectStore.ts:78` (`selectedFdis: Set<number>`)

Two stores maintain parallel selection state. Manual sync is required:

```typescript
// store.ts:67-74 — sync at callsite
selectTooth: (selectedFdi) => {
  set({ selectedFdi });
  if (selectedFdi !== null) {
    useToothObjectStore.getState().selectTooth(selectedFdi);  // manual
  } else {
    useToothObjectStore.getState().clearSelection();           // manual
  }
},
```

If any code path updates `toothObjectStore.selectedFdis` directly (e.g., `toggleTooth` in `ToothMesh.tsx`) without going through `useTreatmentStore.selectTooth`, the two stores diverge. Specifically: `ToothMesh` calls `toggleTooth` (multi-select) and separately calls `selectInTreatment` — they are not always in sync.

**Impact:** The treatment panel shows a different selected tooth than the viewer highlight in some shift-click multi-select scenarios.

---

### 3. FinalPositionPanel Reads State During Render

**File:** `frontend/components/panels/WorkflowPanels.tsx:687–690`

```typescript
// Inside a functional component render body:
const currentStage = useTreatmentPlanStore.getState().currentStage;
if (currentStage !== totalStages) {
  setCurrentStage(totalStages);  // side effect in render
}
```

Calling `zustand.getState()` inside render body bypasses the React subscription. State mutations during render (`setCurrentStage`) produce side effects that React does not track, violating the render-is-pure constraint. This can cause render loops or stale reads.

**Fix:** Move the side effect into a `useEffect` hook:
```typescript
useEffect(() => {
  if (hasPlan) setCurrentStage(stagedPlan.totalStages);
}, [hasPlan]);
```

---

## Store Architecture

### 4. Five Stores with Partial Overlap

The five Zustand stores have boundary ambiguity:

| Store | Owns | Overlaps with |
|---|---|---|
| `useTreatmentStore` | Workflow stage, camera, legacy plan | `toothObjectStore` (selection) |
| `useScanStore` | Scan analysis result (X-ray) | Unused in STL workflow |
| `useSTLScanStore` | STL geometries, LOD, display settings | `toothObjectStore` (segmented state) |
| `useToothObjectStore` | Tooth objects, transforms, selection | `treatmentPlanStore` (position data) |
| `useTreatmentPlanStore` | Staged plan, playback | `store` (stage/playing) |

`useTreatmentStore` has a `stage: number` and `playing: boolean` that duplicate `useTreatmentPlanStore.currentStage` and `isPlaying`. These appear to be legacy fields from before `treatmentPlanStore` was introduced.

`useScanStore` is entirely from the X-ray workflow and has zero callers in the STL workflow. It is dead code in the current product.

**Recommendation:** Consolidate into three stores: `useViewerStore` (camera + display), `usePatientStore` (case data + STL geometries + segmented teeth), and `usePlanStore` (staged plan + playback). Eliminate `useScanStore` entirely.

---

### 5. Two Different Treatment Plan Types

```typescript
// store.ts — legacy, from X-ray/demo workflow
plan: TreatmentPlanDto | null   // full structured plan with stages[], movements[], report

// treatmentPlanStore.ts — active, from staged-plan endpoint
plan: StagedTreatmentPlan | null   // simple interpolation plan
```

`AttachmentsPanel` reads from `useTreatmentStore.plan` (TreatmentPlanDto) for attachment and IPR data. But `TreatmentPlanPanel` uses `useTreatmentPlanStore.plan` (StagedTreatmentPlan) for stage count. These are two different plans. The attachments shown are from the demo plan, not from the user's actual scan.

---

## UI Placeholders

### 6. alert() Calls in Production Workflow

**File:** `frontend/components/panels/WorkflowPanels.tsx:514–543`

```typescript
// "Auto Align" button
alert("Auto Align applied: Teeth snapped to ideal arch curve (mock)");

// "Mirror Arch" button  
alert("Mirror Arch functionality will be available in the next clinical update.");

// "Verify Occlusion" button
alert("Occlusion verified: No severe collisions detected.");
```

Three workflow buttons use `alert()` with fabricated clinical feedback. "Verify Occlusion" tells the clinician "no severe collisions detected" without performing any check. This is unsafe in a clinical tool.

The `alert()` calls are blocking, uncustomizable, and cannot be styled. A proper notification or modal is required.

---

### 7. Export Button Has No Implementation

**File:** `frontend/components/panels/WorkflowPanels.tsx:922`

```typescript
<button className="...">
  Export Treatment Plan
</button>
```

No `onClick` handler. The button does nothing when clicked. This is the last step in the clinical workflow.

---

## Geometry Management

### 8. No Geometry Disposal

**File:** `frontend/lib/toothObjectStore.ts:133–138`

```typescript
clearSegmentation: () =>
  set({
    teeth: [],          // ToothObject[] dropped — geometries NOT disposed
    gingivaUpper: null, // geometry reference dropped — NOT disposed
    gingivaLower: null,
    ...
  }),
```

`THREE.BufferGeometry` objects hold GPU buffers (vertex position, normal, index ArrayBuffers). Setting the JavaScript reference to `null` does not release the GPU memory — `.dispose()` must be called explicitly. Every time the user clicks "Reset" or switches cases, the GPU memory grows.

The same issue exists in `useSTLScanStore.clearMeshes()`.

**Fix:** Before clearing references, call `.dispose()` on all geometry objects:
```typescript
clearSegmentation: () => {
  const { teeth, gingivaUpper, gingivaLower } = get();
  teeth.forEach(t => t.geometry.dispose());
  gingivaUpper?.dispose();
  gingivaLower?.dispose();
  set({ teeth: [], gingivaUpper: null, gingivaLower: null, ... });
},
```

---

### 9. Non-Indexed Geometry Output from Segmenter

**File:** `frontend/lib/meshSegmenter.ts:438–474`

```typescript
const positions = new Float32Array(triangles.length * 9); // 3 verts × 3 floats
// ...
// Every triangle has 3 unique vertex slots — no vertex sharing
```

The output geometry is non-indexed: every triangle gets 3 vertex entries, even if adjacent triangles share vertices. A tooth with 2,000 triangles that shares 80% of vertices will have 6,000 vertex entries instead of ~1,200. This is a ~5× memory overhead and prevents correct smooth normal computation (because there is no vertex connectivity to accumulate normals over).

**Fix:** After building the non-indexed geometry, convert it to indexed using Three.js `mergeVertices()`:
```typescript
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const indexed = mergeVertices(geom);
indexed.computeVertexNormals();
```

---

## AI Module

### 10. AI Pipeline Runs in the FastAPI Process

**File:** `backend/app/routes/orthodontics.py:13`

```python
from ai.orthodontics import build_treatment_plan
from ai.orthodontics.staged_planner import build_staged_plan
```

The AI modules are imported directly into the FastAPI request handlers. For the current heuristic pipeline, this is fine. When ML models are added (100–500ms inference with GPU), this will:
- Block the ASGI event loop for every inference call
- Prevent concurrent requests from being served
- Make model hot-reload impossible without restarting the entire API

**Fix:** Add an inference microservice (FastAPI or gRPC) that the main API delegates to. Use async HTTP client or message queue for communication.

---

### 11. Copilot Uses Simple Keyword Matching

**File:** `ai/orthodontics/copilot.py`

The copilot is a series of `if "keyword" in normalized_question` branches. It does not parse question structure, cannot handle compound questions, and fails silently for anything outside its keyword set. The `reasoning.py` module has a stub for LLM integration (`answer_with_local_llm`) but it is unclear if this is wired to an actual LLM.

---

## Data Model

### 12. Ideal Positions Are in Wrong Scale

**File:** `ai/orthodontics/catalog.py:38–53`

```python
def ideal_pose(fdi: int) -> dict:
    ...
    x = side * 3.15 * sin(angle)     # meters? mm? units unclear
    z = -(3.0 * (1 - cos(angle))) + 0.72
    y = 0.66 if upper else -0.66
```

The ideal positions use numbers in the range 0–3.15. Real intraoral scans are typically in millimeters, where the arch spans 40–60mm. These ideal positions (max ~3.15 units) are in a different scale than clinical STL data (units typically in mm with arch width ~50mm).

This mismatch causes FDI assignment to fail for real patient STL files. The algorithm correctly identifies which cluster centroid is closest to which ideal position, but "closest" is meaningless when the scale is mismatched by ~15×.

**Fix:** The ideal positions need to match the coordinate frame and scale of the loaded STL meshes. The STL normalization step in `stlLoader.ts` (if any) needs to document its output coordinate frame, and `catalog.py` ideal positions need to be in the same scale.
