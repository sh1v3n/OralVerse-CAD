# OralVerse-CAD — Clinical Workflows

## Current Workflow

The implemented workflow has 8 steps navigated via a sidebar panel:

```
1. Preprocessing
2. Segmentation
3. Initial Position
4. Treatment Plan
5. Final Position
6. Staging
7. Attachments
8. Review
```

### Step-by-Step Analysis

#### 1. Preprocessing

**Implemented:**
- Dataset browser (`ScanBrowser`) fetches case manifest from `GET /api/stl/cases`
- User selects a case → `loadCase()` fetches upper and lower STL files
- STL is parsed into Two.js `BufferGeometry` with a LOD pair (high/low-res)
- Secondary path: drag-and-drop custom STL (collapsed in a `<details>` element)

**Missing:**
- CBCT import (critical for root visualization and bone envelope assessment)
- Intraoral scan direct integration (iTero, 3Shape, Medit formats)
- Patient demographic capture
- Pre-treatment photograph import
- Bite registration / articulator setup

---

#### 2. Segmentation

**Implemented:**
- Auto-triggers when STL loads (`useEffect` on `hasSTL && !segmented`)
- `segmentArch()` runs synchronously on the JS main thread
- Y-axis threshold separates gingiva (top 35% for upper, bottom 35% for lower)
- Grid-based spatial clustering (8×8 XZ grid → flood-fill connected components)
- Fallback K-means (14 clusters) if flood-fill produces fewer than 4 groups
- FDI assignment by nearest-centroid match to `TOOTH_LAYOUT` ideal positions
- Results stored as `ToothObject[]` in `useToothObjectStore`

**Missing:**
- Manual boundary correction (lasso, brush, paint tools)
- FDI reassignment UI (drag label to different tooth)
- Tooth merge / split tools
- Confidence score display
- Gingival margin detection
- Root segmentation
- Validation against ground-truth annotations

---

#### 3. Initial Position

**Implemented:**
- Per-tooth transform sliders: TX, TY (intrusion), TZ, Torque (RX), Tip (RZ), Rotation (RY)
- Range: translation ±5 mm, rotation ±45° for torque/tip, ±90° for rotation
- Clinical diagnostics panel: overjet, overbite, midline deviation, arch widths, crowding, spacing
- Auto-generates treatment plan on entry (`planStatus === "idle"`)
- "Auto Align" button resets all transforms (calls `alert()` pretending to align)

**Critical bug:**
The "target" position in the treatment plan is set to the **raw centroid** with zero rotation (see `treatmentPlanStore.ts:127-132`). This means the staged plan animates teeth *back to their segmented positions* rather than toward a clinician-defined corrected position. The manual slider adjustments become the "initial" position, and the uncorrected centroid becomes the "target." This inverts the clinical intent.

**Missing:**
- Clinician-settable target positions (the core function of Initial Position in ClinCheck)
- Auto-arch fitting (spline fitting to ideal arch form)
- Occlusion contact detection
- IPR measurement display
- Torque/tip/rotation shown relative to tooth long axis, not world XYZ
- Landmark-based transforms (incisal edge, CEJ, root apex)

---

#### 4. Treatment Plan

**Implemented:**
- Extraction planning (tooth grid, marks teeth as extracted)
- Tooth locking (prevents movement)
- Plan summary: total stages, teeth count, estimated duration
- Dirty state warning when tooth transforms change after plan generation
- Selected tooth analysis: total movement distance and rotation from plan

**Missing:**
- Extraction simulation (the extracted tooth should disappear from the viewer)
- Locking enforcement in the staged planner
- Space distribution after extraction
- Bolton discrepancy analysis
- Arch length discrepancy
- Per-tooth movement risk visualization
- Collision visualization in the 3D viewer (plan validates server-side but no visual feedback)

---

#### 5. Final Position

**Implemented:**
- Auto-jumps to last stage on panel entry
- Compare mode: Before / Planned / After buttons jump to stage 0 / last stage
- Summary: total stages, teeth moved, estimated months
- Clinical diagnostics at final position (with initial → final delta display)

**Missing:**
- Side-by-side before/after rendering in a split viewport
- Occlusal contact map at final position
- Arch form overlay (ideal vs. planned)
- Root proximity visualization
- Gingival recession prediction

---

#### 6. Staging

**Implemented:**
- Stage slider (0 = initial, N = final)
- Play/Pause with auto-advance at 800ms/stage baseline
- Playback speeds: 0.5×, 1×, 2×
- Progress bar and stage label
- Per-stage tooth count display
- Clinical diagnostics at current stage

