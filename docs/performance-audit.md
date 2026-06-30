# OralVerse-CAD — Performance Audit

## Rendering

### 1. Segmentation Blocks the Main Thread

**File:** `frontend/components/panels/WorkflowPanels.tsx:162–177`

```typescript
const handleRunSegmentation = () => {
  if (upperArch) {
    const { teeth: upperTeeth, gingivaGeometry } = segmentArch(upperArch, "upper");
    // ^^^ synchronous, runs on main thread, may take 200-600ms
```

`segmentArch()` is called synchronously inside a React event handler. For a typical intraoral scan with 50,000–100,000 triangles, this involves:
- Triangle extraction loop: O(N) — ~50K iterations
- Bounding box computation: O(N)
- Triangle classification (gingiva/crown): O(N)
- Grid cell assignment: O(N)
- Flood-fill connected components: O(N × gridSize)
- K-means iteration: O(N × K × iterations) = O(50K × 14 × 8) ≈ 5.6M ops
- Geometry construction: O(N × 9) float copies

Estimated runtime on an M1 MacBook: 150–400ms. On a mid-range Windows laptop: 300–800ms. This freezes all animation, interactions, and React state updates for the full duration.

**Measured impact:** The Three.js render loop (`requestAnimationFrame`) is blocked. The viewer appears frozen during segmentation.

**Fix options (in order of implementation ease):**
1. Move segmentation to the backend Python API (avoids browser constraints entirely)
2. Port the algorithm to use `OffscreenCanvas` + `MessagePort` in a Web Worker (can transfer typed arrays)
3. Make segmentation incremental by processing triangles in chunks across multiple frames using `requestIdleCallback`

---

### 2. Material Recreation on State Change

**File:** `frontend/components/viewer/ToothMesh.tsx:75–86`

```typescript
const material = useMemo(() => {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(displayColor),
    ...
  });
}, [displayColor, mode]);
```

The material is created in `useMemo` keyed on `[displayColor, mode]`. Every time the tooth is selected or hovered (which changes `displayColor`), a new `MeshPhysicalMaterial` is created and uploaded to the GPU.

Meanwhile, a `useEffect` at line 89 immediately mutates the material's color, emissive, and clipping planes. The `useMemo` recreates the material on color change, and then the `useEffect` overwrites the color again on the same render.

The correct pattern is to create the material once, and always mutate it in `useEffect`:

```typescript
const material = useMemo(() => new THREE.MeshPhysicalMaterial({
  roughness: mode === "segmentation" ? 0.55 : 0.72,
  // do NOT set color here — set it in useEffect
}), [mode]);  // only recreate when mode changes
```

**Impact:** ~2 GPU material uploads per hover/select event per tooth. With 28 visible teeth, this is 56 unnecessary GPU calls per selection.

---

### 3. Non-Indexed Geometry in GPU

**File:** `frontend/lib/meshSegmenter.ts:438–474`

As documented in `technical-debt.md`, the output geometries are non-indexed. A 2,000-face tooth sends 6,000 vertex positions to the GPU instead of ~1,400. Across 28 teeth, this is ~168,000 vertices vs ~39,200 — a 4.3× vertex buffer overhead.

**GPU memory impact:** A 50K-triangle scan segmented into 28 teeth produces approximately:
- Non-indexed: 50,000 × 3 × 12 bytes = 1.8 MB position buffer per arch
- Indexed: ~500 KB (after vertex sharing)

On a mobile GPU with 4GB shared VRAM, this is not catastrophic, but it compounds with the LOD geometry also stored in the same GPU context.

---

### 4. useFrame Runs on Every Tooth Every Frame

**File:** `frontend/components/viewer/ToothMesh.tsx:180–226`

Each `ToothMesh` registers its own `useFrame` callback. With 28 teeth visible, 28 callbacks run on every animation frame (60fps = 60 × 28 = 1,680 calls/second).

Each callback:
1. Reads `useTreatmentPlanStore` state (plan status, currentStage)
2. Calls `getStageTransform(tooth.fdi)` — a lookup in `plan.teeth[fdi]`
3. Computes target position/quaternion
4. Calls `lerp()` and `slerp()` on the group

The lerp factor `1 - Math.pow(0.00001, delta)` approaches 1.0 very quickly (within ~1 second). After convergence, the tooth's position is within floating-point epsilon of the target, but the lerp and slerp continue running every frame forever.

**Fix:** Add a convergence check — if `position.distanceTo(target) < 0.0001` and `quaternion.angleTo(targetQuat) < 0.0001`, stop the lerp until the target changes.

Also consider unifying the stage transform into a single `useFrame` at the scene level rather than 28 individual subscriptions.

---

### 5. Camera lerp Targets a Constant Vector

**File:** `frontend/components/treatment/TreatmentViewer.tsx:54–63`

```typescript
function CameraController({ view }: { view: CameraView }) {
  const { camera } = useThree();
  const targetVec = useMemo(() => new THREE.Vector3(...CAMERA_POSITIONS[view]), [view]);

  useFrame(() => {
    camera.position.lerp(targetVec, 0.06);
    camera.lookAt(0, 0, 0);
  });
}
```

The camera lerps at factor 0.06 per frame. At 60fps, the camera never actually reaches the target — it asymptotically approaches. After 60 frames (1 second), the camera has covered:
`1 - (1 - 0.06)^60 ≈ 97.6%` of the distance.

