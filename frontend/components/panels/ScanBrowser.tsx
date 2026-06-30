"use client";

/**
 * Dataset browser panel — fetches and displays available STL cases,
 * lets the user pick and load one into the viewer.
 */

import { useEffect } from "react";
import { useSTLScanStore } from "@/lib/scanStore";
import type { CaseManifest } from "@/lib/scanStore";

export function ScanBrowser() {
  const {
    cases,
    activeCaseId,
    loadingStatus,
    loadingProgress,
    errorMessage,
    fetchCases,
    loadCase,
    clearMeshes,
  } = useSTLScanStore();

  // Fetch manifest on mount
  useEffect(() => {
    if (cases.length === 0) {
      fetchCases();
    }
  }, [cases.length, fetchCases]);

  const isLoading =
    loadingStatus === "loading" ||
    loadingStatus === "normalizing" ||
    loadingStatus === "fetching_manifest";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-40">
          Scan Dataset
        </p>
        {activeCaseId && (
          <button
            onClick={clearMeshes}
            className="text-[10px] text-red-500 hover:text-red-700 underline font-medium"
          >
            Clear
          </button>
        )}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-clay animate-pulse" />
            <span className="text-xs text-ink-70">
              {loadingStatus === "fetching_manifest"
                ? "Loading dataset…"
                : `Loading scan… ${loadingProgress}%`}
            </span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-cream-300">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-clay transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {loadingStatus === "error" && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Success indicator */}
      {loadingStatus === "ready" && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-xs text-emerald-700 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Scan loaded into viewer
        </div>
      )}

      {/* Case cards */}
      <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-0.5">
        {cases.map((c) => (
          <CaseCard
            key={c.id}
            caseData={c}
            isActive={c.id === activeCaseId}
            isLoading={isLoading && c.id === activeCaseId}
            onLoad={() => loadCase(c.id)}
          />
        ))}

        {cases.length === 0 && loadingStatus === "idle" && (
          <p className="text-xs text-ink-40 text-center py-4 italic">
            No dataset found. Place STL files in <code className="text-[10px]">datasets/data/</code>
          </p>
        )}
      </div>
    </div>
  );
}

function CaseCard({
  caseData,
  isActive,
  isLoading,
  onLoad,
}: {
  caseData: CaseManifest;
  isActive: boolean;
  isLoading: boolean;
  onLoad: () => void;
}) {
  const upperCount = caseData.scans.filter((s) => s.category === "upper_arch").length;
  const lowerCount = caseData.scans.filter((s) => s.category === "lower_arch").length;
  const totalSize = caseData.scans.reduce((sum, s) => sum + s.size_bytes, 0);

  return (
    <button
      onClick={onLoad}
      disabled={isLoading}
      className={`w-full rounded-lg border p-2.5 text-left transition-all ${
        isActive
          ? "border-clay/40 bg-clay-soft ring-1 ring-clay/30"
          : "border-line bg-surface-raised hover:border-clay/30 hover:bg-clay-soft/30"
      } ${isLoading ? "opacity-60 cursor-wait" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className={`text-sm font-semibold truncate ${isActive ? "text-clay-dark" : "text-ink"}`}>
            {caseData.label}
          </p>
          <p className="text-[10px] text-ink-40 mt-0.5">
            {caseData.scan_count} scans · {(totalSize / 1024 / 1024).toFixed(0)} MB
          </p>
        </div>
        {isActive && !isLoading && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-clay shrink-0">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}
        {isLoading && (
          <span className="h-5 w-5 rounded-full border-2 border-clay border-t-transparent animate-spin shrink-0" />
        )}
      </div>

      {/* Scan breakdown badges */}
      <div className="flex gap-1 mt-1.5 flex-wrap">
        {upperCount > 0 && (
          <span className="inline-flex items-center rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
            ↑ Upper ×{upperCount}
          </span>
        )}
        {lowerCount > 0 && (
          <span className="inline-flex items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
            ↓ Lower ×{lowerCount}
          </span>
        )}
        {caseData.scan_count - upperCount - lowerCount > 0 && (
          <span className="inline-flex items-center rounded-md bg-cream-200 px-1.5 py-0.5 text-[9px] font-bold text-ink-40">
            +{caseData.scan_count - upperCount - lowerCount} more
          </span>
        )}
      </div>
    </button>
  );
}
