/**
 * Zustand store for managing loaded STL dental scans.
 *
 * Tracks loaded geometries, active case, display options, and loading state.
 * Geometries are stored as Three.js BufferGeometry references (NOT serialised).
 */

import { create } from "zustand";
import * as THREE from "three";
import { loadSTLFromUrl, loadSTLFromFile, meshStats } from "./stlLoader";
import type { MaterialPreset } from "./stlMaterials";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScanFileInfo {
  filename: string;
  size_bytes: number;
  category: string;
  excluded: boolean;
}

export interface CaseManifest {
  id: string;
  label: string;
  scan_count: number;
  scans: ScanFileInfo[];
}

export interface MeshInfo {
  vertices: number;
  triangles: number;
  fileName: string;
}

export type STLLoadingStatus =
  | "idle"
  | "fetching_manifest"
  | "loading"
  | "normalizing"
  | "ready"
  | "error";

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CachedCase {
  upperHigh: THREE.BufferGeometry | null;
  upperLow: THREE.BufferGeometry | null;
  lowerHigh: THREE.BufferGeometry | null;
  lowerLow: THREE.BufferGeometry | null;
  upperInfo: MeshInfo | null;
  lowerInfo: MeshInfo | null;
}

const geometryCache: Record<string, CachedCase> = {};

// ─── Store ────────────────────────────────────────────────────────────────────

export type PerformanceMode = "low" | "auto" | "high";

interface STLScanState {
  // Dataset
  cases: CaseManifest[];
  activeCaseId: string | null;

  // Active geometries (swapped based on PerformanceMode & Interaction)
  upperArch: THREE.BufferGeometry | null;
  lowerArch: THREE.BufferGeometry | null;
  additionalMeshes: THREE.BufferGeometry[];

  // Source geometries
  upperHighRes: THREE.BufferGeometry | null;
  upperLowRes: THREE.BufferGeometry | null;
  lowerHighRes: THREE.BufferGeometry | null;
  lowerLowRes: THREE.BufferGeometry | null;

  // Mesh metadata
  upperInfo: MeshInfo | null;
  lowerInfo: MeshInfo | null;

  // Loading state
  loadingStatus: STLLoadingStatus;
  loadingProgress: number;
  errorMessage: string | null;

  // Display options
  showUpper: boolean;
  showLower: boolean;
  meshOpacity: number;
  wireframe: boolean;
  materialPreset: MaterialPreset;
  clipPlaneEnabled: boolean;
  clipPlanePosition: number; // -1 to 1
  segmented: boolean;

  // Performance & Quality Optimization
  performanceMode: PerformanceMode;
  shadowsEnabled: boolean;
  isInteracting: boolean;

  // Actions
  fetchCases: () => Promise<void>;
  loadCase: (caseId: string) => Promise<void>;
  loadDroppedFile: (file: File, arch: "upper" | "lower") => Promise<void>;
  clearMeshes: () => void;
  setShowUpper: (v: boolean) => void;
  setShowLower: (v: boolean) => void;
  setMeshOpacity: (v: number) => void;
  setWireframe: (v: boolean) => void;
  setMaterialPreset: (p: MaterialPreset) => void;
  setClipPlaneEnabled: (v: boolean) => void;
  setClipPlanePosition: (v: number) => void;
  setSegmented: (v: boolean) => void;
  
  // Optimization Actions
  setPerformanceMode: (mode: PerformanceMode) => void;
  setShadowsEnabled: (enabled: boolean) => void;
  setIsInteracting: (interacting: boolean) => void;
  syncActiveGeometries: () => void;
}

