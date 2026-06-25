"use client";

import { useState, useEffect } from "react";
import { useCaseStore } from "@/lib/caseStore";
import { useSTLScanStore } from "@/lib/scanStore";
import type { PatientMeta, OrthoCase, TreatmentRecord } from "@/lib/caseStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_PILL: Record<string, string> = {
  draft:        "bg-cream-300 text-ink-40",
  segmentation: "bg-blue-100 text-blue-700",
  planning:     "bg-amber-100 text-amber-700",
  review:       "bg-violet-100 text-violet-700",
  approved:     "bg-emerald-100 text-emerald-700",
  exported:     "bg-cream-300 text-ink-40",
};

// ─── Modals ───────────────────────────────────────────────────────────────────

function NewPatientModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: Omit<PatientMeta, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "other">("other");
  const [referrer, setReferrer] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name, dob, sex, referrer });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-line shadow-2xl shadow-ink/20 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">New Patient</h2>
          <button onClick={onClose} className="text-ink-40 hover:text-ink transition">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-70 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder-ink-40 focus:border-clay focus:outline-none focus:ring-1 focus:ring-clay"
              placeholder="e.g. Jane Doe"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-70 mb-1">Date of Birth</label>
              <input
                type="date"
                required
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink-70 focus:border-clay focus:outline-none focus:ring-1 focus:ring-clay"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-70 mb-1">Sex</label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value as "male" | "female" | "other")}
                className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink-70 focus:border-clay focus:outline-none focus:ring-1 focus:ring-clay"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-70 mb-1">Referring Doctor (Optional)</label>
            <input
              type="text"
              value={referrer}
              onChange={(e) => setReferrer(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder-ink-40 focus:border-clay focus:outline-none focus:ring-1 focus:ring-clay"
              placeholder="Dr. Smith"
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream-100 hover:bg-ink/90 transition"
            >
              Create Patient
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DatasetLibraryModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (datasetCaseId: string, datasetLabel: string) => void;
}) {
  const { cases: datasetCases, fetchCases, loadingStatus } = useSTLScanStore();

  useEffect(() => {
    if (datasetCases.length === 0) fetchCases();
  }, [datasetCases.length, fetchCases]);

  const isLoading = loadingStatus === "fetching_manifest";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface border border-line shadow-2xl shadow-ink/20 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-ink">Dataset Library</h2>
            <p className="text-xs text-ink-40 mt-0.5">Select STL scans to link to this patient</p>
          </div>
          <button onClick={onClose} className="text-ink-40 hover:text-ink transition">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-ink-40 gap-2">
              <span className="h-2 w-2 rounded-full bg-clay animate-pulse" />
              Loading datasets...
            </div>
          )}

          {datasetCases.map((dc) => {
            const totalMB = (dc.scans.reduce((s, f) => s + f.size_bytes, 0) / 1024 / 1024).toFixed(0);
            return (
              <button
                key={dc.id}
                onClick={() => onSelect(dc.id, dc.label)}
                className="w-full rounded-xl border border-line bg-cream-200 p-3.5 text-left hover:border-clay hover:bg-clay-soft transition-all group flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-ink group-hover:text-clay-dark transition-colors">
                    {dc.label}
                  </p>
                  <p className="text-[11px] text-ink-40 mt-1">{dc.scan_count} scans available</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-ink-40">{totalMB} MB</span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-ink-40 group-hover:bg-clay/15 group-hover:text-clay-dark transition-colors">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </button>
            );
          })}

          {datasetCases.length === 0 && !isLoading && (
            <p className="text-sm text-ink-40 italic text-center py-8">
              No datasets found. Check your datasets directory.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Patient Card ─────────────────────────────────────────────────────────────

function PatientCard({
  patient,
  patientCases,
  activeCaseId,
  activeRecordId,
  onSelectCase,
  onSelectRecord,
  onAddPlan,
  onSelectDataset,
}: {
  patient: PatientMeta;
  patientCases: OrthoCase[];
  activeCaseId: string | null;
  activeRecordId: string | null;
  onSelectCase: (caseId: string) => void;
  onSelectRecord: (caseId: string, recordId: string) => void;
  onAddPlan: (caseId: string) => void;
  onSelectDataset: (patientId: string) => void;
}) {
  const isActive = patientCases.some((c) => c.id === activeCaseId);
  const [expanded, setExpanded] = useState(isActive);

  // For this simplified UI, we assume 1 case per patient for now, but handle multiple
  const orthoCase = patientCases[0];

  return (
    <div className={`rounded-xl border transition-all ${
      isActive
        ? "border-clay bg-clay-soft shadow-sm shadow-clay/10"
        : "border-line bg-cream-200 hover:border-clay/50"
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start justify-between p-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{patient.name}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-ink-40 mt-1 uppercase tracking-wider">
            <span>{patient.sex.charAt(0)}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-ink-40" />
            <span>DOB: {new Date(patient.dob).toLocaleDateString()}</span>
          </div>
        </div>
        <svg
          className={`mt-1 h-4 w-4 text-ink-40 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-line px-3 pb-3 pt-2 space-y-2">
          {!orthoCase ? (
            <div className="rounded-lg bg-surface border border-line border-dashed p-3 text-center">
              <p className="text-xs text-ink-40 mb-2">No scans linked</p>
              <button
                onClick={() => onSelectDataset(patient.id)}
                className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-70 hover:border-clay hover:text-clay-dark transition"
              >
                Select Scans from Library
              </button>
            </div>
          ) : (
            <>
              {/* Dataset Info */}
              <div className="flex items-center justify-between rounded-md bg-surface px-2.5 py-1.5 text-[10px] text-ink-40">
                <span className="font-semibold text-ink-70 truncate pr-2">
                  Dataset: <span className="font-normal">{orthoCase.datasetLabel}</span>
                </span>
                <span className="shrink-0">{formatDate(orthoCase.createdAt)}</span>
              </div>

              {/* Plans List */}
              <div className="space-y-1 mt-2">
                {orthoCase.records.map((record) => {
                  const isRecordActive = orthoCase.id === activeCaseId && record.id === activeRecordId;
                  return (
                    <button
                      key={record.id}
                      onClick={() => onSelectRecord(orthoCase.id, record.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-all ${
                        isRecordActive
                          ? "bg-ink text-cream-100 shadow-sm"
                          : "bg-surface border border-line text-ink-70 hover:border-clay/40 hover:bg-cream-200"
                      }`}
                    >
                      <span className="font-medium truncate">{record.label}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold capitalize ${
                          isRecordActive
                            ? "bg-cream-100/20 text-cream-100"
                            : STATUS_PILL[record.status] ?? "bg-cream-300 text-ink-40"
                        }`}
                      >
                        {record.status}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => onAddPlan(orthoCase.id)}
                className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs text-ink-40 hover:border-clay hover:text-clay-dark transition-colors mt-1"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Treatment Plan
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export function CaseListSidebar() {
  const {
    patients,
    cases,
    activeCaseId,
    activeRecord,
    sidebarOpen,
    setSidebarOpen,
    setActiveCase,
    setActiveRecord,
    addRecord,
    createPatient,
    createCaseForPatient,
  } = useCaseStore();

  const { loadCase } = useSTLScanStore();

  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showDatasetModalForPatient, setShowDatasetModalForPatient] = useState<string | null>(null);

  const activeRecId = activeRecord()?.id ?? null;

  async function handleCreatePatient(data: Omit<PatientMeta, "id">) {
    const pid = createPatient(data);
    setShowPatientModal(false);
    // Prompt immediately to select a dataset
    setShowDatasetModalForPatient(pid);
  }

  async function handleSelectDatasetCase(datasetCaseId: string, datasetLabel: string) {
    if (!showDatasetModalForPatient) return;
    const cid = createCaseForPatient(showDatasetModalForPatient, datasetCaseId, datasetLabel);
    setShowDatasetModalForPatient(null);
    await loadCase(datasetCaseId);
  }

  async function handleSelectRecord(caseId: string, recordId: string) {
    setActiveCase(caseId);
    setActiveRecord(recordId);

    // Check if we need to load STLs for this case
    const c = cases.find(c => c.id === caseId);
    if (c) {
      await loadCase(c.datasetCaseId);
    }
  }

  if (!sidebarOpen) {
    return (
      <div className="flex w-12 shrink-0 flex-col items-center border-r border-line bg-cream-100 py-4 gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          title="Open patient list"
          className="rounded-lg p-2 text-ink-40 hover:bg-cream-200 hover:text-ink transition"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-cream-100 z-10 relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-cream-100 text-[10px] font-black shadow-sm">
              OV
            </div>
            <span className="text-sm font-bold text-ink">Patients</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1 text-ink-40 hover:bg-cream-200 hover:text-ink transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Action Bar */}
        <div className="p-3 border-b border-line shrink-0">
          <button
            onClick={() => setShowPatientModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-cream-100 hover:bg-ink/90 shadow-sm transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Patient
          </button>
        </div>

        {/* Patient List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {patients.length > 0 ? (
            patients.map((p) => (
              <PatientCard
                key={p.id}
                patient={p}
                patientCases={cases.filter((c) => c.patientId === p.id)}
                activeCaseId={activeCaseId}
                activeRecordId={activeRecId}
                onSelectCase={setActiveCase}
                onSelectRecord={handleSelectRecord}
                onAddPlan={addRecord}
                onSelectDataset={setShowDatasetModalForPatient}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface border border-line">
                <svg className="h-6 w-6 text-ink-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink-70">No patients yet</p>
              <p className="text-xs text-ink-40 mt-1 leading-relaxed">
                Add a new patient to begin orthodontic treatment planning.
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Modals rendered at root to overlay everything */}
      {showPatientModal && (
        <NewPatientModal
          onClose={() => setShowPatientModal(false)}
          onSubmit={handleCreatePatient}
        />
      )}

      {showDatasetModalForPatient && (
        <DatasetLibraryModal
          onClose={() => setShowDatasetModalForPatient(null)}
          onSelect={handleSelectDatasetCase}
        />
      )}
    </>
  );
}
