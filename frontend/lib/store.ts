import { create } from "zustand";
import type { ScanDto } from "./api";
import type { TreatmentPlanDto } from "./api";

interface ScanState {
  scan: ScanDto | null;
  selectedFdi: number | null;
  status: "idle" | "uploading" | "analyzing" | "ready" | "error";
  error: string | null;
  setScan: (scan: ScanDto | null) => void;
  selectTooth: (fdi: number | null) => void;
  setStatus: (status: ScanState["status"], error?: string | null) => void;
}

export const useScanStore = create<ScanState>((set) => ({
  scan: null,
  selectedFdi: null,
  status: "idle",
  error: null,
  setScan: (scan) => set({ scan }),
  selectTooth: (fdi) => set({ selectedFdi: fdi }),
  setStatus: (status, error = null) => set({ status, error }),
}));

interface TreatmentState {
  plan: TreatmentPlanDto | null;
  stage: number;
  playing: boolean;
  compareMode: "planned" | "before" | "after";
  selectedFdi: number | null;
  highlightedTeeth: number[];
  panel: "plan" | "report";
  setPlan: (plan: TreatmentPlanDto) => void;
  setStage: (stage: number) => void;
  setPlaying: (playing: boolean) => void;
  setCompareMode: (mode: TreatmentState["compareMode"]) => void;
  selectTooth: (fdi: number | null) => void;
  setHighlightedTeeth: (teeth: number[]) => void;
  setPanel: (panel: TreatmentState["panel"]) => void;
}

export const useTreatmentStore = create<TreatmentState>((set) => ({
  plan: null,
  stage: 0,
  playing: false,
  compareMode: "planned",
  selectedFdi: null,
  highlightedTeeth: [],
  panel: "plan",
  setPlan: (plan) => set({ plan, stage: 0 }),
  setStage: (stage) => set({ stage, compareMode: "planned" }),
  setPlaying: (playing) => set({ playing }),
  setCompareMode: (compareMode) => set({ compareMode, playing: false }),
  selectTooth: (selectedFdi) => set({ selectedFdi }),
  setHighlightedTeeth: (highlightedTeeth) => set({ highlightedTeeth }),
  setPanel: (panel) => set({ panel }),
}));
