"use client";
import { useScanStore } from "@/lib/store";
import { SEVERITY_COLOR } from "@/lib/teeth";

const PLAIN_LABEL: Record<string, string> = {
  healthy: "Looks healthy",
  caries: "Cavity",
  impacted: "Impacted tooth",
  bdc_bdr: "Severely damaged crown",
  infection: "Possible infection",
  fractured: "Cracked or broken tooth",
};

const EXPLANATION: Record<string, string> = {
  healthy:
    "The AI didn't spot any obvious issues with this tooth. Routine check-ups are still recommended.",
  caries:
    "Tooth decay — a weak spot or hole in the tooth. If left untreated it can grow deeper and reach the nerve.",
  impacted:
    "This tooth is stuck partly or fully under the gum, often a wisdom tooth. It may push other teeth or get infected.",
  bdc_bdr:
    "The tooth structure is heavily damaged. The visible part of the tooth has likely broken down significantly.",
  infection:
    "The AI sees signs that may indicate an infection around the tooth root or surrounding bone.",
  fractured:
    "There appears to be a crack or break in the tooth.",
};

const RECOMMENDED_ACTION: Record<string, string> = {
  healthy: "Routine 6-month check-up",
  caries: "See a dentist for a filling",
  impacted: "Consult an oral surgeon",
  bdc_bdr: "Likely needs a crown or root canal",
  infection: "Visit a dentist within a week",
  fractured: "Get it evaluated soon",
};

const SEVERITY_HEADLINE: Record<string, string> = {
  green: "Looks good",
  yellow: "Worth monitoring",
  orange: "Needs attention soon",
  red: "Needs urgent attention",
};

function confidencePhrase(p: number): string {
  if (p >= 0.85) return "AI is highly confident";
  if (p >= 0.65) return "AI is fairly confident";
  if (p >= 0.45) return "AI is somewhat confident";
  return "AI is uncertain";
}

export function ToothPanel() {
  const { scan, selectedFdi } = useScanStore();

  if (selectedFdi === null) {
    return (
      <div className="p-4 rounded-2xl bg-panel text-sm text-gray-400">
        Click any tooth in the 3D model to see what the AI found.
      </div>
    );
  }

  const tooth = scan?.teeth.find((t) => t.fdi === selectedFdi);

  if (!tooth) {
    return (
      <div className="p-4 rounded-2xl bg-panel space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Tooth #{selectedFdi}</p>
            <h2 className="text-lg font-semibold leading-tight">Looks healthy</h2>
          </div>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: SEVERITY_COLOR.green, color: "#0b0f17" }}
          >
            Looks good
          </span>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">
          The AI didn&apos;t flag any issues with this tooth. Routine check-ups
          are still recommended.
        </p>
      </div>
    );
  }

  const topFinding = [...tooth.findings].sort(
    (a, b) => b.confidence - a.confidence,
  )[0];
  const label = topFinding?.label ?? "healthy";
  const sevColor = SEVERITY_COLOR[tooth.severity];

  return (
    <div className="p-4 rounded-2xl bg-panel space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">Tooth #{tooth.fdi}</p>
          <h2 className="text-lg font-semibold leading-tight">
            {PLAIN_LABEL[label] ?? label}
          </h2>
        </div>
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: sevColor, color: "#0b0f17" }}
        >
          {SEVERITY_HEADLINE[tooth.severity]}
        </span>
      </div>

      <p className="text-sm text-gray-300 leading-relaxed">
        {EXPLANATION[label] ?? "The AI flagged this tooth for review."}
      </p>

      <div className="pt-2 border-t border-gray-800 space-y-1">
        <p className="text-xs text-gray-400">What to do</p>
        <p className="text-sm text-gray-100">
          {RECOMMENDED_ACTION[label] ?? "Have a dentist review this tooth."}
        </p>
      </div>

      {topFinding && (
        <p className="text-[11px] text-gray-500 pt-1">
          {confidencePhrase(topFinding.confidence)} (
          {(topFinding.confidence * 100).toFixed(0)}%)
        </p>
      )}

      {tooth.findings.length > 1 && (
        <div className="pt-2 border-t border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Other things the AI saw</p>
          <ul className="text-xs space-y-0.5">
            {tooth.findings.slice(1).map((f, i) => (
              <li key={i}>
                {PLAIN_LABEL[f.label] ?? f.label} —{" "}
                {(f.confidence * 100).toFixed(0)}%
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
