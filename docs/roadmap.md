# OralVerse-CAD — Engineering Roadmap

All items include: why it matters, dependencies, and estimated complexity (S = 1–2 days, M = 3–5 days, L = 1–2 weeks, XL = 2–4 weeks).

---

## Immediate (1–2 Weeks)

These items fix bugs or remove unsafe behaviors that exist in the current state.

### 1. Fix the inverted treatment plan target

**Why:** Every generated treatment plan currently moves teeth in the wrong direction. The staged plan animates teeth from the clinician's adjusted position back to the raw segmentation centroid. No clinical output is correct until this is fixed.

**What:** Separate the "initial position correction" (what sliders currently do — fixing segmentation errors) from "target position" (where the clinician wants the teeth to end up). Add a new workflow step or a toggle that lets the clinician define target positions independently of the correction step.

**Simplest interim fix:** Treat the manual transform as the target, and the raw centroid as the initial position (reverse the current logic). This is wrong conceptually but produces the correct visual direction.

**Full fix:** Add a dedicated target-setting workflow step (see Mid-term item 3).

**Dependencies:** `treatmentPlanStore.ts`, `WorkflowPanels.tsx`.
**Complexity:** S (interim fix) / M (proper target step)

---

### 2. Remove alert() calls and add real UI

**Why:** Three buttons claim to perform clinical operations that they do not perform. "Verify Occlusion" returning "no collisions detected" without any check is the most dangerous.

**What:**
- Remove the three `alert()` calls in `WorkflowPanels.tsx`
- Disable the "Mirror Arch" and "Verify Occlusion" buttons with a `title="Coming soon"` tooltip until implemented
- Make "Auto Align" trigger `resetAllTransforms()` without the fake confirmation message

**Dependencies:** `WorkflowPanels.tsx`.
**Complexity:** S

---

### 3. Fix FinalPositionPanel side effect in render

**Why:** Setting state during component render is a React anti-pattern that causes potential render loops and violations of the concurrent rendering model.

**What:** Move the `setCurrentStage()` call inside a `useEffect` hook in `FinalPositionPanel`. See `technical-debt.md` item 3 for the exact fix.

**Dependencies:** `WorkflowPanels.tsx`.
**Complexity:** S

---

### 4. Add geometry disposal

**Why:** Every "Reset" or case-switch operation leaks GPU memory. In a session where the user browses 10 cases, VRAM usage can reach 200–400MB from orphaned buffers.

**What:** Call `.dispose()` on all `THREE.BufferGeometry` objects before removing them from state. Add disposal to:
- `useToothObjectStore.clearSegmentation()`
- `useSTLScanStore.clearMeshes()`
- `useSTLScanStore.loadCase()` before loading new geometry into existing slots

**Dependencies:** `toothObjectStore.ts`, `scanStore.ts`.
**Complexity:** S

---

### 5. Unify tooth selection state

**Why:** `useTreatmentStore.selectedFdi` and `useToothObjectStore.selectedFdis` are manually synced. Divergence causes UI inconsistencies in multi-select scenarios.

**What:** Remove `selectedFdi` from `useTreatmentStore`. All selection reads should go to `useToothObjectStore`. Panels that currently read `useTreatmentStore.selectedFdi` should be updated.

**Dependencies:** `store.ts`, `WorkflowPanels.tsx`, `ToothMesh.tsx`.
**Complexity:** M (touches many callsites)

---

### 6. Move segmentation to Web Worker or backend

**Why:** Segmentation blocks the main thread for 300–800ms, freezing the viewer. This is the most user-visible performance problem.

**Short path:** Move `segmentArch()` to the backend FastAPI (`POST /api/orthodontics/segment`). The frontend serializes the vertex/face arrays as JSON, receives FDI labels, and builds `ToothObject[]` from them. This also enables ML models in the future.

**Longer path (if backend move is blocked):** Use a Web Worker with a `MessagePort`. The geometry-building step still cannot be in a Worker (Three.js objects are not transferable), but the clustering and FDI assignment can be.

**Dependencies:** `meshSegmenter.ts`, `backend/app/routes/orthodontics.py`.
**Complexity:** M (backend move) / L (Web Worker approach)

---

### 7. Add STL geometry cache eviction

**Why:** The current cache accumulates geometry for every case the user views in a session. No eviction policy.

**What:** Implement an LRU cache with max 4 cases. On eviction, call `.dispose()` on all held geometry. A simple doubly-linked list with a max-size map is sufficient.

**Dependencies:** `scanStore.ts`.
**Complexity:** S

---

## Mid-term (1–2 Months)

Structural improvements that enable clinical correctness and unlock the ML roadmap.

### 1. Backend segmentation endpoint

**Why:** Required for Web Worker removal, enables ML models, removes 300ms main-thread block.

