"use client";
import { useScanStore } from "@/lib/store";
import { SEVERITY_COLOR } from "@/lib/teeth";

const RECOMMENDED_ACTION: Record<string, string> = {
  healthy: "Routine 6-month checkup",
  caries: "Restoration / filling — schedule treatment",
  impacted: "Imaging review with oral surgeon",
  bdc_bdr: "Endodontic evaluation",
  infection: "Antibiotic + clinical assessment urgently",
  fractured: "Crown / restoration assessment",
};

export function ToothPanel() {
  const { scan, selectedFdi } = useScanStore();
  if (selectedFdi === null) {
    return (
      <div className="p-4 rounded-2xl bg-panel text-sm text-gray-400">
        Select a tooth in the viewer to inspect findings.
      </div>
    );
  }
  const tooth = scan?.teeth.find((t) => t.fdi === selectedFdi);
  if (!tooth) {
    return (
      <div className="p-4 rounded-2xl bg-panel text-sm text-gray-300">
        Tooth {selectedFdi} — no AI findings (likely healthy or not detected).
      </div>
    );
  }
  const topFinding = tooth.findings.sort((a, b) => b.confidence - a.confidence)[0];
  const sevColor = SEVERITY_COLOR[tooth.severity];
  return (
    <div className="p-4 rounded-2xl bg-panel space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tooth {tooth.fdi}</h2>
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: sevColor, color: "#0b0f17" }}
        >
          {tooth.severity}
        </span>
      </div>
      <Row label="Detected" value={topFinding?.label ?? "—"} />
      <Row
        label="Confidence"
        value={topFinding ? `${(topFinding.confidence * 100).toFixed(1)}%` : "—"}
      />
      <Row label="Source" value={topFinding?.source ?? "—"} />
      <Row
        label="Recommended action"
        value={topFinding ? RECOMMENDED_ACTION[topFinding.label] ?? "Clinician review" : "—"}
      />
      {tooth.findings.length > 1 && (
        <div className="pt-2 border-t border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Other findings</p>
          <ul className="text-xs space-y-0.5">
            {tooth.findings.slice(1).map((f, i) => (
              <li key={i}>
                {f.label} — {(f.confidence * 100).toFixed(0)}%
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-100">{value}</span>
    </div>
  );
}
