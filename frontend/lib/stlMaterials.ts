/**
 * Dental material presets (Clinical CAD Edition)
 *
 * "bone" preset is now the primary material — matching real plaster/stone articulated casts.
 * Other presets remain for potential future use but are not shown in the UI.
 */

import * as THREE from "three";

export type MaterialPreset = "enamel" | "gingiva" | "bone" | "xray";

// ─── Primary: Stone Cast / Bone ────────────────────────────────────────────────
// Matches the LingOral tan/plaster look — matte, warm, no harsh reflections

export function createBoneMaterial(opacity = 1): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#c8a87a"),   // warm tan / stone cast color
    roughness: 0.72,
    metalness: 0.0,
    clearcoat: 0.0,
    envMapIntensity: 0.0,
    transparent: opacity < 1,
    opacity,
    side: THREE.FrontSide,
  });
}

// ─── Enamel (secondary — whiter, glossier) ────────────────────────────────────

export function createEnamelMaterial(opacity = 1): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#f0ece4"),
    roughness: 0.28,
    metalness: 0.0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
    reflectivity: 0.35,
    envMapIntensity: 0.3,
    transparent: opacity < 1,
    opacity,
    side: THREE.FrontSide,
  });
}

// ─── Gingiva (secondary — soft pink) ──────────────────────────────────────────

export function createGingivaMaterial(opacity = 1): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#d4879a"),
    roughness: 0.5,
    metalness: 0.0,
    clearcoat: 0.15,
    clearcoatRoughness: 0.35,
    transparent: opacity < 1,
    opacity,
    side: THREE.FrontSide,
  });
}

// ─── X-Ray (secondary — translucent) ──────────────────────────────────────────

export function createXrayMaterial(opacity = 0.35): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#a0d8ef"),
    roughness: 0.1,
    metalness: 0.0,
    transmission: 0.7,
    thickness: 0.5,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

// ─── Preset selector ──────────────────────────────────────────────────────────

export function createMaterialFromPreset(
  preset: MaterialPreset,
  opacity = 1,
): THREE.MeshPhysicalMaterial {
  switch (preset) {
    case "enamel":
      return createEnamelMaterial(opacity);
    case "gingiva":
      return createGingivaMaterial(opacity);
    case "bone":
      return createBoneMaterial(opacity);
    case "xray":
      return createXrayMaterial(opacity);
  }
}
