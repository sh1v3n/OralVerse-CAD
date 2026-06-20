# OralVerse-CAD — Segmentation Strategy

## Current Heuristic Implementation

File: `frontend/lib/meshSegmenter.ts`

### Algorithm

```
segmentArch(geometry, arch):
  1. Extract all triangles from BufferGeometry
  2. Compute bounding box → yMin, yMax, yRange
  3. Gingiva threshold:
       upper arch: tri.centroid.y > yMax - yRange * 0.35
       lower arch: tri.centroid.y < yMin + yRange * 0.35
  4. Split triangles into gingivaTriangles / crownTriangles
  5. Build gingivaGeometry from gingivaTriangles
  6. Run spatialCluster(crownTriangles):
       a. Place 8×8 grid over XZ bounding box
       b. Assign each triangle to a cell (gx, gz)
       c. Flood-fill connected cells → connected components
       d. If < 4 clusters: fallback to kMeansSplit(k=14)
       e. Merge clusters < 2% of total triangles into nearest neighbor
  7. assignFdiLabels():
       Sort clusters by X centroid
       Sort ideal TOOTH_LAYOUT positions by X
       Greedy nearest-centroid match (Euclidean in XYZ)
  8. Build per-tooth BufferGeometry (non-indexed)
```

### Fundamental Limitations

**1. Y-threshold is not clinically meaningful.**
The gingival margin is not a horizontal plane. On real scans, the gingiva follows a scalloped curve (higher interproximally, lower over the buccal surface). A fixed 35% Y-threshold will:
- Cut through the crowns of tilted or impacted teeth
- Miss sub-gingival crown portions on deep scans
- Produce different results for the same patient depending on scan orientation

**2. Grid clustering uses XZ distance, not mesh topology.**
Adjacent teeth that are in contact (physiologic contact) will be merged into one cluster because their triangles share the same grid cell. This is the primary source of "tooth merging" artifacts.

**3. K-means seeds along the X axis only.**
For a dentition where the arch curves in XZ, seeding K-means along X produces unequal initial seeds. Posterior teeth (curved into Z) are poorly initialized.

**4. FDI assignment by nearest centroid to ideal position.**
This works only if the real tooth centroid is reasonably close to the ideal arch position. For severe malocclusions (ectopic teeth, impactions, crossbites), ideal positions may be far from actual positions, causing misassignment.

**5. No connectivity in geometry building.**
`buildGeometryFromTriangles()` creates a non-indexed BufferGeometry by copying triangle vertices. There is no vertex sharing across triangles, so vertex normals are flat-face normals. The output mesh has ~3× the vertex count of the input for the same geometry.

**6. Runs synchronously on the JavaScript main thread.**
A 50,000-triangle arch takes approximately 200–500ms to segment, blocking all React rendering and Three.js animation. On an 8-core machine this blocks the main thread — Web Workers cannot help because Three.js `BufferGeometry` objects are not transferable.

**7. No confidence scoring.**
`segmentation.confidence` is hardcoded to `0.5` for all heuristic outputs. The viewer has no way to highlight uncertain boundaries.

---

## Proposed Segmentation Interface

All segmenters — heuristic and ML — must implement a single contract. The frontend and backend must never know which segmenter is active.

### Backend Interface (Python)

```python
# ai/orthodontics/segmentation/interface.py

from __future__ import annotations
from dataclasses import dataclass
from typing import Protocol
import numpy as np


@dataclass
class DentalMesh:
    """Canonical input to all segmenters."""
    vertices: np.ndarray    # (N, 3) float32, in mm
    faces: np.ndarray       # (M, 3) int32, indices into vertices
    arch: str               # "upper" | "lower"


@dataclass  
class ToothSegment:
    fdi: int
    face_mask: np.ndarray       # (M,) bool — which faces belong to this tooth
    confidence: float           # 0–1, per-tooth confidence
    centroid: np.ndarray        # (3,) float32
    long_axis: np.ndarray       # (3,) float32 — estimated tooth long axis


@dataclass
class SegmentationResult:
    segments: list[ToothSegment]
    gingiva_mask: np.ndarray    # (M,) bool — gingival faces
    model: str                  # e.g. "heuristic-v1", "meshsegnet-v2"
    duration_ms: float


class Segmenter(Protocol):
    def segment(self, mesh: DentalMesh) -> SegmentationResult: ...
```

### FastAPI Endpoint

```python
# backend/app/routes/orthodontics.py

@router.post("/segment")
async def segment_arch(payload: SegmentPayload, background: BackgroundTasks) -> dict:
    """
    Accepts an STL binary or pre-parsed mesh and returns per-tooth segmentation.
    The segmenter implementation is selected by config, not by the caller.
    """
    segmenter = get_segmenter()  # factory reads config
    mesh = DentalMesh(
        vertices=np.array(payload.vertices),
        faces=np.array(payload.faces),
        arch=payload.arch,
    )
    result = segmenter.segment(mesh)
    return result_to_dict(result)
```

### Frontend Contract

