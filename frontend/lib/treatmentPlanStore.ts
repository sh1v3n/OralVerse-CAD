/**
 * Treatment Plan Store
 *
 * Manages the staged treatment plan lifecycle:
 *   - Plan generation (calls backend)
 *   - Stage navigation (slider / prev / next)
 *   - Playback (play / pause / speed)
 *   - Dirty tracking (invalidates plan when tooth positions change)
 *
 * Each tooth's transform at a given stage is accessed via getStageTransform().
 * The viewer uses this to animate teeth smoothly across aligner stages.
 */

import { create } from "zustand";
import type {
  StagedTreatmentPlan,
  StagedToothTransform,
  StagedToothInput,
} from "./api";
import { generateStagedPlan } from "./api";
import { useToothObjectStore } from "./toothObjectStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanStatus = "idle" | "generating" | "ready" | "error";

interface TreatmentPlanState {
  // Plan data
  plan: StagedTreatmentPlan | null;
  status: PlanStatus;
  errorMessage: string | null;

  // Stage navigation
  currentStage: number; // 0 = initial position, 1..N = aligner stages
  isPlaying: boolean;
  playbackSpeed: number; // 0.5, 1, 2

  // Dirty state — true when tooth transforms changed after plan generation
  isDirty: boolean;

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Generate a staged plan from current tooth objects. */
  generatePlan: () => Promise<void>;

  /** Clear the current plan. */
  clearPlan: () => void;

  /** Jump to a specific stage. */
  setCurrentStage: (stage: number) => void;

  /** Step forward one stage. */
  nextStage: () => void;

  /** Step backward one stage. */
  prevStage: () => void;

  /** Start auto-advance playback. */
  play: () => void;

  /** Pause auto-advance playback. */
  pause: () => void;

  /** Toggle play/pause. */
  togglePlay: () => void;

  /** Set playback speed multiplier. */
  setPlaybackSpeed: (speed: number) => void;

  /** Mark the plan as dirty (positions changed). */
  invalidatePlan: () => void;

  /** Get the transform for a tooth at the current stage. */
  getStageTransform: (
    fdi: number,
  ) => StagedToothTransform | null;

  /** Get the transform for a tooth at a specific stage. */
  getStageTransformAt: (
    fdi: number,
    stage: number,
  ) => StagedToothTransform | null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTreatmentPlanStore = create<TreatmentPlanState>((set, get) => ({
  plan: null,
  status: "idle",
  errorMessage: null,
  currentStage: 0,
  isPlaying: false,
  playbackSpeed: 1,
  isDirty: false,

  // ── Generate Plan ─────────────────────────────────────────────────────────

  generatePlan: async () => {
    const teeth = useToothObjectStore.getState().teeth;
    if (teeth.length === 0) {
      set({ status: "error", errorMessage: "No segmented teeth available" });
      return;
    }

    set({ status: "generating", errorMessage: null, isPlaying: false });

    try {
      // Build input from current tooth objects
      const input: StagedToothInput[] = teeth.map((tooth) => {
        // Initial = the centroid position of the tooth + any manual adjustments
        const initialPos: [number, number, number] = [
          tooth.centroid.x + tooth.transform.translation[0],
          tooth.centroid.y + tooth.transform.translation[1] + tooth.transform.intrusion,
          tooth.centroid.z + tooth.transform.translation[2],
        ];
        const initialRot: [number, number, number] = [
          tooth.transform.rotation[0],
          tooth.transform.rotation[1],
          tooth.transform.rotation[2],
        ];

        // Target = ideal aligned position (for now, just apply a small correction)
        // In a real system, the clinician sets the target in the UI.
        // For now we use the initial position as-is — the clinician's manual
        // adjustments in InitialPosition ARE the target corrections.
        // We simulate a treatment by computing a target that "normalizes" the arch.
        const targetPos: [number, number, number] = [
          tooth.centroid.x,
          tooth.centroid.y,
          tooth.centroid.z,
        ];
        const targetRot: [number, number, number] = [0, 0, 0];

        return {
          id: String(tooth.fdi),
          initial: { position: initialPos, rotation: initialRot },
          target: { position: targetPos, rotation: targetRot },
        };
      });

      const plan = await generateStagedPlan(input);

      set({
        plan,
        status: "ready",
        currentStage: 0,
        isDirty: false,
        errorMessage: null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Plan generation failed";
      set({ status: "error", errorMessage: msg });
    }
  },

  clearPlan: () =>
    set({
      plan: null,
      status: "idle",
      errorMessage: null,
      currentStage: 0,
      isPlaying: false,
      isDirty: false,
    }),

  // ── Stage Navigation ──────────────────────────────────────────────────────

  setCurrentStage: (stage) => {
    const { plan } = get();
    if (!plan) return;
    const clamped = Math.max(0, Math.min(stage, plan.totalStages));
    set({ currentStage: clamped });
  },

  nextStage: () => {
    const { plan, currentStage } = get();
    if (!plan) return;
    if (currentStage < plan.totalStages) {
      set({ currentStage: currentStage + 1 });
    }
  },

  prevStage: () => {
    const { currentStage } = get();
    if (currentStage > 0) {
      set({ currentStage: currentStage - 1 });
    }
  },

  // ── Playback ──────────────────────────────────────────────────────────────

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),

  togglePlay: () => {
    const { isPlaying, plan, currentStage } = get();
    if (!plan) return;
    // If at the end, restart from 0
    if (!isPlaying && currentStage >= plan.totalStages) {
      set({ currentStage: 0, isPlaying: true });
    } else {
      set({ isPlaying: !isPlaying });
    }
  },

  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  // ── Dirty State ───────────────────────────────────────────────────────────

  invalidatePlan: () => {
    const { plan } = get();
    if (plan) {
      set({ isDirty: true });
    }
  },

  // ── Selectors ─────────────────────────────────────────────────────────────

  getStageTransform: (fdi) => {
    const { plan, currentStage } = get();
    return _lookupTransform(plan, fdi, currentStage);
  },

  getStageTransformAt: (fdi, stage) => {
    const { plan } = get();
    return _lookupTransform(plan, fdi, stage);
  },
}));

// ─── Internal lookup (avoids allocation in render loop) ───────────────────────

function _lookupTransform(
  plan: StagedTreatmentPlan | null,
  fdi: number,
  stage: number,
): StagedToothTransform | null {
  if (!plan) return null;
  const toothPlan = plan.teeth[String(fdi)];
  if (!toothPlan) return null;

  // Stage 0 = initial position
  if (stage <= 0) return toothPlan.initial;

  // Stage >= totalStages = final/target position
  if (stage >= plan.totalStages) return toothPlan.target;

  // Exact stage lookup (stages are 1-indexed in the array)
  const stageData = toothPlan.stages[stage - 1];
  if (stageData) return stageData.transform;

  // Fallback
  return toothPlan.initial;
}
