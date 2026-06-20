# OralVerse-CAD — ML Roadmap

## Current ML State

The codebase has two parallel ML tracks that have not converged:

**Track A — 2D X-ray analysis (ai/classify/, ai/detect/, ai/segment/):**
YOLO object detection, CNN classification, SAM 2 segmentation — all operating on 2D X-ray images. These were built for the original scan-analysis product and are not connected to the STL workflow.

**Track B — 3D mesh treatment planning (ai/orthodontics/ml_adapters.py):**
Protocol interfaces for `ToothSegmentationModel` and `LandmarkModel` are defined but have no implementations. `ToothGraphRefiner` is a PyTorch GNN sketch with no weights. The active workflow uses heuristics only.

The ML roadmap focuses on Track B — 3D mesh understanding.

---

## Architecture Target

```
Frontend
    ↓  POST /api/orthodontics/segment
FastAPI ← single endpoint, model-agnostic
    ↓  calls Segmenter.segment()
Segmenter (abstract)
    ├── HeuristicSegmenter      ← current (fallback)
    ├── PointNetPlusPlusSegmenter
    ├── MeshSegNetSegmenter
    └── EnsembleSegmenter
    ↓  returns SegmentationResult
    {
        labels: int[N_faces],   # per-face FDI label (0 = gingiva)
        confidence: float[N_faces],
        centroids: float[32, 3],
        axes: float[32, 3, 3],  # tooth-local coordinate frames
    }
```

The frontend must never know which model produced the segmentation. The API contract is the only stable surface.

---

## Phase 1 — STL Tooth Segmentation (Months 1–3)

**Goal:** Replace heuristic Y-threshold + K-means with a learned model that assigns FDI labels to every face of the input mesh.

### Model: MeshSegNet

**Why MeshSegNet over alternatives:**
- Designed specifically for dental intraoral scans (published on 3DTeethSeg dataset)
- Operates on surface meshes directly (not point clouds) — preserves curvature and normals
- Published accuracy: Dice coefficient ~0.93 on 3DTeethSeg22 benchmark
- Reference implementation publicly available (PyTorch)
- Inference time: ~2–5 seconds on GPU for a full arch at 50K faces

**Input:** Raw mesh faces, each face represented as:
- 3 vertex coordinates (9 floats)
- Face normal (3 floats)
- Face centroid (3 floats)
- Face area (1 float)
- Local curvature features (2 floats)

**Output:** Per-face label probabilities over 33 classes (FDI 11–48 + gingiva).

**Training data requirement:** ~200 annotated scans to reach clinical-grade accuracy.

### Alternative: PointNet++

**When to choose PointNet++ instead:**
- Input is an unstructured point cloud (no face connectivity)
- Faster iteration (simpler data pipeline)
- Available pretrained weights on ShapeNet

**Tradeoff:** PointNet++ samples points and loses face topology information. For dental applications where inter-tooth boundaries are defined by contact points and gingival margins (geometrically subtle), MeshSegNet's face-connectivity awareness is a significant advantage.

### Dataset: 3DTeethSeg22

**Source:** MICCAI 2022 Challenge — 3D Teeth Segmentation
**Size:** 1,765 intraoral scans with per-tooth FDI labels
**Format:** OBJ / STL mesh files + JSON label files
**License:** Research use, contact organizers for commercial licensing
**Access:** Dataset available via challenge organizers (Riadh Mtibaa et al.)
**Annotation quality:** Expert orthodontist annotations, high quality

This is the primary training dataset. It matches the data type (intraoral STL) and label schema (FDI numbering) exactly.

### Training Pipeline

