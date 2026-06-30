"use client";

/**
 * StageControls — aligner stage navigation and playback.
 *
 * Reads from useTreatmentPlanStore (the staged plan).
 * Provides: slider, prev/next buttons, play/pause, speed selector.
 * Auto-advance runs via setInterval, gated by playbackSpeed.
 */

import { useEffect, useRef } from "react";
import { useTreatmentPlanStore } from "@/lib/treatmentPlanStore";

export function StageControls() {
  const {
    plan,
    currentStage,
    isPlaying,
    playbackSpeed,
    setCurrentStage,
    nextStage,
    prevStage,
    togglePlay,
    setPlaybackSpeed,
    pause,
  } = useTreatmentPlanStore();

  // Auto-advance timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isPlaying || !plan) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    const intervalMs = Math.round(800 / playbackSpeed);
    timerRef.current = setInterval(() => {
      const state = useTreatmentPlanStore.getState();
      if (state.currentStage >= (state.plan?.totalStages ?? 0)) {
        state.pause();
        return;
      }
      state.nextStage();
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, plan, pause]);

  // ── No plan state ───────────────────────────────────────────────────────

  if (!plan) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-cream-200 px-4 py-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cream-300">
          <svg className="h-5 w-5 text-ink-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-xs font-medium text-ink-40">No treatment plan generated</p>
        <p className="text-[11px] text-ink-40 mt-1">Generate a plan from the Treatment Plan step</p>
      </div>
    );
  }

  // ── Active plan UI ──────────────────────────────────────────────────────

  const progress = plan.totalStages > 0
    ? Math.round((currentStage / plan.totalStages) * 100)
    : 0;

  const teethMoving = currentStage > 0 && currentStage <= plan.totalStages
    ? Object.keys(plan.teeth).length
    : 0;

  const SPEEDS = [0.5, 1, 2];

  return (
    <div className="space-y-4">
      {/* ── Transport controls ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Prev */}
        <button
          onClick={prevStage}
          disabled={currentStage <= 0}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-raised text-ink-70 transition hover:bg-cream-200 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous stage"
        >
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition ${
            isPlaying
              ? "bg-red-500 hover:bg-red-600"
              : "bg-clay hover:bg-clay-dark"
          }`}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Next */}
        <button
          onClick={nextStage}
          disabled={currentStage >= plan.totalStages}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-raised text-ink-70 transition hover:bg-cream-200 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next stage"
        >
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        {/* Stage label */}
        <div className="min-w-0 flex-1 ml-1">
          <p className="text-sm font-semibold text-ink truncate">
            {currentStage === 0
              ? "Initial Position"
              : currentStage >= plan.totalStages
                ? `Final Position (Stage ${plan.totalStages})`
                : `Stage ${currentStage} / ${plan.totalStages}`}
          </p>
          <p className="text-[11px] text-ink-40 truncate">
            {currentStage === 0
              ? "Baseline dentition"
              : `${teethMoving} teeth · ${progress}% complete`}
          </p>
        </div>
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-cream-300">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-clay transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Stage slider ──────────────────────────────────────────────────── */}
      <input
        aria-label="Treatment stage"
        type="range"
        min={0}
        max={plan.totalStages}
        value={currentStage}
        onChange={(e) => setCurrentStage(Number(e.target.value))}
        className="stage-range w-full"
      />

      {/* ── Speed selector ────────────────────────────────────────────────── */}
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-40">
          Playback speed
        </p>
        <div className="flex gap-1">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              onClick={() => setPlaybackSpeed(speed)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                playbackSpeed === speed
                  ? "bg-clay text-white shadow-sm"
                  : "bg-cream-300 text-ink-70 hover:bg-cream-300"
              }`}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      {/* ── Stage metrics ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-cream-200 border border-line p-2">
          <p className="text-base font-bold text-ink">{plan.totalStages}</p>
          <p className="text-[9px] text-ink-40 uppercase tracking-wide">Aligners</p>
        </div>
        <div className="rounded-lg bg-cream-200 border border-line p-2">
          <p className="text-base font-bold text-ink">{Object.keys(plan.teeth).length}</p>
          <p className="text-[9px] text-ink-40 uppercase tracking-wide">Teeth</p>
        </div>
        <div className="rounded-lg bg-cream-200 border border-line p-2">
          <p className="text-base font-bold text-ink">
            {Math.ceil(plan.totalStages * 10 / 7)}
          </p>
          <p className="text-[9px] text-ink-40 uppercase tracking-wide">Est. weeks</p>
        </div>
      </div>
    </div>
  );
}
