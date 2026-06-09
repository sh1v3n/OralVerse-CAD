"use client";

import { useTreatmentStore } from "@/lib/store";

export function ClinicalReport() {
  const { plan } = useTreatmentStore();
  if (!plan) return null;
  const report = plan.report;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="ortho-panel">
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <p className="eyebrow">Clinical report</p>
            <h2 className="mt-1 text-xl font-semibold">{report.title}</h2>
            <p className="mt-1 text-xs text-slate-500">Case {report.case_id} · {report.generated_on}</p>
          </div>
          <span className="status-pill">{report.status}</span>
        </div>
        <ReportSection title="Diagnosis summary">
          {report.diagnosis_summary.map((item) => <li key={item}>{item}</li>)}
        </ReportSection>
        <ReportSection title="Treatment prescription">
          <li>{report.movement_summary.teeth_moved} teeth programmed for movement</li>
          <li>{report.movement_summary.active_aligners} active aligners plus {report.movement_summary.passive_aligners} passive aligners</li>
          <li>Maximum translation {report.movement_summary.maximum_translation_mm.toFixed(2)} mm</li>
          <li>Maximum rotation {report.movement_summary.maximum_rotation_deg.toFixed(1)}°</li>
          <li>Estimated duration {report.duration.weeks} weeks ({report.duration.months} months)</li>
        </ReportSection>
        <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-[11px] leading-relaxed text-amber-100/70">
          {report.clinical_notice}
        </div>
      </section>

      <div className="space-y-4">
        <section className="ortho-panel">
          <p className="eyebrow mb-3">Attachment plan · {report.attachment_plan.length}</p>
          <div className="max-h-52 space-y-2 overflow-y-auto">
            {report.attachment_plan.map((item) => (
              <div key={item.fdi} className="flex gap-3 rounded-xl bg-white/[0.025] p-3">
                <span className="font-mono text-xs text-cyan-300">{item.fdi}</span>
                <div>
                  <p className="text-xs capitalize">{item.type} · {item.surface}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{item.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="ortho-panel">
          <p className="eyebrow mb-3">IPR plan · {plan.prediction.total_ipr_mm.toFixed(2)} mm total</p>
          <div className="space-y-2">
            {report.ipr_plan.map((item) => (
              <div key={item.between.join("-")} className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{item.between.join(" / ")} · stage {item.stage}</span>
                <span>{item.amount_mm.toFixed(2)} mm</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-300">{children}</ul>
    </div>
  );
}
