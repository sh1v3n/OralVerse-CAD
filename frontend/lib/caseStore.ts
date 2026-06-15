import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WorkflowStage } from "./store";

// ─── Patient / Case Domain ────────────────────────────────────────────────────

export interface PatientMeta {
  id: string;
  name: string;
  dob: string; // ISO date
  sex: "male" | "female" | "other";
  referrer: string;
}

export type CaseStatus =
  | "draft"
  | "segmentation"
  | "planning"
  | "review"
  | "approved"
  | "exported";

export interface TreatmentRecord {
  id: string;
  label: string;
  createdAt: string;
  status: CaseStatus;
  workflowStage: WorkflowStage;
  approvalStatus: "pending" | "approved" | "rejected";
  extractedTeeth: number[];
  lockedTeeth: number[];
  attachmentsVisible: boolean;
  collisionVisible: boolean;
  iprVisible: boolean;
  notes: string;
}

export interface OrthoCase {
  id: string;
  patientId: string;
  datasetCaseId: string;
  datasetLabel: string;
  createdAt: string;
  records: TreatmentRecord[];
  activeRecordId: string | null;
}

// ─── Import State ─────────────────────────────────────────────────────────────

export type ImportStatus = "idle" | "uploading" | "preprocessing" | "segmenting" | "ready" | "error";

export interface ImportState {
  status: ImportStatus;
  fileName: string | null;
  progress: number; // 0-100
  errorMessage: string | null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface CaseState {
  patients: PatientMeta[];
  cases: OrthoCase[];
  activeCaseId: string | null;
  sidebarOpen: boolean;
  importState: ImportState;

  // Selectors
  activeCase: () => OrthoCase | undefined;
  activeRecord: () => TreatmentRecord | undefined;

  // Case actions
  // Case actions
  createPatient: (patient: Omit<PatientMeta, "id">) => string; // returns new patientId
  createCaseForPatient: (patientId: string, datasetCaseId: string, datasetLabel: string) => string;
  setActiveCase: (caseId: string) => void;
  setActiveRecord: (recordId: string) => void;
  addRecord: (caseId: string) => void;

  // Record actions
  setWorkflowStage: (stage: WorkflowStage) => void;
  advanceWorkflow: () => void;
  rejectWorkflow: () => void;
  setApprovalStatus: (status: TreatmentRecord["approvalStatus"]) => void;
  toggleExtractedTooth: (fdi: number) => void;
  toggleLockedTooth: (fdi: number) => void;
  toggleAttachments: () => void;
  toggleCollision: () => void;
  toggleIpr: () => void;
  setNotes: (notes: string) => void;

  // UI
  setSidebarOpen: (open: boolean) => void;

  // Import
  startImport: (fileName: string) => void;
  setImportProgress: (progress: number, status?: ImportStatus) => void;
  finishImport: () => void;
  failImport: (message: string) => void;
  resetImport: () => void;
}

const WORKFLOW_ORDER: WorkflowStage[] = [
  "preprocessing",
  "segmentation",
  "initial_position",
  "treatment_plan",
  "final_position",
  "staging",
  "attachments",
  "review",
];

function makeRecord(id: string, label: string): TreatmentRecord {
  return {
    id,
    label,
    createdAt: new Date().toISOString(),
    status: "draft",
    workflowStage: "preprocessing",
    approvalStatus: "pending",
    extractedTeeth: [],
    lockedTeeth: [],
    attachmentsVisible: true,
    collisionVisible: false,
    iprVisible: false,
    notes: "",
  };
}

function mutateRecord(
  state: Pick<CaseState, "cases" | "activeCaseId">,
  fn: (r: TreatmentRecord) => TreatmentRecord,
): Partial<CaseState> {
  const cases = state.cases.map((c) => {
    if (c.id !== state.activeCaseId) return c;
    const records = c.records.map((r) => (r.id === c.activeRecordId ? fn(r) : r));
    return { ...c, records };
  });
  return { cases };
}

export const useCaseStore = create<CaseState>()(
  persist(
    (set, get) => ({
      // Start with NO demo data — only real dataset cases
      patients: [],
      cases: [],
      activeCaseId: null,
      sidebarOpen: true,
      importState: { status: "idle", fileName: null, progress: 0, errorMessage: null },

      activeCase: () => get().cases.find((c) => c.id === get().activeCaseId),
      activeRecord: () => {
        const c = get().activeCase();
        return c?.records.find((r) => r.id === c.activeRecordId);
      },

      createPatient: (patientData) => {
        const pid = `p-${Date.now()}`;
        set((s) => ({
          patients: [...s.patients, { ...patientData, id: pid }],
        }));
        return pid;
      },

      createCaseForPatient: (patientId, datasetCaseId, datasetLabel) => {
        const cid = `c-${Date.now()}`;
        const rid = `r-${Date.now()}`;
        
        set((s) => ({
          cases: [
            ...s.cases,
            {
              id: cid,
              patientId,
              datasetCaseId,
              datasetLabel,
              createdAt: new Date().toISOString(),
              records: [makeRecord(rid, "Plan 1")],
              activeRecordId: rid,
            },
          ],
          activeCaseId: cid,
        }));
        return cid;
      },

      setActiveCase: (caseId) => set({ activeCaseId: caseId }),

      setActiveRecord: (recordId) =>
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === s.activeCaseId ? { ...c, activeRecordId: recordId } : c,
          ),
        })),

