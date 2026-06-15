"use client";

/**
 * STL Viewer Overlay Controls (Clinical CAD Edition)
 *
 * - Camera view presets (top toolbar row, matching LingOral style)
 * - Upper / Lower arch toggles
 * - Clip plane toggle + position slider
 * - Opacity slider
 * - Mesh info card
 *
 * Removed: Material presets (Enamel/Gingiva/Bone/X-Ray) — all removed per design spec.
 * Removed: Quality mode selector (Low/Auto/High) — kept in store but not surfaced.
 */

import { useSTLScanStore } from "@/lib/scanStore";
import { useToothObjectStore } from "@/lib/toothObjectStore";
import { useTreatmentStore } from "@/lib/store";
import type { CameraView } from "@/lib/store";

// ─── Camera view toolbar ──────────────────────────────────────────────────────

const CAMERA_VIEWS: { id: CameraView; label: string; icon: string }[] = [
  { id: "maxillary",  label: "Maxillary",  icon: "⊙" },
  { id: "labial",     label: "Labial",     icon: "◉" },
  { id: "right",      label: "Right",      icon: "◁" },
  { id: "overjet",    label: "Overjet",    icon: "⊕" },
  { id: "left",       label: "Left",       icon: "▷" },
  { id: "lingual",    label: "Lingual",    icon: "◎" },
  { id: "mandibular", label: "Mandibular", icon: "⊙" },
];

function CameraViewBar() {
  const { cameraView, setCameraView } = useTreatmentStore();

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
      <div className="flex items-center gap-0.5 bg-white/92 backdrop-blur-sm rounded-xl border border-stone-200/80 shadow-sm px-2 py-1.5">
        {CAMERA_VIEWS.map((view, i) => (
          <button
            key={view.id}
            onClick={() => setCameraView(view.id)}
            title={view.label}
            className={`flex flex-col items-center px-2.5 py-1 rounded-lg transition-all ${
              cameraView === view.id
                ? "bg-stone-100 text-stone-800"
                : "text-stone-400 hover:text-stone-700 hover:bg-stone-50"
            } ${i < CAMERA_VIEWS.length - 1 ? "mr-0.5" : ""}`}
          >
            <span className="text-[11px] leading-none mb-0.5">{view.icon}</span>
            <span className="text-[9px] font-medium leading-none whitespace-nowrap">{view.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main controls overlay ─────────────────────────────────────────────────────

export function STLViewerControls() {
  const {
    upperArch,
    lowerArch,
    upperInfo,
    lowerInfo,
    showUpper,
    showLower,
    meshOpacity,
    wireframe,
    clipPlaneEnabled,
    clipPlanePosition,
    setShowUpper,
    setShowLower,
    setMeshOpacity,
    setWireframe,
    setClipPlaneEnabled,
    setClipPlanePosition,
    segmented,
  } = useSTLScanStore();

  const { showSegmentationColors, setShowSegmentationColors } = useToothObjectStore();

  const hasMesh = upperArch || lowerArch;
  if (!hasMesh) return null;

  return (
    <>
      {/* Top camera view bar */}
      <CameraViewBar />

      {/* Bottom controls row */}
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between pointer-events-none">

        {/* Left: Mesh info */}
        <div className="pointer-events-auto">
          <div className="rounded-xl bg-white/90 backdrop-blur-sm border border-stone-200 shadow-sm px-3 py-2.5 space-y-1 min-w-[180px]">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">
              Scan loaded
            </p>
            {upperInfo && showUpper && (
              <div className="text-[11px] text-stone-600">
                <span className="font-semibold text-stone-700">U:</span>{" "}
                {upperInfo.fileName}
                <span className="text-stone-400 ml-1 font-mono">
                  {(upperInfo.triangles / 1000).toFixed(0)}k △
                </span>
              </div>
            )}
            {lowerInfo && showLower && (
              <div className="text-[11px] text-stone-600">
                <span className="font-semibold text-stone-700">L:</span>{" "}
                {lowerInfo.fileName}
                <span className="text-stone-400 ml-1 font-mono">
                  {(lowerInfo.triangles / 1000).toFixed(0)}k △
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: View controls */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {/* Arch + display toggles */}
          <div className="flex gap-1 rounded-xl bg-white/90 backdrop-blur-sm border border-stone-200 shadow-sm p-1.5">
            <button
              onClick={() => setShowUpper(!showUpper)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                showUpper ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-400"
              }`}
            >
              Upper
            </button>
            <button
              onClick={() => setShowLower(!showLower)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                showLower ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-400"
              }`}
            >
              Lower
            </button>
            <span className="w-px bg-stone-200 self-stretch" />
            <button
              onClick={() => setWireframe(!wireframe)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                wireframe ? "bg-violet-600 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              Wire
            </button>
            <button
              onClick={() => setClipPlaneEnabled(!clipPlaneEnabled)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                clipPlaneEnabled ? "bg-amber-500 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              Clip
            </button>
            {segmented && (
              <button
                onClick={() => setShowSegmentationColors(!showSegmentationColors)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  showSegmentationColors ? "bg-emerald-500 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
              >
                Colors
              </button>
            )}
          </div>

          {/* Sliders */}
          <div className="rounded-xl bg-white/90 backdrop-blur-sm border border-stone-200 shadow-sm px-4 py-3 space-y-2.5 min-w-[210px]">
            {/* Opacity */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 w-12">
                Opacity
              </span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={meshOpacity}
                onChange={(e) => setMeshOpacity(Number(e.target.value))}
                className="flex-1 h-1 accent-stone-600"
              />
              <span className="text-[10px] text-stone-400 w-8 text-right font-mono">
                {Math.round(meshOpacity * 100)}%
              </span>
            </div>

            {/* Clip Y */}
            {clipPlaneEnabled && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 w-12">
                  Clip Y
                </span>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={clipPlanePosition}
                  onChange={(e) => setClipPlanePosition(Number(e.target.value))}
                  className="flex-1 h-1 accent-amber-500"
                />
                <span className="text-[10px] text-stone-400 w-8 text-right font-mono">
                  {clipPlanePosition.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