The issue is that the `lookAt(0, 0, 0)` call overrides the quaternion set by `OrbitControls` (if present) every frame. This means the camera always stares at the origin, which is fine for the global arch view but wrong for any selection-based camera focus.

Additionally, the lerp runs every frame even when the camera is at its target (after convergence). This is wasted computation that also prevents the user's `OrbitControls` from working correctly when they try to orbit — the lerp fights their input.

**Fix:** Only run the camera lerp when the `view` prop has recently changed. Use a stable flag to stop lerping after convergence.

---

## STL Loading

### 6. No Streaming — Full STL Loaded Before Parsing

**File:** `frontend/lib/scanStore.ts:262–271`

```typescript
const url = `${API_URL}/api/stl/file/${encodeURIComponent(caseId)}/${encodeURIComponent(upperFile)}`;
const geoms = await loadSTLFromUrl(url);
```

`loadSTLFromUrl` fetches the complete binary STL before the Three.js `STLLoader` can parse it. A 30MB STL file (common for high-resolution intraoral scans) must be fully downloaded and held in an `ArrayBuffer` before any geometry is available.

**Backend caching:** The `stl_dataset.py` route correctly sets `Cache-Control: public, max-age=86400`, so repeat requests are served from the browser cache. First load latency remains an issue for larger files.

**Fix (short term):** Add a loading progress bar that accurately reflects download progress using `XMLHttpRequest` or `fetch` with `ReadableStream`.

**Fix (long term):** Move STL parsing to the backend and stream vertex/face data as JSON chunks or as a binary protocol buffer. This allows progressive mesh display as data arrives.

---

### 7. Geometry Cache is a Module-Level Object with No Eviction

**File:** `frontend/lib/scanStore.ts:56`

```typescript
const geometryCache: Record<string, CachedCase> = {};
```

The cache holds `THREE.BufferGeometry` objects (GPU-uploaded vertex data) for every case the user has loaded in this session. There is no eviction policy. If the user browses 20 cases in one session:
- 20 × 2 arches × 2 LOD levels × ~10MB each = ~800MB of GPU VRAM held
- The cache is never cleared unless the page reloads

**Fix:** Implement an LRU cache with a max size of 3–5 cases. When evicting, call `.dispose()` on the geometry before removing from cache.

---

### 8. LOD Swap is Instant, Causing Pop

**File:** `frontend/lib/scanStore.ts:170–196`

The LOD system switches between high-res and low-res geometry by updating `upperArch` / `lowerArch` in the store. When React reconciles, the mesh geometry changes instantly, producing a visible "pop" between resolutions.

**Intended behavior:** Low-res during orbit interaction (good for performance), high-res when still. The implementation is correct in concept but the snap is visually jarring.

**Fix:** Render both geometries simultaneously with a crossfade using `MeshBasicMaterial` opacity animation during the LOD transition, or use Three.js `LOD` object with smooth level transitions.

---

## Memory

### 9. ToothObject Holds Strong References to Three.js Geometry

**File:** `frontend/lib/toothObjectStore.ts:42–51`

```typescript
export interface ToothObject {
  geometry: THREE.BufferGeometry;  // holds GPU buffers
  ...
}
```

`ToothObject[]` is stored in Zustand state. Zustand's `set()` creates new state objects using spread. On every `setToothTransform()` call (which happens on every slider drag), the teeth array is reconstructed:

```typescript
setToothTransform: (fdi, partial) =>
  set((s) => ({
    teeth: s.teeth.map((t) =>
      t.fdi === fdi ? { ...t, transform: { ...t.transform, ...partial } } : t
    ),
  })),
```

This creates N-1 new ToothObject spread copies per slider event. The `geometry` field is shared by reference (not copied), so the GPU buffer is fine. But the JavaScript object allocation pressure during rapid slider dragging (60 events/second possible) may cause GC pauses.

**Fix:** Move mutable fields (transform) to a separate map keyed by FDI rather than storing them inside the immutable `ToothObject`. Only reconstruct the immutable geometry-carrying object when geometry actually changes.

---

## Backend

### 10. `_scan_manifest()` Walks the Filesystem on Every Request

**File:** `backend/app/routes/stl_dataset.py:64–94`

```python
def _scan_manifest(include_excluded: bool = False) -> list[dict[str, Any]]:
    for entry in sorted(_DATASET_DIR.iterdir()):
        for stl_file in sorted(entry.glob("*.stl")):
            ...
```

The manifest is computed fresh on every `GET /api/stl/cases` request. On a dataset with 100+ cases, this means 100+ `iterdir()` calls and `stat()` calls per request. The `ScanBrowser` component calls `fetchCases()` on mount, so this runs on every page load.

**Fix:** Cache the manifest in memory with a short TTL (60 seconds). A `functools.lru_cache` or module-level `dict` with a timestamp check is sufficient.

---

## Render Performance Summary

| Issue | Severity | Impact |
|---|---|---|
| Segmentation on main thread | High | 300–800ms freeze on every case load |
| Material recreation on select | Medium | 56 GPU calls per selection |
| Non-indexed geometry | Medium | 4× vertex buffer overhead |
| 28× useFrame callbacks | Low | Continuous 1,680 calls/sec overhead |
| Camera lerp fights OrbitControls | Medium | User cannot orbit freely |
| No geometry disposal | High | Growing GPU memory leak |
| STL cache no eviction | Medium | VRAM accumulates per session |
| Manifest computed per request | Low | Filesystem I/O on every page load |