**Missing:**
- Per-stage movement table (which teeth move how much per aligner)
- IPR visualization at scheduled stage
- Attachment geometry shown in 3D at correct stages
- Stage thumbnail filmstrip
- Passive settling stages distinguished visually
- Wear day counter per stage

---

#### 7. Attachments

**Implemented:**
- Three visibility toggles: Attachments, Collision Zones, IPR Markers (state toggled but no 3D effect)
- Attachment teeth list from the legacy `TreatmentPlanDto` (demo plan)
- IPR site list from the legacy plan

**Missing:**
- Actual 3D attachment geometry on tooth surfaces
- Attachment shape selection (rectangular, beveled, optimized, hook)
- Attachment surface placement (buccal/lingual position on tooth face)
- Collision zone 3D mesh highlighting
- IPR markers as 3D indicators between teeth
- Attachment removal planning (which stage)

---

#### 8. Review

**Implemented:**
- Summary metrics from legacy plan: aligners, duration, refinement risk %
- Clinical notes textarea
- Approve / Reject buttons with date stamping
- "Export Treatment Plan" button (no implementation)

**Missing:**
- Actual plan export (STL per stage, PDF report, integration with lab)
- Patient-facing simulation viewer
- DICOM export
- Digital prescription form
- Audit trail

---

## Ideal Workflow (Reference: ClinCheck / uLab)

```
1. Case Intake
   ├── CBCT (3D bone + root)
   ├── Upper + lower STL scans
   ├── Articulated bite scan
   ├── Photographs (frontal, lateral, intraoral)
   └── Patient data + medical history

2. Segmentation & Landmarking
   ├── AI tooth isolation (per-tooth mesh, all 32 teeth)
   ├── Gingival margin detection
   ├── Root prediction from crown geometry
   ├── CEJ (cement-enamel junction) detection
   ├── Cusp tip / fossa landmark detection
   └── Manual correction tools (boundary editor, FDI override)

3. Model Setup
   ├── Arch form selection (oval, square, tapered)
   ├── Arch width measurement (inter-molar, inter-canine)
   ├── Bolton analysis (anterior and overall ratio)
   ├── Midline assessment
   └── Occlusal plane leveling

4. Treatment Goal Setting
   ├── Clinician sets final position per tooth (drag-and-drop in 3D)
   ├── Space analysis (crowding resolution method: IPR, expansion, extraction)
   ├── Overjet and overbite targets
   ├── Midline correction amount
   └── Arch form modification (expansion, constriction)

5. Treatment Planning
   ├── Collision detection at every stage (mesh-mesh, not centroid-centroid)
   ├── Root proximity warnings
   ├── Movement sequencing (which teeth move first)
   ├── Attachment optimization (AI-suggested, clinician-approved)
   ├── IPR scheduling (amount, timing, location)
   └── Clinical constraints enforcement (per-stage limits)

6. Staging Validation
   ├── Occlusal contact map at every stage
   ├── Gingival recession prediction
   ├── Bone loss risk assessment
   └── Passive aligner detection (unnecessary stages)

7. Clinician Approval
   ├── 3D animation review
   ├── Stage-by-stage table
   ├── Refinement probability
   └── Digital sign-off

8. Manufacturing
   ├── Stage STL export (one file per aligner)
   ├── Digital prescription
   ├── Lab integration
   └── Patient communication package
```

---

## Missing Clinical Subsystems

### Priority 1 — Without these, the tool cannot be used clinically

| Subsystem | Why |
|---|---|
| Clinician-set target positions | Currently targets are raw centroids, not corrections |
| Mesh-based collision detection | Centroid-level detection misses real contact |
| Attachment 3D geometry | Attachments are required for aligner tracking |
| Treatment plan export | No way to send to lab |

### Priority 2 — Required for clinical accuracy

| Subsystem | Why |
|---|---|
| Root movement simulation | Bodily movement risk assessment |
| Gingival margin visibility | Critical for attachment and IPR planning |
| Bolton analysis | Space distribution depends on tooth size ratios |
| Arch length discrepancy | Core crowding measurement |
| Occlusal contact map | Overjet/overbite validation |

### Priority 3 — Clinical quality and competitive parity

| Subsystem | Why |
|---|---|
| CBCT integration | Root and bone envelope |
| Landmark detection | Accurate CEJ, cusp, incisal edge positions |
| Per-stage IPR visualization | Timing and amount displayed in viewer |
| Passive aligner detection | Prevents unnecessary stages |
| Gingival recession prediction | Risk mitigation |
