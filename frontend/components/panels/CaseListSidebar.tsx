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
  draft: "bg-stone-100 text-stone-600",
  segmentation: "bg-blue-100 text-blue-700",
  planning: "bg-amber-100 text-amber-700",
  review: "bg-violet-100 text-violet-700",
  approved: "bg-emerald-100 text-emerald-700",
  exported: "bg-gray-100 text-gray-600",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="text-base font-semibold text-stone-800">New Patient</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g. Jane Doe"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Date of Birth</label>
              <input
                type="date"
                required
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-stone-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Sex</label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value as "male" | "female" | "other")}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Referring Doctor (Optional)</label>
            <input
              type="text"
              value={referrer}
              onChange={(e) => setReferrer(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Dr. Smith"
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-stone-50 shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-stone-800">Dataset Library</h2>
            <p className="text-xs text-stone-500 mt-0.5">Select STL scans to link to this patient</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-stone-500 gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
              Loading datasets...
            </div>
          )}

          {datasetCases.map((dc) => {
            const totalMB = (dc.scans.reduce((s, f) => s + f.size_bytes, 0) / 1024 / 1024).toFixed(0);
            return (
              <button
                key={dc.id}
                onClick={() => onSelect(dc.id, dc.label)}
                className="w-full rounded-xl border border-stone-200 bg-white p-3.5 text-left hover:border-indigo-400 hover:shadow-md transition-all group flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-stone-800 group-hover:text-indigo-700 transition-colors">
                    {dc.label}
                  </p>
                  <p className="text-[11px] text-stone-400 mt-1">{dc.scan_count} scans available</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-stone-400">{totalMB} MB</span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-stone-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </button>
            );
          })}

          {datasetCases.length === 0 && !isLoading && (
            <p className="text-sm text-stone-500 italic text-center py-8">
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
      isActive ? "border-indigo-300 bg-indigo-50/40 shadow-sm" : "border-stone-200 bg-white hover:border-stone-300"
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start justify-between p-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{patient.name}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1 uppercase tracking-wider">
            <span>{patient.sex.charAt(0)}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
            <span>DOB: {new Date(patient.dob).toLocaleDateString()}</span>
          </div>
        </div>
        <svg
          className={`mt-1 h-4 w-4 text-slate-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-stone-100 px-3 pb-3 pt-2 space-y-2">
          {!orthoCase ? (
            <div className="rounded-lg bg-stone-50 border border-stone-200 border-dashed p-3 text-center">
              <p className="text-xs text-stone-500 mb-2">No scans linked</p>
              <button
                onClick={() => onSelectDataset(patient.id)}
                className="rounded-md bg-white border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-indigo-400 hover:text-indigo-600 transition"
              >
                Select Scans from Library
              </button>
            </div>
          ) : (
            <>
              {/* Dataset Info */}
              <div className="flex items-center justify-between rounded-md bg-stone-100 px-2.5 py-1.5 text-[10px] text-stone-600">
                <span className="font-semibold text-stone-800 truncate pr-2">
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
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-white border border-stone-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50"
                      }`}
                    >
                      <span className="font-medium truncate">{record.label}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold capitalize ${
                          isRecordActive
                            ? "bg-white/20 text-white"
                            : STATUS_PILL[record.status] ?? "bg-stone-200 text-stone-500"
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
                className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-2.5 py-1.5 text-xs text-stone-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors mt-1"
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
      <div className="flex w-12 shrink-0 flex-col items-center border-r border-stone-200 bg-white py-4 gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          title="Open patient list"
          className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition"
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
      <aside className="flex w-72 shrink-0 flex-col border-r border-stone-200 bg-stone-50 shadow-sm z-10 relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white text-[10px] font-black">
              OV
            </div>
            <span className="text-sm font-bold text-slate-800">Patients</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Action Bar */}
        <div className="p-3 border-b border-stone-200 bg-white shrink-0">
          <button
            onClick={() => setShowPatientModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm transition-colors"
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
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
                <svg className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-stone-700">No patients yet</p>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                Add a new patient to begin Orthodontic treatment planning.
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