**What:** `POST /api/orthodontics/segment` accepts `{vertices: float[][], faces: int[][], arch: "upper"|"lower"}` and returns `{segments: [{fdi, face_indices: int[], confidence: float, centroid: float[3]}], gingiva_faces: int[]}`. Wire `HeuristicSegmenter` (Python port of current TypeScript) as the default.

**Dependencies:** `ai/orthodontics/segmentation/` (new module), FastAPI router.
**Complexity:** M

---

### 2. Manual segmentation correction tools

**Why:** No ML model will be 100% accurate. Clinicians need to correct boundaries before treatment planning. Correction data also becomes training data.

**What:**
- FDI reassignment: click tooth → dropdown to change label
- Verification state per tooth (auto / reviewed / corrected / verified)
- Summary badge showing unverified tooth count
- Block workflow advance until all teeth are verified (configurable)

**Hold for later:** Full 3D boundary editor (lasso/paint) — this is L complexity.

**Dependencies:** `toothObjectStore.ts`, `WorkflowPanels.tsx`, backend segmentation endpoint.
**Complexity:** M (reassignment + verification) / L (boundary editor)

---

### 3. Clinician-defined target positions

**Why:** The core clinical function of an orthodontic treatment planning tool is setting where teeth should end up. Currently this is not implemented at all.

**What:** Add a "Target Position" step (between Initial Position and Treatment Plan). For each tooth, the clinician can:
- Use an arch-fitting algorithm to auto-place targets on an ideal arch curve
- Fine-tune individual teeth with the same slider controls as Initial Position
- Lock teeth that should not move

The staged planner already accepts `initial` and `target` per tooth — the missing piece is the UI for setting the target.

**Interim arch-fitting algorithm:**
1. Compute arch perimeter from current tooth centroids
2. Fit a parabola/catenary through the centroids using least squares
3. Project each tooth centroid onto the fitted curve at equal arc-length intervals
4. These projected positions become the target centroids

**Dependencies:** `treatmentPlanStore.ts`, `WorkflowPanels.tsx`, math utility.
**Complexity:** M (arch fitting algorithm + UI)

---

### 4. Real collision detection in the viewer

**Why:** The current collision check in `constraints.py` uses centroid-to-centroid distances. Two teeth can overlap significantly in mesh space while their centroids are far apart. The viewer shows no collision feedback.

**What:**
- Backend: Replace centroid collision check with oriented bounding box (OBB) intersection tests. OBB is fast and captures most clinically relevant overlaps.
- Frontend: Highlight colliding teeth in the viewer (red tint on affected meshes) by reading collision results from the staged plan validation.

**Full mesh-mesh collision** (convex hull GJK/EPA) is more accurate but L/XL complexity and may not be needed for initial clinical use.

**Dependencies:** `constraints.py`, `ToothMesh.tsx`, `treatmentPlanStore.ts`.
**Complexity:** M (OBB) / XL (mesh-mesh)

---

### 5. Gingival margin visualization

**Why:** Attachment placement and IPR planning both depend on where the gingival margin is. Currently gingiva is displayed as an unstructured backdrop with no margin detection.

**What:** After Phase 1 segmentation (heuristic or ML), the gingival margin is the boundary edge loop between tooth-labeled faces and gingiva-labeled faces. Extract this boundary and render it as a colored line or highlighted edge strip in the viewer.

**Dependencies:** Backend segmentation endpoint (item 1 above), `STLDentalScene`.
**Complexity:** M

---

### 6. Consolidate Zustand stores

**Why:** Five stores with overlapping state cause sync bugs and make the codebase harder to reason about.

**What:** Merge into three stores:
- `useViewerStore`: camera, display settings, active tool, workflow stage
- `usePatientStore`: case/scan geometry, segmented teeth, transforms
- `usePlanStore`: staged plan, playback, stage navigation

Remove `useScanStore` entirely (X-ray remnant).
Migrate `useTreatmentStore.plan` (TreatmentPlanDto) to be fetched on-demand rather than stored.

**Dependencies:** Touches nearly every file.
**Complexity:** L (large surface area, low risk per change)

---

### 7. Per-stage movement table

**Why:** Clinicians reviewing a treatment plan want to see which teeth move at which stages and by how much — not just the total movement.

**What:** A table view in the Staging panel showing: Stage N, teeth moving, translation mm, rotation deg, IPR scheduled. Derived from `StagedTreatmentPlan.teeth[fdi].stages[]`.

**Dependencies:** `WorkflowPanels.tsx`, `treatmentPlanStore.ts`.
**Complexity:** S

---

## Long-term (3–6 Months)

Capabilities that require new systems, training data, or significant architectural changes.

### 1. MeshSegNet integration

**Why:** Replace heuristic segmentation with a trained model. Target Dice coefficient ≥ 0.93 on 3DTeethSeg22.

