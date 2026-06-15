"use client";

import { useEffect } from "react";
import { useTreatmentStore } from "@/lib/store";

export function StageControls() {
  const { plan, stage, playing, compareMode, setStage, setPlaying, setCompareMode } =
    useTreatmentStore();

  useEffect(() => {
    if (!playing || !plan) return;
    const timer = window.setInterval(() => {
      const current = useTreatmentStore.getState().stage;
      if (current >= plan.stages.length) {
        setPlaying(false);
        return;
      }
      setStage(current + 1);
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, plan, setPlaying, setStage]);

  if (!plan) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">
        Loading treatment plan…
      </div>
    );
  }

  const currentStage = plan.stages[stage - 1];
  const totalActive = plan.stages.filter((s) => s.kind === "active").length;
  const progress = Math.round((stage / plan.stages.length) * 100);

  return (
    <div className="space-y-4">
      {/* Play / Stage label */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (stage >= plan.stages.length) setStage(0);
            setPlaying(!playing);
          }}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition ${
            playing ? "bg-red-500 hover:bg-red-600" : "bg-indigo-600 hover:bg-indigo-700"
          }`}
          aria-label={playing ? "Pause simulation" : "Play simulation"}
        >
          {playing ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {stage === 0 ? "Initial position" : `Aligner ${stage} / ${plan.stages.length}`}
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {currentStage
              ? `${currentStage.movements.length} teeth · ${currentStage.wear_days} days wear`
              : "Baseline dentition scan"}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>0</span>
          <span>{totalActive} active · {plan.stages.length} total</span>
        </div>
      </div>

      {/* Slider */}
      <input
        aria-label="Treatment stage"
        type="range"
        min={0}
        max={plan.stages.length}
        value={stage}
        onChange={(e) => setStage(Number(e.target.value))}
        className="stage-range w-full"
      />

      {/* Compare mode */}
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Compare
        </p>
        <div className="flex gap-1">
          {(["before", "planned", "after"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setCompareMode(mode)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition-all ${
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

      {/* Stage notes */}
      {currentStage?.notes && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5 text-[11px] text-amber-800">
          {currentStage.notes}
        </div>
      )}
    </div>
  );
}