export const useSTLScanStore = create<STLScanState>((set, get) => ({
  // Initial state
  cases: [],
  activeCaseId: null,
  upperArch: null,
  lowerArch: null,
  additionalMeshes: [],
  upperHighRes: null,
  upperLowRes: null,
  lowerHighRes: null,
  lowerLowRes: null,
  upperInfo: null,
  lowerInfo: null,
  loadingStatus: "idle",
  loadingProgress: 0,
  errorMessage: null,
  showUpper: true,
  showLower: true,
  meshOpacity: 1,
  wireframe: false,
  materialPreset: "bone",
  clipPlaneEnabled: false,
  clipPlanePosition: 0,
  segmented: false,
  
  // Optimization initial state
  performanceMode: "auto",
  shadowsEnabled: true,
  isInteracting: false,

  // ── Actions ───────────────────────────────────────────────────────────────

  fetchCases: async () => {
    set({ loadingStatus: "fetching_manifest" });
    try {
      const res = await fetch(`${API_URL}/api/stl/cases`);
      if (!res.ok) throw new Error(`Failed to fetch cases: ${res.status}`);
      const cases: CaseManifest[] = await res.json();
      set({ cases, loadingStatus: "idle" });
    } catch (err: any) {
      set({
        loadingStatus: "error",
        errorMessage: err.message ?? "Failed to fetch dataset",
      });
    }
  },

  syncActiveGeometries: () => {
    const {
      upperHighRes,
      upperLowRes,
      lowerHighRes,
      lowerLowRes,
      performanceMode,
      isInteracting,
    } = get();

    let upper: THREE.BufferGeometry | null = null;
    let lower: THREE.BufferGeometry | null = null;

    if (performanceMode === "low") {
      upper = upperLowRes;
      lower = lowerLowRes;
    } else if (performanceMode === "high") {
      upper = upperHighRes;
      lower = lowerHighRes;
    } else {
      // "auto" (LOD) - use low-res mesh during active rotation/interaction
      upper = isInteracting ? upperLowRes : upperHighRes;
      lower = isInteracting ? lowerLowRes : lowerHighRes;
    }

    set({ upperArch: upper, lowerArch: lower });
  },

  loadCase: async (caseId: string) => {
    const { cases } = get();
    const caseData = cases.find((c) => c.id === caseId);
    if (!caseData) {
      set({ errorMessage: `Case "${caseId}" not found` });
      return;
    }

    // 1. Check cache first for instant loading
    if (geometryCache[caseId]) {
      const cached = geometryCache[caseId];
      set({
        activeCaseId: caseId,
        upperHighRes: cached.upperHigh,
        upperLowRes: cached.upperLow,
        lowerHighRes: cached.lowerHigh,
        lowerLowRes: cached.lowerLow,
        upperInfo: cached.upperInfo,
        lowerInfo: cached.lowerInfo,
        loadingStatus: "ready",
        loadingProgress: 100,
        errorMessage: null,
      });
      get().syncActiveGeometries();
      return;
    }

    set({
      activeCaseId: caseId,
      loadingStatus: "loading",
      loadingProgress: 0,
      errorMessage: null,
      upperArch: null,
      lowerArch: null,
      upperHighRes: null,
      upperLowRes: null,
      lowerHighRes: null,
      lowerLowRes: null,
      additionalMeshes: [],
      upperInfo: null,
      lowerInfo: null,
    });

    try {
      // Find upper and lower arch scans
      const upperScan = caseData.scans.find((s) => s.category === "upper_arch");
      const lowerScan = caseData.scans.find((s) => s.category === "lower_arch");

      // If no classified scans, load the first 1-2 scans as upper/lower
      const fallbackScans = caseData.scans.filter((s) => !s.excluded);

      const upperFile = upperScan?.filename ?? fallbackScans[0]?.filename;
      const lowerFile = lowerScan?.filename ?? fallbackScans[1]?.filename;

      let upperHigh: THREE.BufferGeometry | null = null;
      let upperLow: THREE.BufferGeometry | null = null;
      let lowerHigh: THREE.BufferGeometry | null = null;
      let lowerLow: THREE.BufferGeometry | null = null;
      let uInfo: MeshInfo | null = null;
      let lInfo: MeshInfo | null = null;

      if (upperFile) {
        set({ loadingProgress: 20 });
        const url = `${API_URL}/api/stl/file/${encodeURIComponent(caseId)}/${encodeURIComponent(upperFile)}`;
        const geoms = await loadSTLFromUrl(url);
        upperHigh = geoms.highRes;
        upperLow = geoms.lowRes;

        // Shift upper arches up
        upperHigh.translate(0, 1.0, 0);
        upperLow.translate(0, 1.0, 0);

        const stats = meshStats(upperHigh);
        uInfo = { vertices: stats.vertices, triangles: stats.triangles, fileName: upperFile };
        set({
          upperHighRes: upperHigh,
          upperLowRes: upperLow,
          upperInfo: uInfo,
          loadingProgress: 50,
        });
      }

      if (lowerFile) {
        set({ loadingProgress: 60 });
        const url = `${API_URL}/api/stl/file/${encodeURIComponent(caseId)}/${encodeURIComponent(lowerFile)}`;
        const geoms = await loadSTLFromUrl(url);
        lowerHigh = geoms.highRes;
        lowerLow = geoms.lowRes;

        // Shift lower arches down
        lowerHigh.translate(0, -1.0, 0);
        lowerLow.translate(0, -1.0, 0);

        const stats = meshStats(lowerHigh);
        lInfo = { vertices: stats.vertices, triangles: stats.triangles, fileName: lowerFile };
        set({
          lowerHighRes: lowerHigh,
          lowerLowRes: lowerLow,
          lowerInfo: lInfo,
          loadingProgress: 90,
        });
      }

      // Populate Cache
      geometryCache[caseId] = {
        upperHigh,
        upperLow,
        lowerHigh,
        lowerLow,
        upperInfo: uInfo,
        lowerInfo: lInfo,
      };

      set({
        loadingStatus: "ready",
        loadingProgress: 100,
      });

      get().syncActiveGeometries();
    } catch (err: any) {
      set({
        loadingStatus: "error",
        errorMessage: err.message ?? "Failed to load STL files",
        loadingProgress: 0,
      });
    }
  },

  loadDroppedFile: async (file: File, arch: "upper" | "lower") => {
    set({
      loadingStatus: "loading",
      loadingProgress: 10,
      errorMessage: null,
    });

    try {
      const geoms = await loadSTLFromFile(file);
      const high = geoms.highRes;
      const low = geoms.lowRes;
      
      set({ loadingProgress: 70 });

      // Position based on arch
      if (arch === "upper") {
        high.translate(0, 1.0, 0);
        low.translate(0, 1.0, 0);
      } else {
        high.translate(0, -1.0, 0);
        low.translate(0, -1.0, 0);
      }

      const stats = meshStats(high);
      const info: MeshInfo = {
        vertices: stats.vertices,
        triangles: stats.triangles,
        fileName: file.name,
      };

      if (arch === "upper") {
        set({
          upperHighRes: high,
          upperLowRes: low,
          upperInfo: info,
        });
      } else {
        set({
          lowerHighRes: high,
          lowerLowRes: low,
          lowerInfo: info,
        });
      }

      set({
        loadingStatus: "ready",
        loadingProgress: 100,
        activeCaseId: `dropped-${file.name}`,
      });

      get().syncActiveGeometries();
    } catch (err: any) {
      set({
        loadingStatus: "error",
        errorMessage: err.message ?? "Failed to parse STL file",
        loadingProgress: 0,
      });
    }
  },

  clearMeshes: () =>
    set({
      upperArch: null,
      lowerArch: null,
      upperHighRes: null,
      upperLowRes: null,
      lowerHighRes: null,
      lowerLowRes: null,
      additionalMeshes: [],
      upperInfo: null,
      lowerInfo: null,
      activeCaseId: null,
      loadingStatus: "idle",
      loadingProgress: 0,
      errorMessage: null,
    }),

  setShowUpper: (v) => set({ showUpper: v }),
  setShowLower: (v) => set({ showLower: v }),
  setMeshOpacity: (v) => set({ meshOpacity: v }),
  setWireframe: (v) => set({ wireframe: v }),
  setMaterialPreset: (p) => set({ materialPreset: p }),
  setClipPlaneEnabled: (v) => set({ clipPlaneEnabled: v }),
  setClipPlanePosition: (v) => set({ clipPlanePosition: v }),
  setSegmented: (v) => set({ segmented: v }),
  
  setPerformanceMode: (mode) => {
    set({ performanceMode: mode });
    get().syncActiveGeometries();
  },
  setShadowsEnabled: (enabled) => set({ shadowsEnabled: enabled }),
  setIsInteracting: (interacting) => {
    // Only update if value actually changes to avoid unnecessary re-renders
    if (get().isInteracting !== interacting) {
      set({ isInteracting: interacting });
      get().syncActiveGeometries();
    }
  },
}));

