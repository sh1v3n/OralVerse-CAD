"use client";
import { useScanStore } from "@/lib/store";

export function HealthSummary() {
  const { scan } = useScanStore();
  const s = scan?.summary;

  return (
    <div className="p-4 rounded-2xl bg-panel space-y-3">
      <h2 className="text-lg font-semibold">Oral Health Summary</h2>
      <Stat
        label="Overall score"
        value={s?.overall_score != null ? `${(s.overall_score * 100).toFixed(0)} / 100` : "—"}
      />
      <Stat
        label="Cavity risk"
        value={s?.cavity_risk != null ? `${(s.cavity_risk * 100).toFixed(0)}%` : "—"}
      />
      <Stat label="Missing teeth" value={s?.missing_teeth_count?.toString() ?? "—"} />
      <Stat label="Alignment" value="not assessed (OPG)" />
      <Stat label="Gum health" value="not assessed (OPG)" />

      {s?.treatment_priority && s.treatment_priority.length > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Treatment priority (FDI)</p>
          <div className="flex flex-wrap gap-1.5">
            {s.treatment_priority.map((fdi) => (
              <span key={fdi} className="text-xs px-2 py-0.5 rounded bg-gray-800">
                {fdi}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-100">{value}</span>
    </div>
  );
}
