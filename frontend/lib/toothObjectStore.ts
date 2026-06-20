/**
 * Tooth Object Store
 *
 * Core domain model for individually addressable teeth.
 * Each tooth carries its own geometry, transforms, selection, and segmentation metadata.
 * The store also holds the separated gingiva geometry.
 */

import { create } from "zustand";
import * as THREE from "three";
import type { ToothKind } from "./teeth";
import { toothKind, isUpper } from "./teeth";

// ─── Tooth Transform ──────────────────────────────────────────────────────────

export interface ToothTransform {
  translation: [number, number, number]; // mm offset from original centroid
  rotation: [number, number, number];    // degrees: [torque, tip, rotation]
  intrusion: number;                      // mm (+up for upper, +down for lower)
}

export function emptyTransform(): ToothTransform {
  return {
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
    intrusion: 0,
  };
}

// ─── Verification State ───────────────────────────────────────────────────────

export type VerificationState =
  | "auto"       // from heuristic or ML, unreviewed
  | "reviewed"   // clinician reviewed and accepted
  | "corrected"  // clinician made edits (FDI change, merge)
  | "verified";  // explicitly verified (confidence locked to 1.0)

// ─── Segmentation Metadata ────────────────────────────────────────────────────

export interface SegmentationMeta {
  confidence: number;                 // 0–1 (1 = manually verified)
  source: "heuristic" | "manual" | "ml";
  color: string;                      // hex color for segmentation overlay
  triangleCount: number;              // how many triangles in this tooth
  verificationState: VerificationState;
}

// ─── Tooth Object ─────────────────────────────────────────────────────────────

export interface ToothObject {
  id: string;                             // "tooth-11", "tooth-21", etc.
  fdi: number;
  arch: "upper" | "lower";
  kind: ToothKind;
  geometry: THREE.BufferGeometry;
  centroid: THREE.Vector3;
  boundingBox: THREE.Box3;
  visible: boolean;
  transform: ToothTransform;
  segmentation: SegmentationMeta;
}

// ─── Segmentation Colors (32 distinct hues for up to 32 teeth) ────────────────

const SEGMENTATION_COLORS = [
  "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4",
  "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990", "#dcbeff",
  "#9A6324", "#fffac8", "#800000", "#aaffc3", "#808000", "#ffd8b1",
  "#000075", "#a9a9a9", "#e6beff", "#1abc9c", "#d35400", "#2ecc71",
  "#8e44ad", "#2980b9", "#c0392b", "#27ae60", "#f39c12", "#1e3799",
  "#6c5ce7", "#00cec9",
];

