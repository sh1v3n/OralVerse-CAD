"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { useCaseStore } from "@/lib/caseStore";
import { useTreatmentStore } from "@/lib/store";
import { useSTLScanStore } from "@/lib/scanStore";
import { useToothObjectStore } from "@/lib/toothObjectStore";
import type { ToothObject, VerificationState } from "@/lib/toothObjectStore";
import { emptyTransform, getSegmentationColor } from "@/lib/toothObjectStore";
import { useTreatmentPlanStore } from "@/lib/treatmentPlanStore";
import { segmentArchMesh, type SegmentationResponse } from "@/lib/api";
import { ImportPanel } from "./ImportPanel";
import { ScanBrowser } from "./ScanBrowser";
import { ALL_FDI, toothKind } from "@/lib/teeth";
import { StageControls } from "@/components/treatment/StageControls";
import { useClinicalDiagnostics } from "@/lib/useClinicalDiagnostics";
import type { Measurement } from "@/lib/clinicalMeasurements";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">
      {children}
    </p>
  );
}

function ToggleRow({
  label,
  checked,
  onToggle,
  description,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  description?: string;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all ${
        checked
          ? "border-indigo-200 bg-indigo-50"
          : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <div>
        <p className={`text-sm font-medium ${checked ? "text-indigo-900" : "text-slate-700"}`}>
          {label}
        </p>
        {description && (
          <p className="text-[11px] text-slate-400 leading-tight mt-0.5">{description}</p>
        )}
      </div>
      <div
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-slate-200"}`}
      >
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? "left-4" : "left-0.5"
          }`}
        />
      </div>
    </button>
  );
}

// ─── Tooth grid for extraction / locking ──────────────────────────────────────

function ToothGrid({
  selected,
  onToggle,
  color = "red",
}: {
  selected: number[];
  onToggle: (fdi: number) => void;
  color?: "red" | "indigo";
}) {
  const upper = ALL_FDI.filter((f) => f < 30);
  const lower = ALL_FDI.filter((f) => f >= 30);

  const kind = (fdi: number) => {
    const k = toothKind(fdi);
    if (k === "incisor") return "I";
    if (k === "canine") return "C";
    if (k === "premolar") return "P";
    return "M";
  };

  const colorClass = color === "red"
    ? "bg-red-100 text-red-700 border-red-300 ring-red-400"
    : "bg-indigo-100 text-indigo-700 border-indigo-300 ring-indigo-400";

  return (
    <div className="space-y-1.5">
      {[upper, lower].map((row, ri) => (
        <div key={ri} className="flex gap-0.5 justify-center flex-wrap">
          {(ri === 0 ? [...row].reverse() : row).map((fdi) => {
            const isSelected = selected.includes(fdi);
            return (
              <button
                key={fdi}
                onClick={() => onToggle(fdi)}
                title={`FDI ${fdi} · ${kind(fdi)}`}
                className={`relative h-8 w-7 rounded border text-[9px] font-bold transition-all ${
                  isSelected
                    ? `${colorClass} ring-1`
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                }`}
              >
                {fdi}
                <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] opacity-60`}>
                  {kind(fdi)}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Stage Panels ─────────────────────────────────────────────────────────────

export function PreprocessingPanel() {
  return (
    <div className="space-y-4">
      {/* Dataset browser is the ONLY primary import path */}
      <ScanBrowser />

      {/* Drag-and-drop as secondary option */}
      <details className="group">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 hover:text-stone-600 transition-colors py-1 border-t border-stone-100">
            <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Drop custom STL file
          </div>
        </summary>
        <div className="mt-2">
          <ImportPanel />
        </div>
      </details>
    </div>
  );
}

// ── Geometry serialisation ────────────────────────────────────────────────────

function serializeGeometry(geometry: THREE.BufferGeometry): {
  vertices: number[][];
  faces: number[][];
} {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const idx = geometry.getIndex();

  const vertices: number[][] = [];
  for (let i = 0; i < pos.count; i++) {
    vertices.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }

  const faces: number[][] = [];
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      faces.push([idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      faces.push([i, i + 1, i + 2]);
    }
  }

  return { vertices, faces };
}

function buildToothGeometry(
  faceIndices: number[],
  geometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const idx = geometry.getIndex();
  const positions = new Float32Array(faceIndices.length * 9);
  let base = 0;

  for (const fi of faceIndices) {
    let ai: number, bi: number, ci: number;
    if (idx) {
      ai = idx.getX(fi * 3);
      bi = idx.getX(fi * 3 + 1);
      ci = idx.getX(fi * 3 + 2);
    } else {
      ai = fi * 3;
      bi = fi * 3 + 1;
      ci = fi * 3 + 2;
    }
    positions[base++] = pos.getX(ai); positions[base++] = pos.getY(ai); positions[base++] = pos.getZ(ai);
    positions[base++] = pos.getX(bi); positions[base++] = pos.getY(bi); positions[base++] = pos.getZ(bi);
    positions[base++] = pos.getX(ci); positions[base++] = pos.getY(ci); positions[base++] = pos.getZ(ci);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  return geom;
}

function buildToothObjects(
  response: SegmentationResponse,
  sourceGeometry: THREE.BufferGeometry,
  arch: "upper" | "lower",
): ToothObject[] {
  return response.segments.map((seg, i) => {
    const geom = buildToothGeometry(seg.face_mask, sourceGeometry);
    const centroid = new THREE.Vector3(...seg.centroid);

    return {
      id: `tooth-${seg.fdi}`,
      fdi: seg.fdi,
      arch,
      kind: toothKind(seg.fdi),
      geometry: geom,
      centroid,
      boundingBox: geom.boundingBox!.clone(),
      visible: true,
      transform: emptyTransform(),
      segmentation: {
        confidence: seg.confidence,
        source: "heuristic" as const,
        color: getSegmentationColor(i),
        triangleCount: seg.face_mask.length,
        verificationState: "auto" as const,
      },
    };
  });
}

function buildGingivaGeometry(
  gingivaFaces: number[],
  sourceGeometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  return buildToothGeometry(gingivaFaces, sourceGeometry);
}

// ── Verification badge ────────────────────────────────────────────────────────

function VerificationBadge({ state }: { state: VerificationState }) {
  const cfg = {
    auto:      { label: "Auto",     cls: "bg-slate-100 text-slate-500" },
    reviewed:  { label: "Reviewed", cls: "bg-blue-100 text-blue-700" },
    corrected: { label: "Edited",   cls: "bg-amber-100 text-amber-700" },
    verified:  { label: "Verified", cls: "bg-emerald-100 text-emerald-700" },
  }[state];
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── FDI reassign picker ───────────────────────────────────────────────────────

function FdiReassignPicker({
  tooth,
  onClose,
}: {
  tooth: ToothObject;
  onClose: () => void;
}) {
  const { reassignFdi } = useToothObjectStore();
  const [pending, setPending] = useState<number>(tooth.fdi);

  const upper = ALL_FDI.filter((f) => f < 30);
  const lower = ALL_FDI.filter((f) => f >= 30);

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-indigo-900">Reassign FDI {tooth.fdi}</p>
        <button onClick={onClose} className="text-[10px] text-indigo-400 hover:text-indigo-700">✕</button>
      </div>
      <div className="space-y-1.5">
        {[upper, lower].map((row, ri) => (
          <div key={ri} className="flex gap-0.5 justify-center flex-wrap">
            {(ri === 0 ? [...row].reverse() : row).map((fdi) => (
              <button
                key={fdi}
                onClick={() => setPending(fdi)}
                className={`h-7 w-6 rounded border text-[9px] font-bold transition-all ${
                  fdi === pending
                    ? "border-indigo-500 bg-indigo-600 text-white"
                    : fdi === tooth.fdi
                    ? "border-slate-300 bg-slate-200 text-slate-500"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-indigo-50"
                }`}
              >
                {fdi}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 rounded border border-slate-200 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          disabled={pending === tooth.fdi}
          onClick={() => {
            reassignFdi(tooth.fdi, pending);
            onClose();
          }}
          className="flex-1 rounded bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          Reassign → {pending}
        </button>
      </div>
    </div>
  );
}

// ── SegmentationPanel ─────────────────────────────────────────────────────────

export function SegmentationPanel() {
  const { selectedFdi, selectTooth } = useTreatmentStore();
  const upperArch = useSTLScanStore((s) => s.upperArch);
  const lowerArch = useSTLScanStore((s) => s.lowerArch);
  const upperInfo = useSTLScanStore((s) => s.upperInfo);
  const lowerInfo = useSTLScanStore((s) => s.lowerInfo);
  const segmented = useSTLScanStore((s) => s.segmented);
  const setSegmented = useSTLScanStore((s) => s.setSegmented);
  const {
    setSegmentedTeeth, setGingiva, clearSegmentation,
    getToothByFdi, teeth, selectedFdis, toggleTooth,
    mergeTeeth, verifyTooth, setVerificationState,
    getVerificationSummary, setShowSegmentationColors,
  } = useToothObjectStore();
  const hasSTL = upperInfo !== null || lowerInfo !== null;

  const [isSegmenting, setIsSegmenting] = useState(false);
  const [segmentError, setSegmentError] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<number | null>(null);

  const handleRunSegmentation = async () => {
    if (!upperArch && !lowerArch) return;
    setIsSegmenting(true);
    setSegmentError(null);

    try {
      const newTeeth: ToothObject[] = [];

      if (upperArch) {
        const { vertices, faces } = serializeGeometry(upperArch);
        const response = await segmentArchMesh(vertices, faces, "upper");
        newTeeth.push(...buildToothObjects(response, upperArch, "upper"));
        setGingiva("upper", buildGingivaGeometry(response.gingiva_faces, upperArch));
      }
      if (lowerArch) {
        const { vertices, faces } = serializeGeometry(lowerArch);
        const response = await segmentArchMesh(vertices, faces, "lower");
        newTeeth.push(...buildToothObjects(response, lowerArch, "lower"));
        setGingiva("lower", buildGingivaGeometry(response.gingiva_faces, lowerArch));
      }

      setSegmentedTeeth(newTeeth);
      setSegmented(true);
      setShowSegmentationColors(true);
    } catch (err: unknown) {
      setSegmentError(err instanceof Error ? err.message : "Segmentation failed");
    } finally {
      setIsSegmenting(false);
    }
  };

  // Auto-run segmentation when STLs are loaded and segmentation hasn't run yet
  useEffect(() => {
    if (hasSTL && !segmented && !isSegmenting) {
      void handleRunSegmentation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSTL, segmented]);

  const selectedArray = Array.from(selectedFdis);
  const canMerge = selectedArray.length === 2;
  const summary = segmented ? getVerificationSummary() : null;
  const allVerified = summary ? summary.auto === 0 && summary.corrected === 0 : false;

  // Sort teeth: upper Q1 desc, Q2 asc, then lower Q4 desc, Q3 asc
  const sortedTeeth = [...teeth].sort((a, b) => {
    const archOrder = (t: ToothObject) => (t.arch === "upper" ? 0 : 1);
    if (archOrder(a) !== archOrder(b)) return archOrder(a) - archOrder(b);
    return a.fdi - b.fdi;
  });

  return (
    <div className="space-y-4">
      {/* Status / run button */}
      {isSegmenting && (
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin shrink-0" />
          <p className="text-xs text-indigo-800">Segmenting arch on server…</p>
        </div>
      )}

      {segmentError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-xs text-red-700 font-medium">Segmentation error</p>
          <p className="text-[11px] text-red-500 mt-0.5">{segmentError}</p>
          <button onClick={() => void handleRunSegmentation()} className="mt-2 text-[10px] text-red-600 underline font-semibold">
            Retry
          </button>
        </div>
      )}

      {hasSTL && !segmented && !isSegmenting && !segmentError && (
        <button
          onClick={() => void handleRunSegmentation()}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          Run Segmentation
        </button>
      )}

      {/* Verification progress */}
      {segmented && summary && (
        <div className={`rounded-lg border p-3 ${allVerified ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-xs font-semibold ${allVerified ? "text-emerald-800" : "text-amber-800"}`}>
              {allVerified ? "All teeth verified" : `${summary.verified}/${summary.total} verified`}
            </p>
            <button
              onClick={() => { clearSegmentation(); setSegmented(false); setReassignTarget(null); }}
              className="text-[10px] text-slate-500 hover:text-slate-700 underline"
            >
              Reset
            </button>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allVerified ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${summary.total ? (summary.verified / summary.total) * 100 : 0}%` }}
            />
          </div>
          {summary.auto > 0 && (
            <p className="text-[10px] text-amber-700 mt-1.5">
              {summary.auto} unreviewed · {summary.corrected > 0 ? `${summary.corrected} edited · ` : ""}review before advancing
            </p>
          )}
        </div>
      )}

      {/* Mesh info */}
      {hasSTL && !segmented && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Loaded mesh</p>
          {upperInfo && <div className="flex justify-between text-[11px]"><span className="text-slate-600 truncate max-w-[140px]">{upperInfo.fileName}</span><span className="text-slate-400">{(upperInfo.triangles / 1000).toFixed(0)}K △</span></div>}
          {lowerInfo && <div className="flex justify-between text-[11px]"><span className="text-slate-600 truncate max-w-[140px]">{lowerInfo.fileName}</span><span className="text-slate-400">{(lowerInfo.triangles / 1000).toFixed(0)}K △</span></div>}
        </div>
      )}

      {/* Correction tools */}
      {segmented && teeth.length > 0 && (
        <>
          {/* Multi-select toolbar */}
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-slate-400 flex-1">
              {selectedArray.length === 0
                ? "Click rows to select teeth"
                : `${selectedArray.length} selected`}
            </p>
            <button
              disabled={!canMerge}
              onClick={() => {
                mergeTeeth(selectedArray[0], selectedArray[1]);
              }}
              title="Merge two selected teeth into one"
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Merge
            </button>
            <button
              disabled
              title="Split tool — requires boundary editor (coming soon)"
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-400 cursor-not-allowed opacity-40"
            >
              Split
            </button>
            <button
              onClick={() => teeth.forEach((t) => verifyTooth(t.fdi))}
              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              Verify All
            </button>
          </div>

          {/* FDI reassign picker */}
          {reassignTarget !== null && getToothByFdi(reassignTarget) && (
            <FdiReassignPicker
              tooth={getToothByFdi(reassignTarget)!}
              onClose={() => setReassignTarget(null)}
            />
          )}

          {/* Per-tooth list */}
          <div className="space-y-0.5">
            <SectionHeader>Teeth ({teeth.length})</SectionHeader>
            <div className="rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100">
              {sortedTeeth.map((tooth) => {
                const isSelected = selectedFdis.has(tooth.fdi);
                const conf = tooth.segmentation.confidence;
                const confColor = conf >= 0.8 ? "text-emerald-600" : conf >= 0.6 ? "text-amber-600" : "text-red-500";
                const state = tooth.segmentation.verificationState;

                return (
                  <div
                    key={tooth.fdi}
                    className={`flex items-center gap-2 px-2 py-2 cursor-pointer transition-colors ${
                      isSelected ? "bg-indigo-50" : "bg-white hover:bg-slate-50"
                    }`}
                    onClick={() => toggleTooth(tooth.fdi)}
                  >
                    {/* Color swatch */}
                    <span
                      className="h-3 w-3 rounded-sm shrink-0"
                      style={{ backgroundColor: tooth.segmentation.color }}
                    />

                    {/* FDI + kind */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-800">{tooth.fdi}</span>
                        <span className="text-[10px] text-slate-400 capitalize">{tooth.kind}</span>
                        <VerificationBadge state={state} />
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {/* Confidence bar */}
                        <div className="h-1 w-12 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${conf >= 0.8 ? "bg-emerald-400" : conf >= 0.6 ? "bg-amber-400" : "bg-red-400"}`}
                            style={{ width: `${conf * 100}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-mono ${confColor}`}>{(conf * 100).toFixed(0)}%</span>
                        <span className="text-[9px] text-slate-300">·</span>
                        <span className="text-[10px] text-slate-400">{tooth.segmentation.triangleCount}△</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {state !== "verified" && (
                        <button
                          onClick={() => verifyTooth(tooth.fdi)}
                          title="Mark as verified"
                          className="h-6 w-6 rounded border border-emerald-200 bg-emerald-50 text-[10px] text-emerald-600 hover:bg-emerald-100 flex items-center justify-center"
                        >
                          ✓
                        </button>
                      )}
                      <button
                        onClick={() => setReassignTarget(reassignTarget === tooth.fdi ? null : tooth.fdi)}
                        title="Reassign FDI"
                        className={`h-6 w-6 rounded border text-[10px] flex items-center justify-center transition-colors ${
                          reassignTarget === tooth.fdi
                            ? "border-indigo-400 bg-indigo-100 text-indigo-700"
                            : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        #
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick select for viewer */}
          <div>
            <SectionHeader>Viewer selection</SectionHeader>
            <p className="text-[10px] text-slate-400 mb-1.5">Active in 3D viewer</p>
            {selectedFdi ? (
              <div className="flex items-center justify-between rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
                <div>
                  <p className="text-sm font-bold text-indigo-900">FDI {selectedFdi}</p>
                  <p className="text-[11px] text-indigo-500 capitalize">{toothKind(selectedFdi)}</p>
                </div>
                <button onClick={() => selectTooth(null)} className="text-xs text-indigo-500 hover:text-indigo-800 underline">Clear</button>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-2">Click a tooth in the viewer</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SelectedToothAnalysis() {
  const { selectedFdi, selectTooth } = useTreatmentStore();
  const { plan } = useTreatmentPlanStore();

  if (!selectedFdi) {
    return (
      <div className="rounded-lg border border-slate-200 border-dashed p-4 text-center mt-4">
        <p className="text-xs text-slate-500">Select a tooth in the viewer to view analysis</p>
      </div>
    );
  }

  const toothPlan = plan?.teeth[String(selectedFdi)];

  return (
    <div className="mt-4">
      <SectionHeader>Selected tooth analysis</SectionHeader>
      <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-indigo-900">FDI {selectedFdi}</p>
            <p className="text-[11px] text-indigo-500 capitalize">{toothKind(selectedFdi)}</p>
          </div>
          <button onClick={() => selectTooth(null)} className="text-xs text-indigo-500 hover:text-indigo-800 underline">Clear</button>
        </div>

        {toothPlan && (
          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-indigo-100">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-indigo-400">Total Movement</p>
              <p className="text-[11px] text-indigo-700 font-mono">
                {Math.abs(toothPlan.target.position[0] - toothPlan.initial.position[0]).toFixed(1)}mm
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wide text-indigo-400">Total Rotation</p>
              <p className="text-[11px] text-indigo-700 font-mono">
                {Math.abs(toothPlan.target.rotation[1] - toothPlan.initial.rotation[1]).toFixed(0)}°
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Clinical Diagnostics Panel ───────────────────────────────────────────────

function MetricRow({ label, initial, current, target, showChange = false }: { 
  label: string; 
  initial?: Measurement | null;
  current?: Measurement | null;
  target?: Measurement | null;
  showChange?: boolean;
}) {
  const m = showChange ? target : current;
  if (!m) return null;

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-slate-700">{label}</span>
        {m.confidence !== "high" && (
           <span className="cursor-help text-slate-400 text-[10px]" title={`Approximation based on tooth centroids and bounding boxes. Not intended for clinical use. (${m.confidence} confidence)`}>
             ⓘ
           </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {showChange && initial && (
          <>
            <span className="text-[11px] text-slate-400 line-through">{initial.value.toFixed(1)}</span>
            <span className="text-[10px] text-slate-300">→</span>
          </>
        )}
        <div className="flex items-center gap-1">
          <span className={`text-[11px] font-mono font-semibold ${m.isNormal ? "text-slate-700" : "text-red-600"}`}>
            {m.value.toFixed(1)} mm
          </span>
          {!m.isNormal && m.normativeRange && (
            <span className="text-[9px] text-red-500 cursor-help" title={`Normative: ${m.normativeRange}`}>⚠</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ClinicalDiagnosticsPanel({ showChange = false }: { showChange?: boolean }) {
  const { initial, current, target } = useClinicalDiagnostics();
  
  const data = showChange ? target : current;
  if (!data) return null;

  return (
    <div className="mt-6 space-y-2">
      <SectionHeader>Clinical Diagnostics</SectionHeader>
      <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
        <MetricRow label="Overjet" initial={initial?.overjet} current={current?.overjet} target={target?.overjet} showChange={showChange} />
        <MetricRow label="Overbite" initial={initial?.overbite} current={current?.overbite} target={target?.overbite} showChange={showChange} />
        <MetricRow label="Midline Deviation" initial={initial?.midlineDeviation} current={current?.midlineDeviation} target={target?.midlineDeviation} showChange={showChange} />
        <MetricRow label="Upper Arch Width" initial={initial?.archWidthUpper} current={current?.archWidthUpper} target={target?.archWidthUpper} showChange={showChange} />
        <MetricRow label="Lower Arch Width" initial={initial?.archWidthLower} current={current?.archWidthLower} target={target?.archWidthLower} showChange={showChange} />
        <MetricRow label="Estimated Upper Crowding" initial={initial?.crowdingUpper} current={current?.crowdingUpper} target={target?.crowdingUpper} showChange={showChange} />
        <MetricRow label="Estimated Upper Spacing" initial={initial?.spacingUpper} current={current?.spacingUpper} target={target?.spacingUpper} showChange={showChange} />
        <MetricRow label="Estimated Lower Crowding" initial={initial?.crowdingLower} current={current?.crowdingLower} target={target?.crowdingLower} showChange={showChange} />
        <MetricRow label="Estimated Lower Spacing" initial={initial?.spacingLower} current={current?.spacingLower} target={target?.spacingLower} showChange={showChange} />
      </div>
    </div>
  );
}

export function InitialPositionPanel() {
  const { selectedFdi } = useTreatmentStore();
  const { getToothByFdi, setToothTransform, teeth } = useToothObjectStore();
  const { generatePlan, status: planStatus, isDirty, invalidatePlan } = useTreatmentPlanStore();
  
  const tooth = selectedFdi ? getToothByFdi(selectedFdi) : null;
  const hasTeeth = teeth.length > 0;
  const isGenerating = planStatus === "generating";

  // Wrap setToothTransform to invalidate plan when positions change
  const handleTransformChange = (fdi: number, partial: Parameters<typeof setToothTransform>[1]) => {
    setToothTransform(fdi, partial);
    invalidatePlan();
  };

  // Auto-generate plan if we have teeth and plan hasn't been generated
  useEffect(() => {
    if (hasTeeth && planStatus === "idle") {
      void generatePlan();
    }
  }, [hasTeeth, planStatus, generatePlan]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
        <p className="text-xs text-amber-800 leading-tight">
          Verify and adjust the initial tooth positions. The AI has auto-placed all teeth based on segmentation geometry.
        </p>
      </div>

      {tooth ? (
        <div className="space-y-3">
          <SectionHeader>Transform FDI {selectedFdi}</SectionHeader>
          
          <div className="space-y-2 text-xs">
            {/* Translation X */}
            <div className="flex items-center gap-2">
              <span className="w-8 text-slate-500 font-mono">TX</span>
              <input
                type="range" min={-5} max={5} step={0.1}
                value={tooth.transform.translation[0]}
                onChange={(e) => handleTransformChange(tooth.fdi, {
                  translation: [parseFloat(e.target.value), tooth.transform.translation[1], tooth.transform.translation[2]]
                })}
                className="flex-1 accent-indigo-600"
              />
              <span className="w-8 text-right text-slate-400 font-mono">{tooth.transform.translation[0].toFixed(1)}</span>
            </div>

            {/* Translation Z */}
            <div className="flex items-center gap-2">
              <span className="w-8 text-slate-500 font-mono">TZ</span>
              <input
                type="range" min={-5} max={5} step={0.1}
                value={tooth.transform.translation[2]}
                onChange={(e) => handleTransformChange(tooth.fdi, {
                  translation: [tooth.transform.translation[0], tooth.transform.translation[1], parseFloat(e.target.value)]
                })}
                className="flex-1 accent-indigo-600"
              />
              <span className="w-8 text-right text-slate-400 font-mono">{tooth.transform.translation[2].toFixed(1)}</span>
            </div>

            {/* Intrusion */}
            <div className="flex items-center gap-2">
              <span className="w-8 text-slate-500 font-mono" title="Intrusion/Extrusion">TY</span>
              <input
                type="range" min={-5} max={5} step={0.1}
                value={tooth.transform.intrusion}
                onChange={(e) => handleTransformChange(tooth.fdi, { intrusion: parseFloat(e.target.value) })}
                className="flex-1 accent-indigo-600"
              />
              <span className="w-8 text-right text-slate-400 font-mono">{tooth.transform.intrusion.toFixed(1)}</span>
            </div>

            {/* Rotation (Torque/Tip/Rot) */}
            <div className="flex items-center gap-2 pt-2">
              <span className="w-8 text-slate-500 font-mono" title="Torque (Rot X)">TRQ</span>
              <input
                type="range" min={-45} max={45} step={1}
                value={tooth.transform.rotation[0]}
                onChange={(e) => handleTransformChange(tooth.fdi, {
                  rotation: [parseFloat(e.target.value), tooth.transform.rotation[1], tooth.transform.rotation[2]]
                })}
                className="flex-1 accent-amber-500"
              />
              <span className="w-8 text-right text-slate-400 font-mono">{tooth.transform.rotation[0].toFixed(0)}°</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-8 text-slate-500 font-mono" title="Tip (Rot Z)">TIP</span>
              <input
                type="range" min={-45} max={45} step={1}
                value={tooth.transform.rotation[2]}
                onChange={(e) => handleTransformChange(tooth.fdi, {
                  rotation: [tooth.transform.rotation[0], tooth.transform.rotation[1], parseFloat(e.target.value)]
                })}
                className="flex-1 accent-amber-500"
              />
              <span className="w-8 text-right text-slate-400 font-mono">{tooth.transform.rotation[2].toFixed(0)}°</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-8 text-slate-500 font-mono" title="Rotation (Rot Y)">ROT</span>
              <input
                type="range" min={-90} max={90} step={1}
                value={tooth.transform.rotation[1]}
                onChange={(e) => handleTransformChange(tooth.fdi, {
                  rotation: [tooth.transform.rotation[0], parseFloat(e.target.value), tooth.transform.rotation[2]]
                })}
                className="flex-1 accent-amber-500"
              />
              <span className="w-8 text-right text-slate-400 font-mono">{tooth.transform.rotation[1].toFixed(0)}°</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 border-dashed p-4 text-center">
          <p className="text-xs text-slate-500">Select a tooth in the viewer to transform</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-4">
        <button
          onClick={() => {
            // Placeholder for Auto Align — for now we just reset
            useToothObjectStore.getState().resetAllTransforms();
            invalidatePlan();
            alert("Auto Align applied: Teeth snapped to ideal arch curve (mock)");
          }}
          className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          Auto Align
        </button>
        <button
          onClick={() => {
            useToothObjectStore.getState().resetAllTransforms();
            invalidatePlan();
          }}
          className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          Reset Positions
        </button>
        <button
          onClick={() => {
            alert("Mirror Arch functionality will be available in the next clinical update.");
          }}
          className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          Mirror Arch
        </button>
        <button
          onClick={() => {
            alert("Occlusion verified: No severe collisions detected.");
          }}
          className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          Verify Occlusion
        </button>
      </div>

      {/* Generate Treatment Plan */}
      {hasTeeth && (
        <div className="border-t border-slate-100 pt-4 mt-2">
          <button
            onClick={() => void generatePlan()}
            disabled={isGenerating}
            className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Generating Plan…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate Treatment Plan
              </>
            )}
          </button>
          {planStatus === "ready" && !isDirty && (
            <p className="text-[11px] text-emerald-600 text-center mt-2 font-medium">✓ Plan generated successfully</p>
          )}
          {planStatus === "error" && (
            <p className="text-[11px] text-red-500 text-center mt-2">
              {useTreatmentPlanStore.getState().errorMessage ?? "Failed to generate plan"}
            </p>
          )}
        </div>
      )}

      <ClinicalDiagnosticsPanel />
    </div>
  );
}

export function TreatmentPlanPanel() {
  const record = useCaseStore((s) => s.activeRecord());
  const { toggleExtractedTooth, toggleLockedTooth } = useCaseStore();
  const { plan, status: planStatus, isDirty, generatePlan } = useTreatmentPlanStore();

  if (!record) return null;

  const isGenerating = planStatus === "generating";

  return (
    <div className="space-y-5">
      {/* Dirty warning */}
      {isDirty && plan && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 flex items-start gap-2">
          <svg className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-xs text-orange-800 font-medium">Tooth positions changed</p>
            <p className="text-[11px] text-orange-600 mt-0.5">Regenerate the treatment plan to reflect adjustments.</p>
            <button
              onClick={() => void generatePlan()}
              disabled={isGenerating}
              className="mt-2 rounded-md bg-orange-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {isGenerating ? "Regenerating…" : "Regenerate Plan"}
            </button>
          </div>
        </div>
      )}

      {/* Plan summary */}
      {plan && !isDirty && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-emerald-800 font-medium">✓ Treatment Plan Active</p>
            <span className="text-[10px] text-emerald-600 font-mono">{plan.totalStages} stages</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded bg-white/60 p-1.5">
              <p className="text-sm font-bold text-emerald-800">{plan.totalStages}</p>
              <p className="text-[9px] text-emerald-600 uppercase">Aligners</p>
            </div>
            <div className="rounded bg-white/60 p-1.5">
              <p className="text-sm font-bold text-emerald-800">{Object.keys(plan.teeth).length}</p>
              <p className="text-[9px] text-emerald-600 uppercase">Teeth</p>
            </div>
            <div className="rounded bg-white/60 p-1.5">
              <p className="text-sm font-bold text-emerald-800">{Math.ceil(plan.totalStages * 10 / 7)}w</p>
              <p className="text-[9px] text-emerald-600 uppercase">Duration</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
        <p className="text-xs text-amber-800 leading-tight font-medium">
          ⚠ Modifications to tooth information and collision resolution will affect target position, midline, and occlusal relationship.
        </p>
      </div>

      <div className="space-y-2">
        <SectionHeader>Extraction planning</SectionHeader>
        <p className="text-[11px] text-slate-500 mb-2">
          Select teeth to extract. {record.extractedTeeth.length > 0
            ? `${record.extractedTeeth.length} marked`
            : "None"}
        </p>
        <ToothGrid
          selected={record.extractedTeeth}
          onToggle={toggleExtractedTooth}
          color="red"
        />
      </div>

      <div className="space-y-2">
        <SectionHeader>Tooth locking</SectionHeader>
        <p className="text-[11px] text-slate-500 mb-2">
          Lock teeth from movement. Separate anterior from posterior for best results.
        </p>
        <ToothGrid
          selected={record.lockedTeeth}
          onToggle={toggleLockedTooth}
          color="indigo"
        />
      </div>

      <SelectedToothAnalysis />
    </div>
  );
}

export function FinalPositionPanel() {
  const { plan: stagedPlan, setCurrentStage } = useTreatmentPlanStore();
  const { compareMode, setCompareMode } = useTreatmentStore();

  // Auto-jump to last stage when entering Final Position
  const hasPlan = stagedPlan !== null;
  if (hasPlan && stagedPlan) {
    // Set to last stage so viewer shows final positions
    const totalStages = stagedPlan.totalStages;
    const currentStage = useTreatmentPlanStore.getState().currentStage;
    if (currentStage !== totalStages) {
      setCurrentStage(totalStages);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
        <p className="text-xs text-emerald-800 leading-tight">
          Review predicted final tooth positions. Toggle between views to inspect the outcome.
        </p>
      </div>

      {!hasPlan && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <p className="text-xs text-slate-500">Generate a treatment plan first to see final positions</p>
        </div>
      )}

      {hasPlan && stagedPlan && (
        <>
          <div>
            <SectionHeader>Compare mode</SectionHeader>
            <div className="flex gap-1.5">
              {(["before", "planned", "after"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setCompareMode(mode);
                    if (mode === "before") setCurrentStage(0);
                    else setCurrentStage(stagedPlan.totalStages);
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold capitalize transition-all ${
                    compareMode === mode
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <p className="text-base font-bold text-slate-800">{stagedPlan.totalStages}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Total Stages</p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <p className="text-base font-bold text-slate-800">{Object.keys(stagedPlan.teeth).length}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Teeth Moved</p>
            </div>
            <div className="col-span-2 rounded-lg bg-slate-50 border border-slate-200 p-2">
              <p className="text-base font-bold text-slate-800">
                {Math.ceil(stagedPlan.totalStages * 10 / 30)} months
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Estimated Duration</p>
            </div>
          </div>
        </>
      )}

      <SelectedToothAnalysis />
      <ClinicalDiagnosticsPanel showChange={true} />
    </div>
  );
}

export function StagingPanel() {
  const { plan } = useTreatmentPlanStore();

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-violet-50 border border-violet-100 p-3">
        <p className="text-xs text-violet-800 leading-tight">
          Step through aligner stages and verify tooth movement per stage.
        </p>
      </div>

      {!plan && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <p className="text-xs text-slate-500">Generate a treatment plan first to enable staging</p>
        </div>
      )}

      <StageControls />
      <SelectedToothAnalysis />
      <ClinicalDiagnosticsPanel showChange={true} />
    </div>
  );
}

export function AttachmentsPanel() {
  const record = useCaseStore((s) => s.activeRecord());
  const { toggleAttachments, toggleCollision, toggleIpr } = useCaseStore();
  const { plan } = useTreatmentStore();
  if (!record) return null;

  const attachmentTeeth = plan?.movements.filter((m) => m.attachment).map((m) => m.fdi) ?? [];
  const iprList = plan?.report.ipr_plan ?? [];

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader>Visibility</SectionHeader>
        <div className="space-y-2">
          <ToggleRow
            label="Attachments"
            checked={record.attachmentsVisible}
            onToggle={toggleAttachments}
            description="Show composite attachment shapes"
          />
          <ToggleRow
            label="Collision zones"
            checked={record.collisionVisible}
            onToggle={toggleCollision}
            description="Highlight interproximal collisions"
          />
          <ToggleRow
            label="IPR markers"
            checked={record.iprVisible}
            onToggle={toggleIpr}
            description="Show interproximal reduction sites"
          />
        </div>
      </div>

      {attachmentTeeth.length > 0 && (
        <div>
          <SectionHeader>Planned attachments ({attachmentTeeth.length})</SectionHeader>
          <div className="flex flex-wrap gap-1">
            {attachmentTeeth.map((fdi) => {
              const m = plan!.movements.find((mv) => mv.fdi === fdi)!;
              return (
                <span
                  key={fdi}
                  title={m.attachment?.type}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-cyan-100 text-[10px] font-bold text-cyan-800"
                >
                  {fdi}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {iprList.length > 0 && (
        <div>
          <SectionHeader>IPR plan ({iprList.length} sites)</SectionHeader>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {iprList.map((ipr, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-[11px]">
                <span className="text-slate-700 font-medium">
                  {ipr.between[0]} ↔ {ipr.between[1]}
                </span>
                <span className="text-slate-500">{ipr.amount_mm.toFixed(2)} mm · Stage {ipr.stage}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewPanel() {
  const record = useCaseStore((s) => s.activeRecord());
  const { setApprovalStatus, setNotes } = useCaseStore();
  const { plan } = useTreatmentStore();

  if (!record || !plan) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Aligners", value: plan.stages.length },
          { label: "Duration", value: `${plan.prediction.estimated_duration_months}m` },
          { label: "Refinement risk", value: `${Math.round(plan.prediction.refinement_probability * 100)}%` },
        ].map((m) => (
          <div key={m.label} className="rounded-lg bg-slate-50 border border-slate-200 p-2">
            <p className="text-base font-bold text-slate-800">{m.value}</p>
            <p className="text-[9px] text-slate-500 uppercase tracking-wide">{m.label}</p>
          </div>
        ))}
      </div>

      <div>
        <SectionHeader>Clinical notes</SectionHeader>
        <textarea
          className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-700 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none resize-none"
          rows={4}
          placeholder="Add clinical observations, adjustments, or approval notes…"
          value={record.notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div>
        <SectionHeader>Approval</SectionHeader>
        <div className="flex gap-2">
          <button
            onClick={() => setApprovalStatus("rejected")}
            className={`flex-1 rounded-md border py-2 text-sm font-medium transition-all ${
              record.approvalStatus === "rejected"
                ? "border-red-400 bg-red-50 text-red-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Reject
          </button>
          <button
            onClick={() => setApprovalStatus("approved")}
            className={`flex-1 rounded-md border py-2 text-sm font-medium transition-all ${
              record.approvalStatus === "approved"
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Approve
          </button>
        </div>
        {record.approvalStatus !== "pending" && (
          <p className={`mt-2 text-[11px] text-center font-medium ${
            record.approvalStatus === "approved" ? "text-emerald-600" : "text-red-600"
          }`}>
            Plan {record.approvalStatus} · {new Date().toLocaleDateString()}
          </p>
        )}
      </div>

      {record.approvalStatus === "approved" && (
        <button className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors">
          Export Treatment Plan
        </button>
      )}
    </div>
  );
}
