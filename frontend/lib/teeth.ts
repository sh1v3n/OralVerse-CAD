// FDI numbering and anatomical arch geometry.
//
// FDI quadrants:
//   Q1 11-18  upper-right (patient's right)
//   Q2 21-28  upper-left
//   Q3 31-38  lower-left
//   Q4 41-48  lower-right
// Position 1 is at the midline (central incisor), 8 is the third molar.

import * as THREE from "three";

export type Severity = "green" | "yellow" | "orange" | "red";
export type ToothKind = "incisor" | "canine" | "premolar" | "molar";

export const SEVERITY_COLOR: Record<Severity, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
};

export const ENAMEL_COLOR = "#f5f1e1";
export const GUM_COLOR = "#e89999";
export const BONE_COLOR = "#e4ceaa";

export const ALL_FDI: number[] = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
];

export function toothKind(fdi: number): ToothKind {
  const pos = fdi % 10;
  if (pos === 1 || pos === 2) return "incisor";
  if (pos === 3) return "canine";
  if (pos === 4 || pos === 5) return "premolar";
  return "molar";
}

export function isUpper(fdi: number): boolean {
  return fdi >= 11 && fdi <= 28;
}

export interface ToothLayout {
  fdi: number;
  position: [number, number, number];
  rotationY: number;
}

const ARCH_WIDTH = 3.15;
const ARCH_DEPTH = 3;
const ARCH_DEPTH_OFFSET = 0.72;
export const UPPER_Y = 0.66;
export const LOWER_Y = -0.66;

function archPoint(t: number, side: 1 | -1): [number, number] {
  // Parametric horseshoe: t=0 midline (incisor), t=1 last molar (third molar).
  const angle = (Math.PI / 2) * t;
  const x = side * ARCH_WIDTH * Math.sin(angle);
  const z = ARCH_DEPTH * (1 - Math.cos(angle));
  return [x, z];
}

function layoutQuadrant(quadrant: 1 | 2 | 3 | 4): ToothLayout[] {
  const base = quadrant === 1 ? 11 : quadrant === 2 ? 21 : quadrant === 3 ? 31 : 41;
  const upper = quadrant === 1 || quadrant === 2;
  // Q1 (upper right) and Q4 (lower right) -> viewer's left = side -1
  const side: 1 | -1 = quadrant === 1 || quadrant === 4 ? -1 : 1;
  const y = upper ? UPPER_Y : LOWER_Y;

  return Array.from({ length: 8 }, (_, i) => {
    const position = i + 1;
    const t = (position - 0.5) / 8;
    const [x, z] = archPoint(t, side);
    const rotationY = THREE.MathUtils.degToRad((x / ARCH_WIDTH) * 25);
    return {
      fdi: base + position,
      position: [x, y, -z + ARCH_DEPTH_OFFSET] as [number, number, number],
      rotationY,
    };
  });
}

export function idealRotation(fdi: number): number {
  return TOOTH_LAYOUT.find((tooth) => tooth.fdi === fdi)?.rotationY ?? 0;
}

export const TOOTH_LAYOUT: ToothLayout[] = [
  ...layoutQuadrant(1),
  ...layoutQuadrant(2),
  ...layoutQuadrant(3),
  ...layoutQuadrant(4),
];

// Sample arch curve as a 3D Catmull-Rom for tube geometries (gums, jawbone).
export function makeArchCurve(y: number, samples = 32): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  // Sweep right (side -1) from molar back to midline, then left (side +1) midline to molar.
  for (let i = 0; i < samples; i++) {
    const t = 1 - i / (samples - 1);
    const [x, z] = archPoint(t, -1);
    points.push(new THREE.Vector3(x, y, -z + ARCH_DEPTH_OFFSET));
  }
  for (let i = 1; i < samples; i++) {
    const t = i / (samples - 1);
    const [x, z] = archPoint(t, 1);
    points.push(new THREE.Vector3(x, y, -z + ARCH_DEPTH_OFFSET));
  }
  return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
}
