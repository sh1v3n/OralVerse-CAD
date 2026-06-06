"use client";
import { useEffect, useState } from "react";
import { compareScans, listScans, type CompareDto, type ScanListItem } from "@/lib/api";
import { useScanStore } from "@/lib/store";

export function Timeline() {
  const { scan } = useScanStore();
  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [compare, setCompare] = useState<CompareDto | null>(null);

  useEffect(() => {
    listScans().then(setScans).catch(() => setScans([]));
  }, [scan]);

  useEffect(() => {
    if (scans.length < 2) {
      setCompare(null);
      return;
    }
    compareScans(scans[1].id, scans[0].id).then(setCompare).catch(() => setCompare(null));
  }, [scans]);

  if (scans.length === 0) {
    return null;
  }

  return (
    <div className="p-4 rounded-2xl bg-panel space-y-3">
      <h2 className="text-lg font-semibold">Timeline</h2>
      <div className="space-y-1">
        {scans.slice(0, 6).map((s) => (
          <div key={s.id} className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{new Date(s.created_at).toLocaleString()}</span>
            <span className="text-gray-200">
              {s.overall_score != null ? `${Math.round(s.overall_score * 100)}` : "—"}
            </span>
          </div>
        ))}
      </div>
      {compare && (
        <div className="pt-2 border-t border-gray-800 text-xs space-y-1">
          <p className="text-gray-400">
            vs. previous scan: score Δ{" "}
            <span className={compare.delta_score >= 0 ? "text-severity-green" : "text-severity-red"}>
              {compare.delta_score >= 0 ? "+" : ""}
              {(compare.delta_score * 100).toFixed(0)}
            </span>
          </p>
          {compare.tooth_changes.slice(0, 5).map((c) => (
            <p key={c.fdi} className="text-gray-300">
              {c.fdi}: {c.from} → {c.to} ({c.direction})
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