```
3DTeethSeg22 raw OBJ files
    ↓  mesh_preprocessing.py
    ├── Decimate to ≤50K faces (MeshLab / Open3D)
    ├── Center and scale to unit bounding box
    ├── Compute per-face features (normal, centroid, curvature)
    └── Build face adjacency graph
    ↓  train_meshsegnet.py
    ├── MeshSegNet architecture (PyTorch)
    ├── Loss: cross-entropy + Dice loss (handles class imbalance)
    ├── Augmentation: random rotation (Y-axis), scale ±10%, noise
    ├── Batch size: 1–4 (mesh size varies)
    └── Hardware: single A100 GPU, ~12 hours for 200 epochs
    ↓  evaluate.py
    ├── Dice coefficient per FDI class
    ├── Mean IoU
    ├── FDI assignment accuracy (% correct label)
    └── Boundary quality (Hausdorff distance at tooth margins)
```

### Inference Service Design

```python
# ai/orthodontics/segmentation/interface.py

class DentalMesh:
    vertices: np.ndarray  # (N, 3)
    faces: np.ndarray     # (M, 3) indices into vertices

class SegmentationResult:
    labels: np.ndarray          # (M,) per-face FDI label
    confidence: np.ndarray      # (M,) per-face confidence
    tooth_centroids: dict       # {fdi: np.ndarray shape (3,)}
    tooth_axes: dict            # {fdi: np.ndarray shape (3,3)}

class Segmenter(Protocol):
    def segment(self, mesh: DentalMesh) -> SegmentationResult: ...
```

```python
# Implementation wrappers
class HeuristicSegmenter:          # wraps current meshSegmenter.ts logic ported to Python
class MeshSegNetSegmenter:         # loads checkpoint, runs inference
class EnsembleSegmenter:           # combines multiple models by confidence voting
```

---

## Phase 2 — Landmark Detection (Months 3–5)

**Goal:** Predict anatomical landmarks per tooth: incisal edge, cusp tips, mesial/distal contact points, CEJ (cement-enamel junction), root apex (estimated).

**Why it matters:** The current system uses bounding-box centroids for all measurements (overjet, overbite, arch width). These are approximations. Landmark-based measurements match clinical standards used in peer-reviewed orthodontic literature.

**Model:** PointNet++ operating on the per-tooth sub-mesh (output of Phase 1).

**Input:** Per-tooth point cloud (tooth-local coordinate frame, normalized).

**Output:**
```
{
  incisal_edge: [x, y, z],        # for incisors
  cusp_tip: [x, y, z],            # for canines/premolars
  mesiobuccal_cusp: [x, y, z],   # for molars
  mesial_contact: [x, y, z],
  distal_contact: [x, y, z],
  cej_mesial: [x, y, z],
  cej_distal: [x, y, z],
  long_axis: [dx, dy, dz],        # tooth long axis vector
}
```

---

## Phase 3 — Gingiva Segmentation (Parallel to Phase 1)

The current Y-threshold produces rough gingiva that is used only as a backdrop. Clinical workflows require the gingival margin as a landmark.

**Goal:** Detect the free gingival margin curve on the arch mesh, per tooth.

**Approach:** The gingival margin is a topological boundary between the attached gingiva and the tooth crown. On a properly segmented mesh (Phase 1 output), this boundary can be found by tracing the edge loop between tooth and gingiva labels — no additional model needed. Implemented as a post-processing step on the Phase 1 output.

---

## Phase 4 — Root Prediction (Months 5–8)

**Goal:** Estimate root morphology from crown geometry alone. This is needed for:
- Bodily movement vs. tipping risk assessment
- Root proximity warnings during treatment planning
- Torque prescription accuracy

**Approach:** 3D conditional generative model (VAE or diffusion-based). Input: crown mesh. Output: probabilistic root shape distribution. This requires a paired crown+root training dataset (CBCT + intraoral scan registration).

**Dataset:** Internal collection required or research collaboration. Public CBCT datasets include TCIA and IvisionLab.

**Complexity:** High. This is a research-level task and should follow Phase 2 completion.

---

## Phase 5 — Occlusion Classification (Months 6–9)

**Goal:** Classify the patient's bite relationship (Angle Class I/II/III), detect crossbite, openbite, deep bite, and measure inter-arch contacts.