**What:** Train MeshSegNet on 3DTeethSeg22 dataset. Wrap as `MeshSegNetSegmenter` implementing the `Segmenter` protocol. Deploy as a separate inference microservice. The main FastAPI API delegates to it via HTTP or gRPC.

**Dependencies:** 3DTeethSeg22 dataset access, GPU training infrastructure, inference microservice, backend segmentation endpoint (mid-term item 1).
**Complexity:** XL

---

### 2. Landmark detection

**Why:** All clinical measurements currently use bounding-box centroids. Landmark-based measurements (incisal edge, cusp tip, mesial/distal contact points) are required for clinical accuracy.

**What:** PointNet++ operating on per-tooth sub-mesh (output of segmentation). Returns per-tooth anatomical landmark positions. Replaces approximation constants in `clinicalMeasurements.ts`.

**Dependencies:** MeshSegNet (item 1), training data.
**Complexity:** XL

---

### 3. Bolton analysis

**Why:** Space distribution between arches depends on the ratio of total tooth widths. Treatment planning without Bolton analysis may produce a result where all teeth are in their ideal positions but the arches don't fit together.

**What:** Sum mesiodistal widths of upper and lower teeth (from landmarks). Compute anterior ratio (6 anterior teeth) and overall ratio (all 12 teeth). Flag discrepancy > 2mm.

**Dependencies:** Landmark detection (item 2).
**Complexity:** S (once landmarks exist)

---

### 4. Arch form fitting

**Why:** The target position calculation requires fitting teeth to an arch form. Different patients have different arch forms (oval, tapered, square), and the treatment plan should respect the patient's natural arch form when possible.

**What:** Fit a Catalan catenary or cubic Bezier to the lower arch centroids. Allow the clinician to select from several preset arch forms. Project tooth targets onto the fitted curve.

**Dependencies:** Target position workflow (mid-term item 3).
**Complexity:** M

---

### 5. Root movement simulation

**Why:** Tooth movement in orthodontics is constrained by the alveolar bone envelope. Moving a tooth too fast or past its root apex leads to root resorption. The current system treats all movement as equivalent regardless of root position.

**What:** For each planned movement, estimate whether it is tipping or bodily (requires long axis from landmark detection). Apply higher risk scores to movements where the estimated root apex exceeds the bone envelope (requires CBCT or root prediction model).

**Dependencies:** Landmark detection (item 2), root prediction model (from ml-roadmap.md Phase 4).
**Complexity:** XL

---

### 6. Treatment plan export

**Why:** Without export, the tool cannot be used clinically. The plan must be sent to a lab that manufactures the aligners.

**What:**
- Per-stage STL export: for each stage 0..N, write the full arch mesh with teeth at their stage positions
- PDF report: treatment plan summary, movement table, IPR schedule, attachment plan
- CSV data: raw movement data per tooth per stage for lab import

**Dependencies:** All mid-term items should be complete.
**Complexity:** L

---

### 7. Inference microservice

**Why:** ML models cannot run in the FastAPI process (blocks event loop, incompatible process lifecycle with hot reload).

**What:** Separate FastAPI or gRPC service that:
- Loads models on startup (one-time cost)
- Accepts mesh inference requests
- Returns results asynchronously (queue-based for long jobs)
- Exposes health and version endpoints

The main API calls this service via HTTP. If the inference service is unavailable, fall back to the heuristic segmenter.

**Dependencies:** MeshSegNet (item 1).
**Complexity:** M (architecture) + infrastructure setup

---

### 8. Case persistence and history

**Why:** Currently all state is in-memory. Closing the browser loses the session. A clinical tool must save cases and allow resumption.

**What:**
- Store case data in the existing SQLite/Supabase backend
- Save: segmentation results, tooth transforms, treatment plan, clinician notes, approval status
- Case list view with patient identifiers
- Version history for plan iterations (before/after clinician adjustments)

**Dependencies:** Backend models in `entities.py`.
**Complexity:** L

---

## Priority Matrix

| Item | Clinical Impact | Engineering Risk | When |
|---|---|---|---|
| Fix inverted plan target | Critical | Low | Week 1 |
| Remove alert() | Safety | Low | Week 1 |
| Geometry disposal | Stability | Low | Week 1 |
| Unified selection state | Bug fix | Medium | Week 2 |
| Backend segmentation endpoint | Enabler | Medium | Month 1 |
| Manual correction tools | Clinical | Medium | Month 1–2 |
| Clinician target positions | Critical | Medium | Month 1–2 |
| OBB collision detection | Safety | Medium | Month 2 |
| Store consolidation | Maintainability | Medium | Month 2 |
| MeshSegNet | Quality | High | Month 3–4 |
| Landmark detection | Accuracy | High | Month 4–5 |
| Treatment plan export | Clinical | Medium | Month 5–6 |
