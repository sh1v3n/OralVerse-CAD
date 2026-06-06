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
