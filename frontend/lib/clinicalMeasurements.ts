import * as THREE from "three";

/**
 * Coordinate System (OralVerse Standard):
 *
 * X: Left ↔ Right
 *    +X = Patient Left (Q2, Q3)
 *    -X = Patient Right (Q1, Q4)
 *    Midline is approximately X = 0.
 *
 * Y: Superior ↔ Inferior (Intrusion/Extrusion)
 *    +Y = Up (Maxillary direction)
 *    -Y = Down (Mandibular direction)
 *    Occlusal plane is approximately Y = 0.
 *
 * Z: Anterior ↔ Posterior
 *    +Z = Anterior (Front, Labial/Facial)
 *    -Z = Posterior (Back, Lingual/Throat)
 */

export type Confidence = "high" | "medium" | "low";

export interface Measurement {
  value: number;
  confidence: Confidence;
  normativeRange?: string;
  isNormal?: boolean;
}

export interface ClinicalDiagnostics {
  overjet: Measurement | null;
  overbite: Measurement | null;
  midlineDeviation: Measurement | null;
  archWidthUpper: Measurement | null;
  archWidthLower: Measurement | null;
  crowdingUpper: Measurement | null;
  spacingUpper: Measurement | null;
  crowdingLower: Measurement | null;
  spacingLower: Measurement | null;
}

