// FDI numbering and procedural arch geometry.
//
// FDI quadrants:
//   Q1 11-18  upper-right (patient's right)
//   Q2 21-28  upper-left
//   Q3 31-38  lower-left
//   Q4 41-48  lower-right
// Position 1 is at the midline (central incisor), 8 is the third molar.

export type Severity = "green" | "yellow" | "orange" | "red";

export const SEVERITY_COLOR: Record<Severity, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
};

export const ALL_FDI: number[] = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
];

export interface ToothLayout {
  fdi: number;
  position: [number, number, number];
  rotationY: number;
  scale: [number, number, number];
}

// Parametric horseshoe: half-ellipse parametrized by t in [0, 1].
// t=0 is the midline (incisor), t=1 is the last molar.
function archPoint(t: number, side: 1 | -1, archWidth: number, archDepth: number): [number, number] {
  // Slightly squashed ellipse so molars sit further back.
  const angle = (Math.PI / 2) * t; // 0 at midline → 90° at last molar
  const x = side * archWidth * Math.sin(angle);
  const z = archDepth * (1 - Math.cos(angle));
  return [x, z];
}

const ARCH_WIDTH = 2.8;
const ARCH_DEPTH = 2.6;
const UPPER_Y = 0.4;
const LOWER_Y = -0.4;

// Per-position scale: incisors slimmer, molars wider.
const POSITION_SCALE: [number, number, number][] = [
  [0.34, 0.95, 0.42], // 1 central incisor
  [0.32, 0.90, 0.40], // 2 lateral incisor
  [0.36, 1.05, 0.46], // 3 canine
  [0.42, 0.85, 0.55], // 4 first premolar
  [0.44, 0.85, 0.58], // 5 second premolar
  [0.56, 0.80, 0.66], // 6 first molar
  [0.58, 0.80, 0.68], // 7 second molar
  [0.54, 0.74, 0.62], // 8 third molar
];

function layoutQuadrant(quadrant: 1 | 2 | 3 | 4): ToothLayout[] {
  const base = quadrant === 1 ? 11 : quadrant === 2 ? 21 : quadrant === 3 ? 31 : 41;
  const upper = quadrant === 1 || quadrant === 2;
  const side: 1 | -1 = quadrant === 1 || quadrant === 4 ? -1 : 1; // Q1/Q4 = viewer's left (patient right)
  const y = upper ? UPPER_Y : LOWER_Y;

  return Array.from({ length: 8 }, (_, i) => {
    const position = i + 1;
    // Spread positions slightly past the midline so incisors don't collide.
    const t = (position - 0.5) / 8;
    const [x, z] = archPoint(t, side, ARCH_WIDTH, ARCH_DEPTH);
    const rotationY = Math.atan2(x, z) + (side === 1 ? Math.PI : 0);
    return {
      fdi: base + position,
      position: [x, y, -z + 0.5],
      rotationY,
      scale: POSITION_SCALE[i],
    };
  });
}

export const TOOTH_LAYOUT: ToothLayout[] = [
  ...layoutQuadrant(1),
  ...layoutQuadrant(2),
  ...layoutQuadrant(3),
  ...layoutQuadrant(4),
];

export function fdiLabel(fdi: number): string {
  return `${fdi}`;
}
