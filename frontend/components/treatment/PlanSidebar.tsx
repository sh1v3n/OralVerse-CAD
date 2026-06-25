"use client";

import { useTreatmentStore } from "@/lib/store";

const ISSUE_LABELS: Record<string, string> = {
  crowding: "Crowding",
  spacing: "Spacing",
  rotation: "Rotations",
  arch_asymmetry: "Arch asymmetry",
  overjet: "Overjet",
  overbite: "Overbite",
};

export function PlanSidebar() {
  const { plan, stage, selectedFdi, selectTooth } = useTreatmentStore();
  if (!plan) return <aside className="panel-skeleton min-h-[520px]" />;

  const selected = plan.movements.find((movement) => movement.fdi === selectedFdi);
  const currentStage = plan.stages[stage - 1];

  return (
    <aside className="space-y-4">
      <section className="ortho-panel">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="eyebrow">AI diagnosis</p>
            <h2 className="mt-1 text-lg font-semibold">Treatment overview</h2>
          </div>
          <span className="status-pill">Draft</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Metric value={plan.stages.length} label="Aligners" />
          <Metric value={`${plan.prediction.estimated_duration_months}m`} label="Duration" />
          <Metric
            value={`${Math.round(plan.prediction.refinement_probability * 100)}%`}
            label="Refinement"
          />
        </div>
      </section>

      <section className="ortho-panel">
        <p className="eyebrow mb-3">Detected conditions</p>
        <div className="space-y-2">
          {plan.analysis.issues.map((issue, index) => (
            <button
              key={`${issue.type}-${index}`}
              onClick={() => {
                if (issue.teeth[0]) selectTooth(issue.teeth[0]);
              }}
              className="flex w-full items-center justify-between rounded-xl border border-line bg-cream-200 px-3 py-2.5 text-left hover:bg-cream-300"
            >
              <span>
                <span className="block text-sm">{ISSUE_LABELS[issue.type] ?? issue.type}</span>
                <span className="text-[11px] capitalize text-ink-40">{issue.arch} arch</span>
              </span>
              <span className={`severity-${issue.severity} text-xs font-medium`}>
                {issue.value} {issue.unit}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="ortho-panel">
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">{selected ? `Tooth ${selected.fdi}` : `Aligner ${stage || 1}`}</p>
          {selected && (
            <button onClick={() => selectTooth(null)} className="text-xs text-ink-40 hover:text-ink">
              Clear
            </button>
          )}
        </div>
        {selected ? (
          <ToothDetails movement={selected} />
        ) : (
          <StageList movements={currentStage?.movements ?? plan.stages[0].movements} />
        )}
      </section>
    </aside>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl bg-cream-200 p-3 text-center">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-ink-40">{label}</p>
    </div>
  );
}

function StageList({
  movements,
}: {
  movements: Array<{
    fdi: number;
    direction: string;
    translation_mm: number;
    rotation_deg: number;
  }>;
}) {
  return (
    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
      {movements.slice(0, 10).map((movement) => (
        <div key={movement.fdi} className="flex items-center gap-3 rounded-xl bg-cream-200 p-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-clay-soft text-xs font-semibold text-clay-dark">
            {movement.fdi}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs capitalize text-ink">{movement.direction}</p>
            <p className="text-[11px] text-ink-40">
              {movement.translation_mm.toFixed(2)} mm · {movement.rotation_deg > 0 ? "+" : ""}
              {movement.rotation_deg.toFixed(2)}°
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ToothDetails({
  movement,
}: {
  movement: NonNullable<ReturnType<typeof useTreatmentStore.getState>["plan"]>["movements"][number];
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm capitalize text-ink">{movement.tooth_name}</p>
      <Detail label="Total translation" value={`${movement.total.translation_mm.toFixed(2)} mm`} />
      <Detail label="Total rotation" value={`${movement.total.rotation_deg.toFixed(1)}°`} />
      <Detail
        label="Vertical"
        value={
          movement.total.intrusion_mm
            ? `${movement.total.intrusion_mm.toFixed(2)} mm intrusion`
            : `${movement.total.extrusion_mm.toFixed(2)} mm extrusion`
        }
      />
      <Detail label="Tracking risk" value={movement.risk.level} capitalize />
      {movement.attachment && (
        <div className="rounded-xl border border-clay/20 bg-clay-soft p-3">
          <p className="text-[10px] uppercase tracking-wider text-clay-dark">Attachment</p>
          <p className="mt-1 text-xs capitalize">{movement.attachment.type}</p>
          <p className="mt-1 text-[11px] text-ink-40">{movement.attachment.reason}</p>
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="flex justify-between border-b border-line pb-2 text-xs">
      <span className="text-ink-40">{label}</span>
      <span className={capitalize ? "capitalize" : ""}>{value}</span>
    </div>
  );
}