export interface ToothData {
  fdi: number;
  centroid: THREE.Vector3;
  bbox: THREE.Box3;
  landmarks?: {
    incisalEdge?: THREE.Vector3;
    cuspTip?: THREE.Vector3;
    mesial?: THREE.Vector3;
    distal?: THREE.Vector3;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTooth(teeth: ToothData[], fdi: number): ToothData | undefined {
  return teeth.find((t) => t.fdi === fdi);
}

function getMesiodistalWidth(tooth: ToothData): number {
  if (tooth.landmarks?.mesial && tooth.landmarks?.distal) {
    return tooth.landmarks.mesial.distanceTo(tooth.landmarks.distal);
  }
  // Fallback to bounding box X width as an approximation
  return tooth.bbox.max.x - tooth.bbox.min.x;
}

// ─── Measurements ───────────────────────────────────────────────────────────

function computeOverjet(upperTeeth: ToothData[], lowerTeeth: ToothData[]): Measurement | null {
  const u11 = getTooth(upperTeeth, 11);
  const u21 = getTooth(upperTeeth, 21);
  const l31 = getTooth(lowerTeeth, 31);
  const l41 = getTooth(lowerTeeth, 41);

  if ((!u11 && !u21) || (!l31 && !l41)) return null;

  // Average Z of upper centrals
  let uz = 0;
  let uc = 0;
  if (u11) { uz += u11.centroid.z; uc++; }
  if (u21) { uz += u21.centroid.z; uc++; }
  uz /= uc;

  // Average Z of lower centrals
  let lz = 0;
  let lc = 0;
  if (l31) { lz += l31.centroid.z; lc++; }
  if (l41) { lz += l41.centroid.z; lc++; }
  lz /= lc;

  // +Z is anterior. Overjet is upper anterior relative to lower anterior.
  // We use a slight offset because centroids are inside the tooth, not at the edge.
  const centroidOverjet = uz - lz;
  
  // A typical upper incisor is ~1-2mm thicker/in-front at centroid vs edge relationship, 
  // but for phase 1 we report the relative centroid difference + constant calibration.
  const estimatedOverjet = centroidOverjet + 1.0; 

  const isNormal = estimatedOverjet >= 2.0 && estimatedOverjet <= 3.0;

  return {
    value: estimatedOverjet,
    confidence: "high",
    normativeRange: "2–3 mm",
    isNormal,
  };
}

function computeOverbite(upperTeeth: ToothData[], lowerTeeth: ToothData[]): Measurement | null {
  const u11 = getTooth(upperTeeth, 11);
  const u21 = getTooth(upperTeeth, 21);
  const l31 = getTooth(lowerTeeth, 31);
  const l41 = getTooth(lowerTeeth, 41);

  if ((!u11 && !u21) || (!l31 && !l41)) return null;

  let uy = 0, uc = 0;
  if (u11) { uy += u11.centroid.y; uc++; }
  if (u21) { uy += u21.centroid.y; uc++; }
  uy /= uc;

  let ly = 0, lc = 0;
  if (l31) { ly += l31.centroid.y; lc++; }
  if (l41) { ly += l41.centroid.y; lc++; }
  ly /= lc;

  // +Y is up. Upper incisors are at positive Y, lower at negative Y.
  // Overlap means the lower incisal edge (ly + half-height) goes above the upper incisal edge (uy - half-height).
  // Assuming ~8mm combined half-heights for centrals.
  const estimatedOverbite = (ly - uy) + 8.0;

  const isNormal = estimatedOverbite >= 1.0 && estimatedOverbite <= 3.0;

  return {
    value: estimatedOverbite,
    confidence: "medium",
    normativeRange: "1–3 mm",
    isNormal,
  };
}

function computeMidlineDeviation(upperTeeth: ToothData[], lowerTeeth: ToothData[]): Measurement | null {
  const u11 = getTooth(upperTeeth, 11);
  const u21 = getTooth(upperTeeth, 21);
  const l31 = getTooth(lowerTeeth, 31);
  const l41 = getTooth(lowerTeeth, 41);

  if (!u11 || !u21 || !l31 || !l41) return null;

  const upperMidline = (u11.centroid.x + u21.centroid.x) / 2.0;
  const lowerMidline = (l31.centroid.x + l41.centroid.x) / 2.0;

  const deviation = Math.abs(upperMidline - lowerMidline);
  
  return {
    value: deviation,
    confidence: "high",
    normativeRange: "< 2 mm",
    isNormal: deviation < 2.0,
  };
}

function computeArchWidth(teeth: ToothData[], arch: "upper" | "lower"): Measurement | null {
  const leftMolar = getTooth(teeth, arch === "upper" ? 26 : 36);
  const rightMolar = getTooth(teeth, arch === "upper" ? 16 : 46);

  if (!leftMolar || !rightMolar) return null;

  const width = Math.abs(leftMolar.centroid.x - rightMolar.centroid.x);

  return {
    value: width,
    confidence: "high",
    normativeRange: "case dependent",
    isNormal: true, // No strict normative range
  };
}

function computeCrowdingSpacing(teeth: ToothData[]): { crowding: Measurement | null; spacing: Measurement | null } {
  // Sort from right (quadrant 1/4) to left (quadrant 2/3) using FDI
  const sorted = [...teeth].sort((a, b) => {
    // Actually, physically they are ordered by X coordinate (+X is left, -X is right)
    return a.centroid.x - b.centroid.x;
  });

  if (sorted.length < 3) return { crowding: null, spacing: null };

  let availableArchLength = 0;
  let requiredSpace = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const t1 = sorted[i];
    const t2 = sorted[i + 1];
    
    // Distance between adjacent centroids approximates available arch curve length
    availableArchLength += t1.centroid.distanceTo(t2.centroid);
  }

  for (const t of sorted) {
    requiredSpace += getMesiodistalWidth(t);
  }

  // The discrepancy
  // Note: This is an approximation. True arch length is a curve through contact points.
  // Centroid distance is slightly shorter than contact point distance around a curve.
  // We apply a small correction factor (e.g., 1.05)
  const discrepancy = availableArchLength * 1.05 - requiredSpace;

  let crowdingVal = 0;
  let spacingVal = 0;

  if (discrepancy < -1.0) {
    crowdingVal = Math.abs(discrepancy);
  } else if (discrepancy > 1.0) {
    spacingVal = discrepancy;
  }

  return {
    crowding: {
      value: crowdingVal,
      confidence: "low",
      normativeRange: "< 1 mm",
      isNormal: crowdingVal < 1.0,
    },
    spacing: {
      value: spacingVal,
      confidence: "low",
      normativeRange: "< 1 mm",
      isNormal: spacingVal < 1.0,
    }
  };
}

// ─── Engine Entry ───────────────────────────────────────────────────────────

export function computeDiagnostics(teeth: ToothData[]): ClinicalDiagnostics {
  const upperTeeth = teeth.filter((t) => t.fdi >= 11 && t.fdi <= 28);
  const lowerTeeth = teeth.filter((t) => t.fdi >= 31 && t.fdi <= 48);

  const upperDiscrepancy = computeCrowdingSpacing(upperTeeth);
  const lowerDiscrepancy = computeCrowdingSpacing(lowerTeeth);

  return {
    overjet: computeOverjet(upperTeeth, lowerTeeth),
    overbite: computeOverbite(upperTeeth, lowerTeeth),
    midlineDeviation: computeMidlineDeviation(upperTeeth, lowerTeeth),
    archWidthUpper: computeArchWidth(upperTeeth, "upper"),
    archWidthLower: computeArchWidth(lowerTeeth, "lower"),
    crowdingUpper: upperDiscrepancy.crowding,
    spacingUpper: upperDiscrepancy.spacing,
    crowdingLower: lowerDiscrepancy.crowding,
    spacingLower: lowerDiscrepancy.spacing,
  };
}
