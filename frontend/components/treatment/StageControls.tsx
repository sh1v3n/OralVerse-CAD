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

  if (!plan) return null;
  const currentStage = plan.stages[stage - 1];

  return (
    <div className="rounded-[24px] border border-white/10 bg-[#0d1520] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            if (stage >= plan.stages.length) setStage(0);
            setPlaying(!playing);
          }}
          className="grid h-10 w-10 place-items-center rounded-full bg-cyan-300 text-[#071019] transition hover:bg-cyan-200"
          aria-label={playing ? "Pause simulation" : "Play simulation"}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
        <div className="min-w-[130px]">
          <p className="text-sm font-medium">
            {stage === 0 ? "Initial position" : `Aligner ${stage}`}
          </p>
          <p className="text-xs text-slate-500">
            {currentStage
              ? `${currentStage.movements.length} active teeth · ${currentStage.wear_days} days`
              : "Baseline scan"}
          </p>
        </div>
        <input
          aria-label="Treatment stage"
          type="range"
          min={0}
          max={plan.stages.length}
          value={stage}
          onChange={(event) => setStage(Number(event.target.value))}
          className="stage-range min-w-[180px] flex-1"
        />
        <div className="flex rounded-xl border border-white/10 bg-black/20 p-1 text-xs">
          {(["before", "planned", "after"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setCompareMode(mode)}
              className={`rounded-lg px-3 py-2 capitalize transition ${
                compareMode === mode ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
