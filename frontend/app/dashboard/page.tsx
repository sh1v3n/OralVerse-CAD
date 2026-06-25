"use client";

import { useEffect } from "react";
import { UserButton } from "@clerk/nextjs";
import { TreatmentViewer } from "@/components/treatment/TreatmentViewer";
import { useTreatmentStore } from "@/lib/store";
import { useCaseStore } from "@/lib/caseStore";
import type { WorkflowStage } from "@/lib/store";
import { CaseListSidebar } from "@/components/panels/CaseListSidebar";
import { PaperTexture } from "@/components/ui/PaperTexture";
import {
  PreprocessingPanel,
  SegmentationPanel,
  InitialPositionPanel,
  TreatmentPlanPanel,
  FinalPositionPanel,
  StagingPanel,
  AttachmentsPanel,
  ReviewPanel,
} from "@/components/panels/WorkflowPanels";

// ─── Workflow config ───────────────────────────────────────────────────────────

const WORKFLOW_STAGES: { id: WorkflowStage; label: string; short: string }[] = [
  { id: "preprocessing",    label: "Preprocessing",    short: "Pre"   },
  { id: "segmentation",     label: "Segmentation",     short: "Seg"   },
  { id: "initial_position", label: "Initial Position", short: "Init"  },
  { id: "treatment_plan",   label: "Treatment Plan",   short: "Treat" },
  { id: "final_position",   label: "Final Position",   short: "Final" },
  { id: "staging",          label: "Staging",          short: "Stage" },
  { id: "attachments",      label: "Attachments",      short: "Att"   },
  { id: "review",           label: "Review & Export",  short: "Review"},
];

function stageIndex(id: WorkflowStage) {
  return WORKFLOW_STAGES.findIndex((s) => s.id === id);
}

// ─── Per-stage panel router ────────────────────────────────────────────────────

function StagePanel({ stage }: { stage: WorkflowStage }) {
  switch (stage) {
    case "preprocessing":    return <PreprocessingPanel />;
    case "segmentation":     return <SegmentationPanel />;
    case "initial_position": return <InitialPositionPanel />;
    case "treatment_plan":   return <TreatmentPlanPanel />;
    case "final_position":   return <FinalPositionPanel />;
    case "staging":          return <StagingPanel />;
    case "attachments":      return <AttachmentsPanel />;
    case "review":           return <ReviewPanel />;
  }
}

// ─── Empty-state — no case selected ──────────────────────────────────────────