      addRecord: (caseId) =>
        set((s) => {
          const count = s.cases.find((c) => c.id === caseId)?.records.length ?? 0;
          const rid = `r-${Date.now()}`;
          return {
            cases: s.cases.map((c) => {
              if (c.id !== caseId) return c;
              return {
                ...c,
                records: [...c.records, makeRecord(rid, `Plan ${count + 1}`)],
                activeRecordId: rid,
              };
            }),
          };
        }),

      setWorkflowStage: (stage) =>
        set((s) => mutateRecord(s, (r) => ({ ...r, workflowStage: stage }))),

      advanceWorkflow: () =>
        set((s) => {
          const record = s.activeRecord();
          if (!record) return {};
          const idx = WORKFLOW_ORDER.indexOf(record.workflowStage);
          const next = WORKFLOW_ORDER[idx + 1] ?? record.workflowStage;
          const status: CaseStatus =
            next === "review"
              ? "review"
              : next === "treatment_plan" || next === "final_position"
                ? "planning"
                : next === "segmentation"
                  ? "segmentation"
                  : "draft";
          return mutateRecord(s, (r) => ({ ...r, workflowStage: next, status }));
        }),

      rejectWorkflow: () =>
        set((s) => {
          const record = s.activeRecord();
          if (!record) return {};
          const idx = WORKFLOW_ORDER.indexOf(record.workflowStage);
          const prev = WORKFLOW_ORDER[Math.max(0, idx - 1)];
          return mutateRecord(s, (r) => ({
            ...r,
            workflowStage: prev,
            approvalStatus: "rejected",
          }));
        }),

      setApprovalStatus: (status) =>
        set((s) => mutateRecord(s, (r) => ({ ...r, approvalStatus: status }))),

      toggleExtractedTooth: (fdi) =>
        set((s) =>
          mutateRecord(s, (r) => ({
            ...r,
            extractedTeeth: r.extractedTeeth.includes(fdi)
              ? r.extractedTeeth.filter((t) => t !== fdi)
              : [...r.extractedTeeth, fdi],
          })),
        ),

      toggleLockedTooth: (fdi) =>
        set((s) =>
          mutateRecord(s, (r) => ({
            ...r,
            lockedTeeth: r.lockedTeeth.includes(fdi)
              ? r.lockedTeeth.filter((t) => t !== fdi)
              : [...r.lockedTeeth, fdi],
          })),
        ),

      toggleAttachments: () =>
        set((s) => mutateRecord(s, (r) => ({ ...r, attachmentsVisible: !r.attachmentsVisible }))),

      toggleCollision: () =>
        set((s) => mutateRecord(s, (r) => ({ ...r, collisionVisible: !r.collisionVisible }))),

      toggleIpr: () =>
        set((s) => mutateRecord(s, (r) => ({ ...r, iprVisible: !r.iprVisible }))),

      setNotes: (notes) =>
        set((s) => mutateRecord(s, (r) => ({ ...r, notes }))),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      startImport: (fileName) =>
        set({ importState: { status: "uploading", fileName, progress: 0, errorMessage: null } }),

      setImportProgress: (progress, status) =>
        set((s) => ({
          importState: { ...s.importState, progress, ...(status ? { status } : {}) },
        })),

      finishImport: () =>
        set((s) => ({ importState: { ...s.importState, status: "ready", progress: 100 } })),

      failImport: (message) =>
        set({
          importState: { status: "error", fileName: null, progress: 0, errorMessage: message },
        }),

      resetImport: () =>
        set({ importState: { status: "idle", fileName: null, progress: 0, errorMessage: null } }),
    }),
    {
      name: "oralverse-cases-v3",
      partialize: (s) => ({
        patients: s.patients,
        cases: s.cases,
        activeCaseId: s.activeCaseId,
        sidebarOpen: s.sidebarOpen,
      }),
    },
  ),
);
