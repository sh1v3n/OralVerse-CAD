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

export const ENAMEL_COLOR = "#fbf9f6";
export const GUM_COLOR = "#d97c8e";
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
  rotation: [number, number, number];
}

const ARCH_WIDTH = 3.15;
const ARCH_DEPTH = 3;
const ARCH_DEPTH_OFFSET = 0.5;
export const UPPER_Y = 0.75;
export const LOWER_Y = -0.75;

export interface ToothLayout {
  fdi: number;
  position: [number, number, number];
  rotation: [number, number, number];
}

const UPPER_ARCH = [
  { x: 0.42, z: 0.00, yOffset: -0.05, rotY: 2, rotX: 8, rotZ: -2 }, // 1
  { x: 1.20, z: 0.22, yOffset: 0.05, rotY: 12, rotX: 6, rotZ: -4 }, // 2
  { x: 1.85, z: 0.80, yOffset: -0.05, rotY: 35, rotX: 2, rotZ: -6 }, // 3
  { x: 2.25, z: 1.45, yOffset: 0.05, rotY: 45, rotX: 0, rotZ: 0 }, // 4
  { x: 2.55, z: 2.15, yOffset: 0.10, rotY: 50, rotX: -2, rotZ: 2 }, // 5
  { x: 2.90, z: 3.05, yOffset: 0.20, rotY: 55, rotX: -4, rotZ: 4 }, // 6
  { x: 3.15, z: 3.95, yOffset: 0.35, rotY: 60, rotX: -6, rotZ: 6 }, // 7
  { x: 3.35, z: 4.85, yOffset: 0.55, rotY: 65, rotX: -8, rotZ: 8 }, // 8
];

const LOWER_ARCH = [
  { x: 0.26, z: 0.18, yOffset: 0.10, rotY: 0, rotX: -4, rotZ: 0 }, // 1
  { x: 0.78, z: 0.38, yOffset: 0.10, rotY: 10, rotX: -4, rotZ: 0 }, // 2
  { x: 1.48, z: 0.88, yOffset: 0.15, rotY: 30, rotX: -2, rotZ: 2 }, // 3
  { x: 1.90, z: 1.55, yOffset: 0.05, rotY: 40, rotX: 0, rotZ: 0 }, // 4
  { x: 2.20, z: 2.25, yOffset: -0.05, rotY: 45, rotX: 2, rotZ: -2 }, // 5
  { x: 2.55, z: 3.15, yOffset: -0.15, rotY: 50, rotX: 4, rotZ: -4 }, // 6
  { x: 2.75, z: 4.05, yOffset: -0.30, rotY: 55, rotX: 6, rotZ: -6 }, // 7
  { x: 2.95, z: 4.95, yOffset: -0.50, rotY: 60, rotX: 8, rotZ: -8 }, // 8
];

function layoutQuadrant(quadrant: 1 | 2 | 3 | 4): ToothLayout[] {
  const base = quadrant === 1 ? 10 : quadrant === 2 ? 20 : quadrant === 3 ? 30 : 40;
  const upper = quadrant === 1 || quadrant === 2;
  const side: 1 | -1 = quadrant === 1 || quadrant === 4 ? -1 : 1;
  const y = upper ? UPPER_Y : LOWER_Y;
  const arch = upper ? UPPER_ARCH : LOWER_ARCH;

  return Array.from({ length: 8 }, (_, i) => {
    const data = arch[i];
    const px = side * data.x;
    const pz = -data.z + ARCH_DEPTH_OFFSET;
    const py = y + data.yOffset;
    
    const rotY = THREE.MathUtils.degToRad(side * data.rotY);
    const rotX = THREE.MathUtils.degToRad(data.rotX);
    const rotZ = THREE.MathUtils.degToRad(side * data.rotZ);

    return {
      fdi: base + i + 1,
      position: [px, py, pz] as [number, number, number],
      rotation: [rotX, rotY, rotZ] as [number, number, number],
    };
  });
}

export function idealRotation(fdi: number): number {
  return TOOTH_LAYOUT.find((tooth) => tooth.fdi === fdi)?.rotation[1] ?? 0;
}

export const TOOTH_LAYOUT: ToothLayout[] = [
  ...layoutQuadrant(1),
  ...layoutQuadrant(2),
  ...layoutQuadrant(3),
  ...layoutQuadrant(4),
];

export function makeArchCurve(y: number, isUpper: boolean): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  const arch = isUpper ? UPPER_ARCH : LOWER_ARCH;
  
  for (let i = 7; i >= 0; i--) {
    const t = arch[i];
    points.push(new THREE.Vector3(-t.x, y + t.yOffset, -t.z + ARCH_DEPTH_OFFSET));
  }
  for (let i = 0; i < 8; i++) {
    const t = arch[i];
    points.push(new THREE.Vector3(t.x, y + t.yOffset, -t.z + ARCH_DEPTH_OFFSET));
  }
  return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
}
