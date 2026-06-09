const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface FindingDto {
  label: string;
  confidence: number;
  source: string;
  evidence?: Record<string, unknown> | null;
}

export interface ToothDto {
  fdi: number;
  bbox_xyxy: number[];
  severity: "green" | "yellow" | "orange" | "red";
  mask_path?: string | null;
  findings: FindingDto[];
}

export interface SummaryDto {
  overall_score: number | null;
  cavity_risk: number | null;
  missing_teeth_count: number | null;
  treatment_priority: number[];
}

export interface ScanDto {
  id: string;
  filename: string;
  status: string;
  created_at: string;
  teeth: ToothDto[];
  summary: SummaryDto;
}

export async function uploadImage(file: File): Promise<{ image_id: string; filename: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_URL}/api/upload`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return res.json();
}

export async function startAnalyze(imageId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/analyze/${imageId}`, { method: "POST" });
  if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
}

export async function getScan(imageId: string): Promise<ScanDto> {
  const res = await fetch(`${API_URL}/api/scan/${imageId}`);
  if (!res.ok) throw new Error(`getScan failed: ${res.status}`);
  return res.json();
}

export interface ScanListItem {
  id: string;
  filename: string;
  status: string;
  created_at: string;
  overall_score: number | null;
  cavity_risk: number | null;
  missing_teeth_count: number | null;
}

export async function listScans(): Promise<ScanListItem[]> {
  const res = await fetch(`${API_URL}/api/scans`);
  if (!res.ok) throw new Error(`listScans failed: ${res.status}`);
  return res.json();
}

export interface ToothChange {
  fdi: number;
  from: "green" | "yellow" | "orange" | "red";
  to: "green" | "yellow" | "orange" | "red";
  direction: "worsened" | "improved";
}

export interface CompareDto {
  scan_a: { id: string; score: number | null; at: string };
  scan_b: { id: string; score: number | null; at: string };
  delta_score: number;
  tooth_changes: ToothChange[];
}

export async function compareScans(a: string, b: string): Promise<CompareDto> {
  const res = await fetch(`${API_URL}/api/timeline/${a}/vs/${b}`);
  if (!res.ok) throw new Error(`compareScans failed: ${res.status}`);
  return res.json();
}

export async function uploadReport(scanId: string, file: File): Promise<{
  report_id: string;
  scan_id: string;
  findings_added: number;
}> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_URL}/api/scan/${scanId}/report`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(`uploadReport failed: ${res.status}`);
  return res.json();
}

export interface ToothPoseDto {
  fdi: number;
  position: [number, number, number];
  rotation_deg: number;
  confidence: number;
}

export interface OrthodonticIssueDto {
  type: string;
  arch: string;
  value: number;
  unit: string;
  severity: "mild" | "moderate" | "high";
  teeth: number[];
}

export interface AttachmentDto {
  required: boolean;
  type: string;
  surface: string;
  reason: string;
}

export interface IprDto {
  between: number[];
  amount_mm: number;
  stage: number;
  reason: string;
}

export interface StageMovementDto {
  fdi: number;
  translation: [number, number, number];
  translation_mm: number;
  rotation_deg: number;
  intrusion_mm: number;
  extrusion_mm: number;
  direction: string;
  attachment: AttachmentDto | null;
  ipr: IprDto | null;
}

export interface AlignerStageDto {
  number: number;
  kind: "active" | "passive";
  wear_days: number;
  movements: StageMovementDto[];
  notes: string;
}

export interface ToothMovementDto {
  fdi: number;
  tooth_name: string;
  start: { position: [number, number, number]; rotation_deg: number };
  target: { position: [number, number, number]; rotation_deg: number };
  total: {
    translation: [number, number, number];
    translation_mm: number;
    rotation_deg: number;
    intrusion_mm: number;
    extrusion_mm: number;
  };
  attachment: AttachmentDto | null;
  ipr: IprDto | null;
  risk: { score: number; level: "low" | "moderate" | "high"; drivers: string[] };
}

export interface TreatmentPlanDto {
  id: string;
  case_id: string;
  status: string;
  source: string;
  model: {
    case_id: string;
    source: string;
    teeth: ToothPoseDto[];
    bite: {
      overjet_mm: number;
      overbite_percent: number;
      midline_deviation_mm: number;
    };
  };
  analysis: {
    issues: OrthodonticIssueDto[];
    metrics: Record<string, number>;
  };
  movements: ToothMovementDto[];
  stages: AlignerStageDto[];
  prediction: {
    estimated_duration_weeks: number;
    estimated_duration_months: number;
    refinement_probability: number;
    tracking_confidence: number;
    total_ipr_mm: number;
    risk_teeth: Array<{
      fdi: number;
      score: number;
      level: string;
      drivers: string[];
    }>;
    assumptions: string[];
  };
  constraints: Record<string, number | boolean>;
  report: {
    title: string;
    case_id: string;
    generated_on: string;
    status: string;
    diagnosis_summary: string[];
    movement_summary: Record<string, number>;
    attachment_plan: Array<AttachmentDto & { fdi: number }>;
    ipr_plan: IprDto[];
    stage_breakdown: AlignerStageDto[];
    duration: { weeks: number; months: number };
    risk_analysis: Array<Record<string, unknown>>;
    refinement_prediction: number;
    clinical_notice: string;
  };
}

export interface CopilotResponseDto {
  answer: string;
  highlight_teeth: number[];
  source: string;
  clinical_notice: string;
}

export async function getDemoTreatmentPlan(): Promise<TreatmentPlanDto> {
  const res = await fetch(`${API_URL}/api/orthodontics/demo-plan`);
  if (!res.ok) throw new Error(`treatment plan failed: ${res.status}`);
  return res.json();
}

export async function askOrthodonticCopilot(
  question: string,
  plan: TreatmentPlanDto,
): Promise<CopilotResponseDto> {
  const res = await fetch(`${API_URL}/api/orthodontics/copilot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, plan }),
  });
  if (!res.ok) throw new Error(`copilot failed: ${res.status}`);
  return res.json();
}
