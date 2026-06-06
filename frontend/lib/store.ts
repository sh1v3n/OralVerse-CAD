import { create } from "zustand";
import type { ScanDto } from "./api";

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
