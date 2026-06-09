"use client";

import { useEffect, useState } from "react";
import { ClinicalReport } from "@/components/treatment/ClinicalReport";
import { Copilot } from "@/components/treatment/Copilot";
import { PlanSidebar } from "@/components/treatment/PlanSidebar";
import { StageControls } from "@/components/treatment/StageControls";
import { TreatmentViewer } from "@/components/treatment/TreatmentViewer";
import { getDemoTreatmentPlan } from "@/lib/api";
import { useTreatmentStore } from "@/lib/store";

export default function Home() {
  const { plan, panel, setPlan, setPanel } = useTreatmentStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDemoTreatmentPlan().then(setPlan).catch((reason: Error) => setError(reason.message));
  }, [setPlan]);

  return (
    <main className="min-h-screen bg-[#070b11] px-4 py-4 text-slate-100 sm:px-6 lg:px-8">
      <header className="mx-auto mb-5 flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300 font-black text-[#071019]">O</div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">OralVerse Ortho</h1>
              <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300">AI copilot</span>
            </div>
            <p className="text-xs text-slate-500">
              {plan ? `Case ${plan.case_id} · ${plan.source.replaceAll("_", " ")}` : "Loading reconstructed model"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d1520] p-1">
          <button
            onClick={() => setPanel("plan")}
            className={`rounded-lg px-4 py-2 text-xs ${panel === "plan" ? "bg-white/10 text-white" : "text-slate-500"}`}
          >
            Treatment plan
          </button>
          <button
            onClick={() => setPanel("report")}
            className={`rounded-lg px-4 py-2 text-xs ${panel === "report" ? "bg-white/10 text-white" : "text-slate-500"}`}
          >
            Clinical report
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px]">
        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-5 text-sm text-red-200">
            Could not load the orthodontic planning service: {error}
          </div>
        ) : panel === "plan" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div className="h-[min(66vh,700px)] min-h-[520px]">
                <TreatmentViewer />
              </div>
              <StageControls />
            </div>
            <div className="space-y-4">
              <PlanSidebar />
              <Copilot />
            </div>
          </div>
        ) : (
          <ClinicalReport />
        )}
      </div>

      <footer className="mx-auto mt-5 max-w-[1600px] text-center text-[10px] uppercase tracking-[0.18em] text-slate-700">
        Clinical decision support · Orthodontist approval required before fabrication
      </footer>
    </main>
  );
}
