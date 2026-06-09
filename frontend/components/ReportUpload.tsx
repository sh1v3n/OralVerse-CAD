"use client";
import { useRef, useState } from "react";
import { uploadReport } from "@/lib/api";
import { useScanStore } from "@/lib/store";

export function ReportUpload() {
  const { scan, setScan } = useScanStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>("");

  if (!scan) return null;
  const scanId = scan.id;

  async function handleFile(f: File) {
    try {
      setStatus("Parsing report…");
      const r = await uploadReport(scanId, f);
      setStatus(`Added ${r.findings_added} report-derived findings`);
      const refreshed = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/scan/${scanId}`,
      ).then((r) => r.json());
      setScan(refreshed);
    } catch (e) {
      setStatus(`error: ${(e as Error).message}`);
    }
  }

  return (
    <div className="p-4 rounded-2xl bg-panel space-y-2">
      <h2 className="text-sm font-semibold">Attach a report</h2>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full text-sm rounded-lg border border-gray-700 hover:border-gray-500 py-1.5"
      >
        Upload PDF / X-ray
      </button>
      {status && <p className="text-xs text-gray-400">{status}</p>}
    </div>
  );
}