export function getSegmentationColor(index: number): string {
  return SEGMENTATION_COLORS[index % SEGMENTATION_COLORS.length];
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ToothObjectState {
  // Segmented tooth objects
  teeth: ToothObject[];
  gingivaUpper: THREE.BufferGeometry | null;
  gingivaLower: THREE.BufferGeometry | null;

  // Selection
  selectedFdis: Set<number>;
  hoveredFdi: number | null;

  // Display modes
  showSegmentationColors: boolean;

  // Actions — Population
  setSegmentedTeeth: (teeth: ToothObject[]) => void;
  setGingiva: (arch: "upper" | "lower", geometry: THREE.BufferGeometry) => void;
  clearSegmentation: () => void;

  // Actions — Selection
  selectTooth: (fdi: number) => void;
  deselectTooth: (fdi: number) => void;
  toggleTooth: (fdi: number) => void;
  clearSelection: () => void;
  selectMultiple: (fdis: number[]) => void;
  setHoveredTooth: (fdi: number | null) => void;

  // Actions — Transforms
  setToothTransform: (fdi: number, transform: Partial<ToothTransform>) => void;
  resetToothTransform: (fdi: number) => void;
  resetAllTransforms: () => void;

  // Actions — Visibility
  setToothVisibility: (fdi: number, visible: boolean) => void;
  setAllVisibility: (visible: boolean) => void;

  // Actions — Display
  setShowSegmentationColors: (show: boolean) => void;

  // Actions — Manual Correction
  reassignFdi: (oldFdi: number, newFdi: number) => void;
  mergeTeeth: (fdi1: number, fdi2: number) => void;
  setVerificationState: (fdi: number, state: VerificationState) => void;
  verifyTooth: (fdi: number) => void;

  // Selectors
  getToothByFdi: (fdi: number) => ToothObject | undefined;
  getSelectedTeeth: () => ToothObject[];
  getUpperTeeth: () => ToothObject[];
  getLowerTeeth: () => ToothObject[];
  getVerificationSummary: () => { total: number; verified: number; corrected: number; auto: number };
}

export const useToothObjectStore = create<ToothObjectState>((set, get) => ({
  teeth: [],
  gingivaUpper: null,
  gingivaLower: null,
  selectedFdis: new Set<number>(),
  hoveredFdi: null,
  showSegmentationColors: true,

  // ── Population ───────────────────────────────────────────────────────────

  setSegmentedTeeth: (teeth) => set({ teeth }),

  setGingiva: (arch, geometry) =>
    set(arch === "upper" ? { gingivaUpper: geometry } : { gingivaLower: geometry }),

  clearSegmentation: () =>
    set({
      teeth: [],
      gingivaUpper: null,
      gingivaLower: null,
      selectedFdis: new Set(),
      hoveredFdi: null,
    }),

  // ── Selection ────────────────────────────────────────────────────────────

  selectTooth: (fdi) =>
    set(() => {
      const next = new Set<number>([fdi]);
      return { selectedFdis: next };
    }),

  deselectTooth: (fdi) =>
    set((s) => {
      const next = new Set(s.selectedFdis);
      next.delete(fdi);
      return { selectedFdis: next };
    }),

  toggleTooth: (fdi) =>
    set((s) => {
      const next = new Set(s.selectedFdis);
      if (next.has(fdi)) next.delete(fdi);
      else next.add(fdi);
      return { selectedFdis: next };
    }),

  clearSelection: () => set({ selectedFdis: new Set() }),

  selectMultiple: (fdis) =>
    set((s) => {
      const next = new Set(s.selectedFdis);
      fdis.forEach((f) => next.add(f));
      return { selectedFdis: next };
    }),

  setHoveredTooth: (fdi) => {
    if (get().hoveredFdi !== fdi) {
      set({ hoveredFdi: fdi });
    }
  },

  // ── Transforms ───────────────────────────────────────────────────────────

  setToothTransform: (fdi, partial) =>
    set((s) => ({
      teeth: s.teeth.map((t) =>
        t.fdi === fdi
          ? { ...t, transform: { ...t.transform, ...partial } }
          : t,
      ),
    })),

  resetToothTransform: (fdi) =>
    set((s) => ({
      teeth: s.teeth.map((t) =>
        t.fdi === fdi ? { ...t, transform: emptyTransform() } : t,
      ),
    })),

  resetAllTransforms: () =>
    set((s) => ({
      teeth: s.teeth.map((t) => ({ ...t, transform: emptyTransform() })),
    })),

  // ── Visibility ───────────────────────────────────────────────────────────

  setToothVisibility: (fdi, visible) =>
    set((s) => ({
      teeth: s.teeth.map((t) => (t.fdi === fdi ? { ...t, visible } : t)),
    })),

  setAllVisibility: (visible) =>
    set((s) => ({
      teeth: s.teeth.map((t) => ({ ...t, visible })),
    })),

  // ── Display ──────────────────────────────────────────────────────────────

  setShowSegmentationColors: (show) => set({ showSegmentationColors: show }),

  // ── Manual Correction ─────────────────────────────────────────────────────

  reassignFdi: (oldFdi, newFdi) =>
    set((s) => ({
      teeth: s.teeth.map((t) =>
        t.fdi === oldFdi
          ? {
              ...t,
              fdi: newFdi,
              id: `tooth-${newFdi}`,
              arch: (newFdi >= 11 && newFdi <= 28 ? "upper" : "lower") as "upper" | "lower",
              kind: toothKind(newFdi),
              segmentation: {
                ...t.segmentation,
                confidence: Math.min(t.segmentation.confidence, 0.7),
                verificationState: "corrected" as VerificationState,
              },
            }
          : t,
      ),
      selectedFdis: (() => {
        const next = new Set(s.selectedFdis);
        if (next.has(oldFdi)) { next.delete(oldFdi); next.add(newFdi); }
        return next;
      })(),
    })),

  mergeTeeth: (fdi1, fdi2) =>
    set((s) => {
      const t1 = s.teeth.find((t) => t.fdi === fdi1);
      const t2 = s.teeth.find((t) => t.fdi === fdi2);
      if (!t1 || !t2) return s;

      // Merge geometries
      const merged = new THREE.BufferGeometry();
      const p1 = t1.geometry.getAttribute("position") as THREE.BufferAttribute;
      const p2 = t2.geometry.getAttribute("position") as THREE.BufferAttribute;
      const combined = new Float32Array(p1.array.length + p2.array.length);
      combined.set(p1.array, 0);
      combined.set(p2.array as Float32Array, p1.array.length);
      merged.setAttribute("position", new THREE.BufferAttribute(combined, 3));
      merged.computeVertexNormals();
      merged.computeBoundingBox();

      const totalTris = t1.segmentation.triangleCount + t2.segmentation.triangleCount;
      const mergedCentroid = new THREE.Vector3()
        .addScaledVector(t1.centroid, t1.segmentation.triangleCount / totalTris)
        .addScaledVector(t2.centroid, t2.segmentation.triangleCount / totalTris);

      const mergedTooth: ToothObject = {
        ...t1,
        geometry: merged,
        centroid: mergedCentroid,
        boundingBox: merged.boundingBox!.clone(),
        segmentation: {
          ...t1.segmentation,
          triangleCount: totalTris,
          confidence: Math.min(t1.segmentation.confidence, t2.segmentation.confidence, 0.7),
          verificationState: "corrected",
        },
      };

      const next = new Set(s.selectedFdis);
      next.delete(fdi2);
      return {
        teeth: s.teeth.filter((t) => t.fdi !== fdi1 && t.fdi !== fdi2).concat(mergedTooth),
        selectedFdis: next,
      };
    }),

  setVerificationState: (fdi, state) =>
    set((s) => ({
      teeth: s.teeth.map((t) =>
        t.fdi === fdi
          ? {
              ...t,
              segmentation: {
                ...t.segmentation,
                verificationState: state,
                confidence: state === "verified" ? 1.0 : t.segmentation.confidence,
              },
            }
          : t,
      ),
    })),

  verifyTooth: (fdi) =>
    set((s) => ({
      teeth: s.teeth.map((t) =>
        t.fdi === fdi
          ? {
              ...t,
              segmentation: {
                ...t.segmentation,
                verificationState: "verified",
                confidence: 1.0,
              },
            }
          : t,
      ),
    })),

  // ── Selectors ────────────────────────────────────────────────────────────

  getToothByFdi: (fdi) => get().teeth.find((t) => t.fdi === fdi),
  getSelectedTeeth: () => {
    const selected = get().selectedFdis;
    return get().teeth.filter((t) => selected.has(t.fdi));
  },
  getUpperTeeth: () => get().teeth.filter((t) => t.arch === "upper"),
  getLowerTeeth: () => get().teeth.filter((t) => t.arch === "lower"),
  getVerificationSummary: () => {
    const teeth = get().teeth;
    return {
      total: teeth.length,
      verified: teeth.filter((t) => t.segmentation.verificationState === "verified" || t.segmentation.verificationState === "reviewed").length,
      corrected: teeth.filter((t) => t.segmentation.verificationState === "corrected").length,
      auto: teeth.filter((t) => t.segmentation.verificationState === "auto").length,
    };
  },
}));
