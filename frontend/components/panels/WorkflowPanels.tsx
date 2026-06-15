"use client";

import { useCaseStore } from "@/lib/caseStore";
import { useTreatmentStore } from "@/lib/store";
import { useSTLScanStore } from "@/lib/scanStore";
import { useToothObjectStore } from "@/lib/toothObjectStore";
import { segmentArch } from "@/lib/meshSegmenter";
import { ImportPanel } from "./ImportPanel";
import { ScanBrowser } from "./ScanBrowser";
import { ALL_FDI, toothKind } from "@/lib/teeth";
import { StageControls } from "@/components/treatment/StageControls";

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

export function SegmentationPanel() {
  const { selectedFdi, selectTooth } = useTreatmentStore();
  const upperArch = useSTLScanStore((s) => s.upperArch);
  const lowerArch = useSTLScanStore((s) => s.lowerArch);
  const upperInfo = useSTLScanStore((s) => s.upperInfo);
  const lowerInfo = useSTLScanStore((s) => s.lowerInfo);
  const segmented = useSTLScanStore((s) => s.segmented);
  const setSegmented = useSTLScanStore((s) => s.setSegmented);
  const { setSegmentedTeeth, setGingiva, clearSegmentation, getToothByFdi, teeth } = useToothObjectStore();
  const hasSTL = upperInfo !== null || lowerInfo !== null;

  const handleRunSegmentation = () => {
    if (!upperArch && !lowerArch) return;
    
    const newTeeth = [];
    if (upperArch) {
      const { teeth: upperTeeth, gingivaGeometry: upperGingiva } = segmentArch(upperArch, "upper");
      newTeeth.push(...upperTeeth);
      setGingiva("upper", upperGingiva);
    }
    if (lowerArch) {
      const { teeth: lowerTeeth, gingivaGeometry: lowerGingiva } = segmentArch(lowerArch, "lower");
      newTeeth.push(...lowerTeeth);
      setGingiva("lower", lowerGingiva);
    }
    
    setSegmentedTeeth(newTeeth);
    setSegmented(true);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
        <p className="text-xs text-blue-800 leading-tight">
          Review AI-generated tooth segmentation boundaries and FDI numbering. Click any tooth to inspect.
        </p>
      </div>

      {hasSTL && !segmented && (
        <button
          onClick={handleRunSegmentation}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          Run Segmentation
        </button>
      )}

      {segmented && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between">
          <p className="text-xs text-emerald-800 font-medium">Segmentation Complete ({teeth.length} teeth)</p>
          <button
            onClick={() => {
              clearSegmentation();
              setSegmented(false);
            }}
            className="text-[10px] text-emerald-600 hover:text-emerald-800 underline font-semibold uppercase tracking-wider"
          >
            Reset
          </button>
        </div>
      )}

      {/* STL mesh info when scans are loaded */}
      {hasSTL && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Loaded mesh</p>
          {upperInfo && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600 truncate max-w-[140px]">{upperInfo.fileName}</span>
              <span className="text-slate-400">{(upperInfo.triangles / 1000).toFixed(0)}K △</span>
            </div>
          )}
          {lowerInfo && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600 truncate max-w-[140px]">{lowerInfo.fileName}</span>
              <span className="text-slate-400">{(lowerInfo.triangles / 1000).toFixed(0)}K △</span>
            </div>
          )}
        </div>
      )}

      <div>
        <SectionHeader>Selected tooth</SectionHeader>
        {selectedFdi ? (
          <div className="flex items-center justify-between rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
            <div>
              <p className="text-sm font-bold text-indigo-900">FDI {selectedFdi}</p>
              <p className="text-[11px] text-indigo-500 capitalize">{toothKind(selectedFdi)}</p>
              {segmented && getToothByFdi(selectedFdi) && (
                <div className="mt-1 flex items-center gap-2 text-[10px]">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getToothByFdi(selectedFdi)!.segmentation.color }}
                  />
                  <span className="text-indigo-600/70 font-mono">
                    {getToothByFdi(selectedFdi)!.segmentation.triangleCount} tris
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => selectTooth(null)}
              className="text-xs text-indigo-500 hover:text-indigo-800 underline"
            >
              Clear
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic text-center py-2">
            Click a tooth in the viewer to inspect
          </p>
        )}
      </div>
    </div>
  );
}

export function InitialPositionPanel() {
  const { selectedFdi } = useTreatmentStore();
  const { getToothByFdi, setToothTransform } = useToothObjectStore();
  
  const tooth = selectedFdi ? getToothByFdi(selectedFdi) : null;

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
                onChange={(e) => setToothTransform(tooth.fdi, {
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
                onChange={(e) => setToothTransform(tooth.fdi, {
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
                onChange={(e) => setToothTransform(tooth.fdi, { intrusion: parseFloat(e.target.value) })}
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
                onChange={(e) => setToothTransform(tooth.fdi, {
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
                onChange={(e) => setToothTransform(tooth.fdi, {
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
                onChange={(e) => setToothTransform(tooth.fdi, {
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
        {["Auto Align", "Reset Positions", "Mirror Arch", "Verify Occlusion"].map((action) => (
          <button
            key={action}
            className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TreatmentPlanPanel() {
  const record = useCaseStore((s) => s.activeRecord());
  const { toggleExtractedTooth, toggleLockedTooth } = useCaseStore();

  if (!record) return null;

  return (
    <div className="space-y-5">
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
    </div>
  );
}

export function FinalPositionPanel() {
  const { plan, compareMode, setCompareMode } = useTreatmentStore();
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
        <p className="text-xs text-emerald-800 leading-tight">
          Review predicted final tooth positions. Toggle between views to inspect the outcome.
        </p>
      </div>
      <div>
        <SectionHeader>Compare mode</SectionHeader>
        <div className="flex gap-1.5">
          {(["before", "planned", "after"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setCompareMode(mode)}
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
      {plan && (
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
            <p className="text-base font-bold text-slate-800">{plan.model.bite.overjet_mm.toFixed(1)} mm</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Overjet</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
            <p className="text-base font-bold text-slate-800">{plan.model.bite.overbite_percent.toFixed(0)}%</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Overbite</p>
          </div>
          <div className="col-span-2 rounded-lg bg-slate-50 border border-slate-200 p-2">
            <p className="text-base font-bold text-slate-800">
              {plan.model.bite.midline_deviation_mm.toFixed(1)} mm
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Midline deviation</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function StagingPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-violet-50 border border-violet-100 p-3">
        <p className="text-xs text-violet-800 leading-tight">
          Step through aligner stages and verify tooth movement per stage.
        </p>
      </div>
      <StageControls />
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
