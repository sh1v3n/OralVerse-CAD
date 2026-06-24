"use client";

import { useEffect } from "react";
import { UserButton } from "@clerk/nextjs";
import { TreatmentViewer } from "@/components/treatment/TreatmentViewer";
import { useTreatmentStore } from "@/lib/store";
import { useCaseStore } from "@/lib/caseStore";
import type { WorkflowStage } from "@/lib/store";
import { CaseListSidebar } from "@/components/panels/CaseListSidebar";
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
    <div className="flex flex-1 items-center justify-center bg-[#070b11]">
      <div className="text-center max-w-sm px-6">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
          <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-slate-300 mb-1">No Patient Selected</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
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
    <main className="flex h-screen w-full flex-col bg-[#070b11] text-slate-200 font-sans overflow-hidden">

      {/* ── Top header ─────────────────────────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 bg-[#0a0f1a] px-4 z-20">

        {/* Logo + patient info */}
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-600 text-white text-[10px] font-black shrink-0 shadow-sm shadow-cyan-500/20">
            OV
          </div>
          {hasActiveCase ? (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate leading-tight">
                {patient?.name ?? "Unknown Patient"}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {theCase?.datasetLabel ? `Dataset: ${theCase.datasetLabel} · ` : ""}{record?.label ?? "No Plan"}
              </p>
            </div>
          ) : (
            <span className="text-sm font-medium text-slate-500">OralVerse CAD</span>
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
                  isActive  ? "text-cyan-400"
                  : isPast  ? "text-cyan-700 hover:text-cyan-500"
                            : "text-slate-600 hover:text-slate-400"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
                    isActive  ? "border-cyan-500 bg-cyan-500 text-slate-900"
                    : isPast  ? "border-cyan-700 bg-cyan-700 text-slate-900"
                              : "border-white/15 bg-white/5 text-slate-500"
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
                    isPast || isActive ? "bg-cyan-800" : "bg-white/10"
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
              className="rounded-md border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 transition"
            >
              ← Back
            </button>
          )}
          {hasActiveCase && !isLast && (
            <button
              onClick={advanceWorkflow}
              className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-cyan-400 transition"
            >
              Continue →
            </button>
          )}
          {hasActiveCase && isLast && (
            <>
              <button
                onClick={() => setApprovalStatus("rejected")}
                className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition"
              >
                Reject
              </button>
              <button
                onClick={() => setApprovalStatus("approved")}
                className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-emerald-400 transition"
              >
                Approve
              </button>
              <button className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-cyan-400 transition">
                Export Plan
              </button>
            </>
          )}

          <div className="ml-1 h-6 w-px bg-white/10" />
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-7 w-7",
                userButtonPopoverCard: "bg-[#0d1520] border border-white/8 shadow-xl",
                userButtonPopoverActionButton: "text-slate-300 hover:bg-white/5",
                userButtonPopoverActionButtonText: "text-slate-300",
                userButtonPopoverFooter: "border-t border-white/8",
              },
            }}
          />
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        <CaseListSidebar />

        {hasActiveCase ? (
          <>
            {/* Tool panel */}
            <aside className="flex w-72 shrink-0 flex-col border-r border-white/8 bg-[#0d1520] overflow-hidden">
              <div className="border-b border-white/5 px-4 py-2.5 bg-white/3">
                <p className="eyebrow">
                  {WORKFLOW_STAGES[currentIdx]?.label} tools
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <StagePanel stage={currentStageId} />
              </div>
              <div className="border-t border-white/8 p-3 bg-[#0d1520]">
                <button
                  onClick={advanceWorkflow}
                  disabled={isLast}
                  className="w-full rounded-md bg-cyan-500 py-2.5 text-sm font-semibold text-slate-900 hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {isLast ? "Plan complete" : `Continue to ${WORKFLOW_STAGES[currentIdx + 1]?.label}`}
                </button>
              </div>
            </aside>

            {/* 3D Viewer */}
            <div className="flex-1 overflow-hidden bg-[#070b11] p-3 pb-0">
              <div className="w-full h-full rounded-t-xl overflow-hidden border border-white/8 shadow-[0_4px_40px_rgb(0,0,0,0.5)]">
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