The frontend receives a segmentation result and builds `ToothObject[]` from it. The segmenter is never imported in the frontend — all logic moves to the backend.

```typescript
// The only shape the frontend needs:
interface SegmentationResponse {
  segments: Array<{
    fdi: number;
    face_mask: number[];     // indices of faces belonging to this tooth
    confidence: number;      // 0–1
    centroid: [number, number, number];
  }>;
  gingiva_faces: number[];   // face indices of gingiva
  model: string;
}
```

---

## Heuristic Segmenter Improvements (Before ML)

These improvements can be made to the existing heuristic without requiring training data:

### 1. Adaptive Y-threshold

Replace fixed 35% with a threshold derived from the Y-histogram valley between two peaks (crown mass and gingiva mass).

```typescript
function findGingivaThreshold(triangles: TriangleData[]): number {
  // Build Y histogram with 50 bins
  // Smooth with Gaussian kernel
  // Find local minimum between the two tallest peaks
  // This Y value is the gingival margin estimate
}
```

### 2. Proximity-aware clustering

Replace grid flood-fill with a nearest-neighbor graph: connect each triangle to its k=6 nearest triangle centroids. Run connected-component analysis only over edges where distance > `min_inter_tooth_gap` (estimated from arch width / tooth count). This respects inter-tooth contact gaps.

### 3. Arch-curve K-means initialization

For K-means fallback, initialize seeds by fitting a parabola/spline through the XZ cloud of triangle centroids, then distributing 14 seeds along this curve with inter-seed spacing equal to `arch_perimeter / 14`. This gives anatomically meaningful initial seeds.

### 4. Multi-pass FDI assignment

Current greedy nearest-centroid matching allows high-severity misassignments to propagate. Replace with Hungarian algorithm (optimal bipartite matching between clusters and ideal positions weighted by distance + cluster size ratio).

---

## Manual Correction Workflow

After segmentation (heuristic or ML), a clinician must be able to:

### Boundary Editor

A 3D lasso/paint tool in the viewer:
- **Lasso mode:** Draw a closed curve in screen space to reassign all enclosed faces to a different tooth
- **Paint mode:** Brush strokes on the mesh surface, with brush radius control
- **Face select mode:** Click individual faces to reassign

UI state: `activeTool === 'boundary-editor'` in `useTreatmentStore`.

### FDI Reassignment

Click a tooth → popup showing current FDI → dropdown or keypad to reassign.

When an FDI is reassigned, the confidence score should drop to 0.7 (manual, unverified) until the clinician explicitly "verifies" it (confidence = 1.0).

### Merge / Split

- **Merge:** Select two adjacent teeth → merge into one (useful when incisors are split incorrectly)
- **Split:** Select a cluster → draw a cutting plane → split into two (useful when adjacent teeth are merged)

### Verification State

Each tooth should carry one of:
```typescript
type VerificationState = 
  | "auto"        // from heuristic or ML, unreviewed
  | "reviewed"    // clinician reviewed and accepted
  | "corrected"   // clinician made edits
  | "verified"    // clinician explicitly verified (confidence = 1.0)
```

The panel should show a summary count of verified vs unverified teeth before allowing workflow advancement.

---

## Migration Plan to ML Segmentation

### Step 1 — Move segmentation to the backend

Move `meshSegmenter.ts` logic to Python (`ai/orthodontics/segmentation/heuristic.py`). The frontend sends the raw STL vertices and faces to `POST /api/orthodontics/segment` and receives label assignments back.

This unblocks the main thread and makes the Python inference path available.

**Estimated effort:** 3 days. The algorithm is straightforward to port.

**Blocker:** The frontend currently passes `THREE.BufferGeometry` internally. We need to serialize vertices/faces to JSON or binary for the HTTP call.

### Step 2 — Implement segmentation API endpoint

```python
# HeuristicSegmenter wraps the ported Python algorithm
class HeuristicSegmenter:
    def segment(self, mesh: DentalMesh) -> SegmentationResult:
        ...  # port of meshSegmenter.ts algorithm
```

Add `POST /api/orthodontics/segment`. Wire `HeuristicSegmenter` as default.

### Step 3 — Add confidence visualization

Display per-tooth confidence scores in the segmentation panel. Teeth with confidence < 0.6 are flagged for review. This also forces us to make confidence meaningful (currently hardcoded to 0.5).

### Step 4 — Add manual correction tools

Implement the boundary editor and FDI reassignment UI. When a clinician corrects a tooth, the correction is sent back to the backend and stored per-case.

These corrections become labeled training data.

### Step 5 — Train MeshSegNet on 3DTeethSeg22

Using the dataset and training pipeline from `ml-roadmap.md`. Wrap as `MeshSegNetSegmenter`.

### Step 6 — A/B test and switch

- Run heuristic and ML segmenters in parallel
- Present results side by side to clinicians
- Track correction rate per model (lower correction rate = better model)
- Switch default to ML when correction rate < 5%

### Step 7 — Active learning loop

Every clinician correction is stored as a ground-truth label. Retrain periodically with the expanding dataset. This is the compound growth loop that improves the model over clinical use.
