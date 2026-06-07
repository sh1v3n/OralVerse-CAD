"use client";
import { useScanStore } from "@/lib/store";

function overallHeadline(score: number | null | undefined): { label: string; color: string } {
  if (score == null) return { label: "Awaiting scan", color: "#6b7280" };
  if (score >= 0.8) return { label: "Mostly healthy", color: "#22c55e" };
  if (score >= 0.6) return { label: "Some issues", color: "#eab308" };
  if (score >= 0.4) return { label: "Needs attention", color: "#f97316" };
  return { label: "Urgent care advised", color: "#ef4444" };
}

function cavityHeadline(risk: number | null | undefined): string {
  if (risk == null) return "—";
  if (risk < 0.15) return "Low";
  if (risk < 0.35) return "Moderate";
  return "High";
}

export function HealthSummary() {
  const { scan } = useScanStore();
  const s = scan?.summary;
  const flaggedCount = scan?.teeth.filter((t) => t.severity !== "green").length ?? 0;
  const headline = overallHeadline(s?.overall_score);

  return (
    <div className="p-4 rounded-2xl bg-panel space-y-3">
      <h2 className="text-lg font-semibold">Your Oral Health</h2>

      <div className="space-y-1">
        <p className="text-xs text-gray-400">Overall</p>
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: headline.color }}>
            {headline.label}
          </span>
          <span className="text-sm text-gray-200">
            {s?.overall_score != null ? `${Math.round(s.overall_score * 100)} / 100` : "—"}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${(s?.overall_score ?? 0) * 100}%`,
              background: headline.color,
            }}
          />
        </div>
      </div>

      <Row label="Cavity risk" value={cavityHeadline(s?.cavity_risk)} />
      <Row label="Issues flagged" value={scan ? `${flaggedCount}` : "—"} />
      <Row label="Bite alignment" value="Not assessed by OPG" muted />
      <Row label="Gum health" value="Not assessed by OPG" muted />

      {s?.treatment_priority && s.treatment_priority.length > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Teeth that need attention first</p>
          <div className="flex flex-wrap gap-1.5">
            {s.treatment_priority.map((fdi) => (
              <span
                key={fdi}
                className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-100"
              >
                #{fdi}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={muted ? "text-gray-500 italic text-xs" : "text-gray-100"}>{value}</span>
    </div>
  );
}