function NoPatientSelected() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface border border-line">
          <svg className="h-8 w-8 text-ink-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-ink mb-1">No Patient Selected</h2>
        <p className="text-xs text-ink-40 leading-relaxed">
          Select or create a patient from the sidebar, then link a dataset to begin the orthodontic workflow.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const {
    patients,
    cases,
    activeCaseId,
    activeCase,
    activeRecord,
    setWorkflowStage,
    advanceWorkflow,
    rejectWorkflow,
    setApprovalStatus,
  } = useCaseStore();

  const record   = activeRecord();
  const theCase  = activeCase();
  const patient  = patients.find((p) => p.id === theCase?.patientId);

  const { setWorkflowStage: setTreatmentWorkflow } = useTreatmentStore();
  useEffect(() => {
    if (record?.workflowStage) setTreatmentWorkflow(record.workflowStage);
  }, [record?.workflowStage, setTreatmentWorkflow]);

  const hasActiveCase   = activeCaseId !== null && theCase !== undefined;
  const currentStageId: WorkflowStage = record?.workflowStage ?? "preprocessing";
  const currentIdx = stageIndex(currentStageId);
  const isFirst = currentIdx === 0;
  const isLast  = currentIdx === WORKFLOW_STAGES.length - 1;

  return (
    <main
      className="relative flex h-screen w-full flex-col text-ink font-sans overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 18%, #F6F2EB 0%, #EFE9DF 46%, #E6DECF 100%)",
      }}
    >
      <PaperTexture grainZIndex={1} marksZIndex={1} />

      {/* ── Top header ─────────────────────────────────────────────────────── */}
      <header className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-line bg-cream-100/80 backdrop-blur px-4">

        {/* Logo + patient info */}
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-cream-100 text-[10px] font-black shrink-0 shadow-sm">
            OV
          </div>
          {hasActiveCase ? (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate leading-tight">
                {patient?.name ?? "Unknown Patient"}
              </p>
              <p className="text-[10px] text-ink-40 truncate">
                {theCase?.datasetLabel ? `Dataset: ${theCase.datasetLabel} · ` : ""}{record?.label ?? "No Plan"}
              </p>
            </div>
          ) : (
            <span className="text-sm font-medium text-ink-40">OralVerse CAD</span>
          )}
        </div>

        {/* Workflow stepper */}
        <div className="flex flex-1 items-center justify-center gap-0 px-4 overflow-x-auto">
          {hasActiveCase && WORKFLOW_STAGES.map((stage, index) => {
            const isActive = stage.id === currentStageId;
            const isPast   = currentIdx > index;
            return (
              <button
                key={stage.id}
                onClick={() => setWorkflowStage(stage.id)}
                className={`flex items-center text-xs font-medium transition-all whitespace-nowrap ${
                  isActive  ? "text-clay"
                  : isPast  ? "text-clay/70 hover:text-clay"
                            : "text-ink-40 hover:text-ink-70"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
                    isActive  ? "border-clay bg-clay text-cream-100"
                    : isPast  ? "border-clay/70 bg-clay/70 text-cream-100"
                              : "border-line bg-surface text-ink-40"
                  }`}
                >
                  {isPast && !isActive ? (
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-[8px] font-bold">{index + 1}</span>
                  )}
                </span>
                <span className={`ml-1 mr-1 hidden xl:block text-[11px] ${isActive ? "font-semibold" : ""}`}>
                  {stage.label}
                </span>
                <span className={`ml-1 mr-1 xl:hidden text-[11px] ${isActive ? "font-semibold" : ""}`}>
                  {stage.short}
                </span>
                {index < WORKFLOW_STAGES.length - 1 && (
                  <span className={`mx-1 h-px w-3 shrink-0 transition-colors ${
                    isPast || isActive ? "bg-clay/50" : "bg-line"
                  }`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Actions + user */}
        <div className="flex items-center gap-2 min-w-[260px] justify-end">
          {hasActiveCase && !isFirst && (
            <button
              onClick={rejectWorkflow}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-70 hover:bg-cream-200 transition"
            >
              ← Back
            </button>
          )}
          {hasActiveCase && !isLast && (
            <button
              onClick={advanceWorkflow}
              className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-cream-100 hover:bg-ink/90 transition"
            >
              Continue →
            </button>
          )}
          {hasActiveCase && isLast && (
            <>
              <button
                onClick={() => setApprovalStatus("rejected")}
                className="rounded-md border border-red-300 bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 transition"
              >
                Reject
              </button>
              <button
                onClick={() => setApprovalStatus("approved")}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
              >
                Approve
              </button>
              <button className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-cream-100 hover:bg-ink/90 transition">
                Export Plan
              </button>
            </>
          )}

          <div className="ml-1 h-6 w-px bg-line" />
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-7 w-7",
                userButtonPopoverCard: "bg-surface border border-line shadow-xl",
                userButtonPopoverActionButton: "text-ink-70 hover:bg-cream-200",
                userButtonPopoverActionButtonText: "text-ink-70",
                userButtonPopoverFooter: "border-t border-line",
              },
            }}
          />
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">

        <CaseListSidebar />

        {hasActiveCase ? (
          <>
            {/* Tool panel */}
            <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface overflow-hidden">
              <div className="border-b border-line px-4 py-2.5 bg-cream-200">
                <p className="eyebrow">
                  {WORKFLOW_STAGES[currentIdx]?.label} tools
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <StagePanel stage={currentStageId} />
              </div>
              <div className="border-t border-line p-3 bg-surface">
                <button
                  onClick={advanceWorkflow}
                  disabled={isLast}
                  className="w-full rounded-md bg-ink py-2.5 text-sm font-semibold text-cream-100 hover:bg-ink/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {isLast ? "Plan complete" : `Continue to ${WORKFLOW_STAGES[currentIdx + 1]?.label}`}
                </button>
              </div>
            </aside>

            {/* 3D Viewer */}
            <div className="flex-1 overflow-hidden p-3 pb-0">
              <div className="w-full h-full rounded-t-xl overflow-hidden border border-line shadow-[0_8px_40px_rgb(28,26,22,0.10)]">
                <TreatmentViewer />
              </div>
            </div>
          </>
        ) : (
          <NoPatientSelected />
        )}
      </div>
    </main>
  );
}
