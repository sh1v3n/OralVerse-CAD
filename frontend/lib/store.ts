import { create } from "zustand";
import type { ScanDto } from "./api";
import type { TreatmentPlanDto } from "./api";
import { useToothObjectStore } from "./toothObjectStore";

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

export type WorkflowStage = "preprocessing" | "segmentation" | "initial_position" | "treatment_plan" | "final_position" | "staging" | "attachments" | "review";
export type CameraView = "maxillary" | "mandibular" | "labial" | "lingual" | "right" | "left" | "both" | "overjet";

interface TreatmentState {
  plan: TreatmentPlanDto | null;
  stage: number;
  playing: boolean;
  compareMode: "planned" | "before" | "after";
  selectedFdi: number | null;
  highlightedTeeth: number[];
  panel: "plan" | "report";
  workflowStage: WorkflowStage;
  cameraView: CameraView;
  activeTool: string | null;
  setPlan: (plan: TreatmentPlanDto) => void;
  setStage: (stage: number) => void;
  setPlaying: (playing: boolean) => void;
  setCompareMode: (mode: TreatmentState["compareMode"]) => void;
  selectTooth: (fdi: number | null) => void;
  setHighlightedTeeth: (teeth: number[]) => void;
  setPanel: (panel: TreatmentState["panel"]) => void;
  setWorkflowStage: (stage: WorkflowStage) => void;
  setCameraView: (view: CameraView) => void;
  setActiveTool: (tool: string | null) => void;
}

export const useTreatmentStore = create<TreatmentState>((set) => ({
  plan: null,
  stage: 0,
  playing: false,
  compareMode: "planned",
  selectedFdi: null,
  highlightedTeeth: [],
  panel: "plan",
  workflowStage: "segmentation",
  cameraView: "both",
  activeTool: null,
  setPlan: (plan) => set({ plan, stage: 0 }),
  setStage: (stage) => set({ stage, compareMode: "planned" }),
  setPlaying: (playing) => set({ playing }),
  setCompareMode: (compareMode) => set({ compareMode, playing: false }),
  selectTooth: (selectedFdi) => {
    set({ selectedFdi });
    // Keep tooth object store in sync
    if (selectedFdi !== null) {
      useToothObjectStore.getState().selectTooth(selectedFdi);
    } else {
      useToothObjectStore.getState().clearSelection();
    }
  },
  setHighlightedTeeth: (highlightedTeeth) => set({ highlightedTeeth }),
  setPanel: (panel) => set({ panel }),
  setWorkflowStage: (workflowStage) => set({ workflowStage }),
  setCameraView: (cameraView) => set({ cameraView }),
  setActiveTool: (activeTool) => set({ activeTool }),
}));