**Approach:** After Phase 2 (landmarks), most occlusion metrics become geometric calculations (no ML needed). The landmark positions allow direct computation of:
- Overjet (upper incisal edge Z - lower incisal edge Z)
- Overbite (landmark-based vertical overlap, not centroid approximation)
- Angle classification (molar and canine relationships)
- Midline deviation (landmark midpoint comparison)

A small classifier can be added to handle edge cases and generate a natural-language assessment.

---

## Phase 6 — Attachment Recommendation (Months 8–12)

**Goal:** Recommend attachment type, surface, and placement position per tooth based on the planned movements.

**Current state:** `movement.py:recommend_attachment()` uses hard thresholds (rotation ≥ 8° → vertical rectangular, vertical ≥ 0.12mm → beveled horizontal). This does not account for tooth morphology, crown height, or adjacent tooth geometry.

**Proposed approach:** Supervised model trained on accepted treatment plans (pairs of [movement_vector, tooth_morphology] → [attachment_type, placement_surface, position]). Requires a labeled dataset of clinical cases.

**Fallback path (without dataset):** Encode Align Technology's published attachment guidelines as a rule engine with more parameters than the current hard thresholds.

---

## Phase 7 — IPR Recommendation (Months 8–12)

**Goal:** Recommend the precise amount of interproximal reduction between specific tooth pairs, timed to specific stages.

**Current state:** `movement.py:recommend_ipr()` applies a single formula based on total crowding. It does not measure contact point distances or account for enamel thickness.

**Correct approach:**
1. Measure inter-tooth contact point distances at initial and target positions
2. Calculate minimum space needed for correction without IPR
3. If IPR required: calculate amount per contact point pair proportional to adjacent movement magnitudes
4. Schedule IPR to occur 2–4 stages before the teeth in question reach their widest contact position

This can be implemented as a geometric algorithm (Phase 2 landmarks required for contact point detection).

---

## Evaluation Metrics

| Task | Primary Metric | Target |
|---|---|---|
| Tooth segmentation | Dice coefficient per FDI | ≥ 0.93 |
| FDI label accuracy | % correct tooth assignment | ≥ 95% |
| Boundary quality | Hausdorff distance at margins | ≤ 0.5 mm |
| Landmark detection | Mean absolute error | ≤ 0.3 mm |
| Root apex prediction | Mean surface-to-surface error | ≤ 1.5 mm |
| Treatment outcome | Duration prediction RMSE | ≤ 2 weeks |

---

## Model Candidate Comparison

| Model | Architecture | Dental Accuracy | Inference Speed | Integration Effort |
|---|---|---|---|---|
| MeshSegNet | Graph conv on mesh faces | High (dental-specific) | 2–5s GPU | Medium |
| PointNet++ | Hierarchical point set | Medium | 0.5–2s GPU | Low |
| Point Transformer | Attention on points | High (SOTA) | 1–4s GPU | Medium |
| MeshCNN | Conv on mesh edges | Medium | 3–8s GPU | High |
| DentalMeshSegNet | MeshSegNet variant | High | 2–5s GPU | Low (similar API) |
| MONAI | Medical imaging toolkit | N/A (no dental) | — | High |

**Recommendation:** Start with MeshSegNet (published dental benchmark) as the baseline. Track Point Transformer (ICCV 2021) as the upgrade path once training data exceeds 500 scans.

---

## Infrastructure Requirements

### Phase 1

- GPU inference server (NVIDIA A10G or equivalent, 24GB VRAM)
- PyTorch 2.x + CUDA 12
- Open3D for mesh preprocessing
- Model checkpoint storage (S3 or equivalent, ~500MB per model)
- FastAPI inference endpoint (separate from main API process)
- Async inference with job queue (Celery + Redis) for >5 second inference times

### Phase 2+

- CBCT processing: ITK-SNAP or SimpleITK
- Training infrastructure: A100 cluster or cloud (GCP Vertex AI / AWS SageMaker)
- Data versioning: DVC
- Experiment tracking: MLflow or Weights & Biases
- Annotation tool: 3D-Slicer or custom web annotation UI
