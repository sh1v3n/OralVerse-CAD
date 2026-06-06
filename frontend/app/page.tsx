"use client";
import { DentalViewer } from "@/components/viewer/DentalViewer";
import { UploadDropzone } from "@/components/UploadDropzone";
import { ToothPanel } from "@/components/panels/ToothPanel";
import { HealthSummary } from "@/components/dashboard/HealthSummary";
import { Timeline } from "@/components/dashboard/Timeline";
import { ReportUpload } from "@/components/ReportUpload";

export default function Home() {
  return (
    <main className="min-h-screen p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">OralVerse</h1>
          <p className="text-sm text-gray-400">AI-powered dental digital twin</p>
        </div>
        <a
          href="https://github.com/AnirudhVineet/OralVerse"
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          GitHub →
        </a>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4">
          <UploadDropzone />
          <div className="h-[640px]">
            <DentalViewer />
          </div>
        </div>
        <aside className="space-y-4">
          <HealthSummary />
          <ToothPanel />
          <ReportUpload />
          <Timeline />
          <Legend />
        </aside>
      </div>
    </main>
  );
}

function Legend() {
  const items: { label: string; color: string }[] = [
    { label: "Healthy", color: "#22c55e" },
    { label: "Monitor", color: "#eab308" },
    { label: "Moderate", color: "#f97316" },
    { label: "Urgent", color: "#ef4444" },
  ];
  return (
    <div className="p-4 rounded-2xl bg-panel">
      <p className="text-xs text-gray-400 mb-2">Severity legend</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: it.color }}
            />
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}
