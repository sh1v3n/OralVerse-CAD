"use client";

/**
 * Renders a single STL BufferGeometry with dental materials (Optimized).
 * Mutates material properties instead of recreating the material to avoid WebGL lag/hanging.
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createMaterialFromPreset, type MaterialPreset } from "@/lib/stlMaterials";
import { useSTLScanStore } from "@/lib/scanStore";

interface STLMeshProps {
  geometry: THREE.BufferGeometry;
  materialPreset?: MaterialPreset;
  opacity?: number;
  wireframe?: boolean;
  clipPlane?: THREE.Plane | null;
  visible?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
}

export function STLMesh({
  geometry,
  materialPreset = "bone",
  opacity = 1,
  wireframe = false,
  clipPlane = null,
  visible = true,
  emissive,
  emissiveIntensity = 0,
}: STLMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const shadowsEnabled = useSTLScanStore((s) => s.shadowsEnabled);
  const isInteracting = useSTLScanStore((s) => s.isInteracting);

  // 1. Memoize ONLY the base material preset class to prevent shader recompilation
  const material = useMemo(() => {
    return createMaterialFromPreset(materialPreset, opacity);
  }, [materialPreset]);

  // 2. Perform direct mutations for dynamic visual attributes (zero WebGL recompilation penalty)
  useEffect(() => {
    if (!material) return;
    material.transparent = opacity < 1;
    material.opacity = opacity;
    material.wireframe = wireframe;

    if (clipPlane) {
      material.clippingPlanes = [clipPlane];
      material.clipShadows = true;
    } else {
      material.clippingPlanes = [];
    }

    if (emissive) {
      material.emissive = new THREE.Color(emissive);
      material.emissiveIntensity = emissiveIntensity;
    } else {
      material.emissive.setScalar(0);
      material.emissiveIntensity = 0;
    }

    material.needsUpdate = true;
  }, [material, opacity, wireframe, clipPlane, emissive, emissiveIntensity]);

  if (!visible) return null;

  // Render option adjustments: Disable shadows during interaction for instant fps boost
  const activeCastShadow = shadowsEnabled && !isInteracting;
  const activeReceiveShadow = shadowsEnabled && !isInteracting;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      castShadow={activeCastShadow}
      receiveShadow={activeReceiveShadow}
    />
  );
}
