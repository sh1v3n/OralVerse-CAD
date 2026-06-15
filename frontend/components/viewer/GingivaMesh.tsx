"use client";

/**
 * GingivaMesh — renders the separated gingiva geometry
 * with a semi-transparent pink material.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";

interface GingivaMeshProps {
  geometry: THREE.BufferGeometry;
  opacity?: number;
  wireframe?: boolean;
  clipPlane?: THREE.Plane | null;
  visible?: boolean;
}

export function GingivaMesh({
  geometry,
  opacity = 0.85,
  wireframe = false,
  clipPlane = null,
  visible = true,
}: GingivaMeshProps) {
  const material = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#d4879a"),
      roughness: 0.5,
      metalness: 0.0,
      clearcoat: 0.1,
      transparent: true,
      opacity,
      side: THREE.FrontSide,
      depthWrite: opacity > 0.95,
    });
  }, []);

  // Mutate dynamic properties
  useEffect(() => {
    material.transparent = true;
    material.opacity = opacity;
    material.wireframe = wireframe;
    material.depthWrite = opacity > 0.95;

    if (clipPlane) {
      material.clippingPlanes = [clipPlane];
      material.clipShadows = true;
    } else {
      material.clippingPlanes = [];
    }

    material.needsUpdate = true;
  }, [material, opacity, wireframe, clipPlane]);

  if (!visible) return null;

  return (
    <mesh geometry={geometry} material={material} castShadow receiveShadow />
  );
}
