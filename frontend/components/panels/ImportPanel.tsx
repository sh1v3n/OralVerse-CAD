"use client";

import { useRef, useCallback } from "react";
import { useCaseStore } from "@/lib/caseStore";
import { useSTLScanStore } from "@/lib/scanStore";
import type { ImportStatus } from "@/lib/caseStore";

// Simulates the preprocessing pipeline stages with realistic timing
async function runImportPipeline(
  setProgress: (p: number, s?: ImportStatus) => void,
): Promise<void> {
  const steps: Array<{ label: ImportStatus; target: number; ms: number }> = [
    { label: "uploading", target: 30, ms: 800 },
    { label: "preprocessing", target: 60, ms: 1200 },
    { label: "segmenting", target: 90, ms: 2000 },
    { label: "ready", target: 100, ms: 400 },
  ];

  let current = 0;
  for (const step of steps) {
    setProgress(current, step.label);
    const delta = step.target - current;
    const ticks = 20;
    for (let i = 0; i < ticks; i++) {
      await new Promise((r) => setTimeout(r, step.ms / ticks));
      current = Math.round(current + delta * ((i + 1) / ticks));
      setProgress(current, step.label);
    }
  }
}

const STATUS_LABELS: Record<ImportStatus, string> = {
  idle: "Idle",
  uploading: "Uploading file…",
  preprocessing: "Preprocessing mesh…",
  segmenting: "Running AI segmentation…",
  ready: "Ready",
  error: "Import failed",
};

const STATUS_COLOR: Record<ImportStatus, string> = {
  idle: "bg-ink-40",
  uploading: "bg-blue-500",
  preprocessing: "bg-amber-500",
  segmenting: "bg-clay",
  ready: "bg-emerald-500",
  error: "bg-red-500",
};

interface Props {
  onComplete?: () => void;
}

export function ImportPanel({ onComplete }: Props) {
  const { importState, startImport, setImportProgress, finishImport, failImport, resetImport } =
    useCaseStore();
  const stlStore = useSTLScanStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleFile = useCallback(
    async (file: File) => {
      const allowed = [".stl", ".obj", ".ply", ".glb", ".gltf"];
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!allowed.includes(ext)) {
        failImport(`Unsupported format: ${ext}. Please use STL, OBJ, PLY, or GLB.`);
        return;
      }

      startImport(file.name);

      try {
        // For STL files, do real parsing into the viewer
        if (ext === ".stl") {
          // Determine arch from filename heuristic
          const lowerName = file.name.toLowerCase();
          const arch: "upper" | "lower" =
            lowerName.includes("lower") ||
            lowerName.includes("mandib") ||
            lowerName.includes("0b") ||
            lowerName.includes("1b")
              ? "lower"
              : "upper";

          // Start real loading
          setImportProgress(20, "preprocessing");
          await stlStore.loadDroppedFile(file, arch);
          setImportProgress(100, "ready");
          finishImport();
          onComplete?.();
        } else {
          // Simulated pipeline for other formats
          await runImportPipeline(setImportProgress);
          finishImport();
          onComplete?.();
        }
      } catch {
        failImport("An unexpected error occurred during import.");
      }
    },
    [startImport, setImportProgress, finishImport, failImport, onComplete, stlStore],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const { status, fileName, progress, errorMessage } = importState;
  const isActive = status !== "idle" && status !== "error";

  if (status === "idle" || status === "error") {
    return (
      <div className="space-y-3">
        {status === "error" && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700">
            {errorMessage}
          </div>
        )}
        <div
          onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => { dragCounter.current--; }}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line bg-cream-200 px-4 py-8 cursor-pointer hover:border-clay hover:bg-clay-soft transition-colors"
        >
          <svg className="w-8 h-8 text-ink-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-medium text-ink">Drop STL / OBJ / PLY / GLB here</p>
          <p className="text-xs text-ink-40">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            accept=".stl,.obj,.ply,.glb,.gltf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
        {status === "error" && (
          <button onClick={resetImport} className="text-xs text-ink-40 hover:text-ink underline">
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink truncate max-w-[160px]">{fileName}</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${STATUS_COLOR[status]}`}>
          {status === "ready" ? (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <span className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
          )}
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-cream-300">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-clay transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {isActive && (
        <p className="text-xs text-ink-40 text-center">{STATUS_LABELS[status]}</p>
      )}

      {status === "ready" && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
          Model imported successfully. Advance to Segmentation to review boundaries.
        </div>
      )}
    </div>
  );
}
