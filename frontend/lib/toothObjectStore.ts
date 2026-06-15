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

// ─── Segmentation Metadata ────────────────────────────────────────────────────

export interface SegmentationMeta {
  confidence: number;           // 0–1 (1 = manually verified)
  source: "heuristic" | "manual" | "ml";
  color: string;                // hex color for segmentation overlay
  triangleCount: number;        // how many triangles in this tooth
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

  // Selectors
  getToothByFdi: (fdi: number) => ToothObject | undefined;
  getSelectedTeeth: () => ToothObject[];
  getUpperTeeth: () => ToothObject[];
  getLowerTeeth: () => ToothObject[];
}

export const useToothObjectStore = create<ToothObjectState>((set, get) => ({
  teeth: [],
  gingivaUpper: null,
  gingivaLower: null,
  selectedFdis: new Set<number>(),
  hoveredFdi: null,
  showSegmentationColors: false,

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

  // ── Selectors ────────────────────────────────────────────────────────────

  getToothByFdi: (fdi) => get().teeth.find((t) => t.fdi === fdi),
  getSelectedTeeth: () => {
    const selected = get().selectedFdis;
    return get().teeth.filter((t) => selected.has(t.fdi));
  },
  getUpperTeeth: () => get().teeth.filter((t) => t.arch === "upper"),
  getLowerTeeth: () => get().teeth.filter((t) => t.arch === "lower"),
}));
