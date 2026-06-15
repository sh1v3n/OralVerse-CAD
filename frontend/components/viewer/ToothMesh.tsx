"use client";

/**
 * ToothMesh — renders a single segmented tooth object.
 *
 * Supports:
 *   - Hover: emissive glow highlight + cursor change
 *   - Click: toggles selection in toothObjectStore
 *   - Shift+Click: multi-select
 *   - Selected state: distinct indigo tint
 *   - Segmentation color mode: shows each tooth in its assigned color
 *   - Transform: applies tooth translation/rotation/intrusion via group transform
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useToothObjectStore, type ToothObject } from "@/lib/toothObjectStore";
import { useTreatmentStore } from "@/lib/store";

interface ToothMeshProps {
  tooth: ToothObject;
  opacity?: number;
  wireframe?: boolean;
  clipPlane?: THREE.Plane | null;
  mode?: "normal" | "segmentation";
}

export function ToothMesh({
  tooth,
  opacity = 1,
  wireframe = false,
  clipPlane = null,
  mode = "normal",
}: ToothMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Store state
  const selectedFdis = useToothObjectStore((s) => s.selectedFdis);
  const hoveredFdi = useToothObjectStore((s) => s.hoveredFdi);
  const setHoveredTooth = useToothObjectStore((s) => s.setHoveredTooth);
  const toggleTooth = useToothObjectStore((s) => s.toggleTooth);
  const selectTooth = useToothObjectStore((s) => s.selectTooth);
  const selectInTreatment = useTreatmentStore((s) => s.selectTooth);

  const isSelected = selectedFdis.has(tooth.fdi);
  const isHovered = hoveredFdi === tooth.fdi;

  // Determine the display color
  const displayColor = useMemo(() => {
    if (mode === "segmentation") {
      return tooth.segmentation.color;
    }
    if (isSelected) return "#8b9dc3"; // soft indigo-blue for selected
    return "#c8a87a"; // bone/tan default
  }, [mode, isSelected, tooth.segmentation.color]);

  // Material — memoized on preset, mutated for dynamic props
  const material = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(displayColor),
      roughness: mode === "segmentation" ? 0.55 : 0.72,
      metalness: 0.0,
      clearcoat: 0.0,
      envMapIntensity: 0.0,
      transparent: opacity < 1 || isSelected,
      opacity,
      side: THREE.FrontSide,
    });
  }, [displayColor, mode]);

  // Mutate dynamic properties without recreating material
  useEffect(() => {
    if (!material) return;
    material.color.set(displayColor);
    material.transparent = opacity < 1;
    material.opacity = opacity;
    material.wireframe = wireframe;

    // Hover glow
    if (isHovered && !isSelected) {
      material.emissive.set("#b08850");
      material.emissiveIntensity = 0.25;
    } else if (isSelected) {
      material.emissive.set("#4a5fa8");
      material.emissiveIntensity = 0.2;
    } else {
      material.emissive.setScalar(0);
      material.emissiveIntensity = 0;
    }

    if (clipPlane) {
      material.clippingPlanes = [clipPlane];
      material.clipShadows = true;
    } else {
      material.clippingPlanes = [];
    }

    material.needsUpdate = true;
  }, [material, displayColor, opacity, wireframe, isHovered, isSelected, clipPlane]);

  // ── Interaction handlers ─────────────────────────────────────────────────

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (event.nativeEvent.shiftKey) {
        toggleTooth(tooth.fdi);
      } else {
        selectTooth(tooth.fdi);
      }
      // Sync with treatment store
      selectInTreatment(tooth.fdi);
    },
    [tooth.fdi, toggleTooth, selectTooth, selectInTreatment],
  );

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setHoveredTooth(tooth.fdi);
      document.body.style.cursor = "pointer";
    },
    [tooth.fdi, setHoveredTooth],
  );

  const handlePointerOut = useCallback(() => {
    setHoveredTooth(null);
    document.body.style.cursor = "auto";
  }, [setHoveredTooth]);

  // ── Transform ────────────────────────────────────────────────────────────

  const position = useMemo<[number, number, number]>(() => {
    const t = tooth.transform;
    return [
      t.translation[0],
      t.translation[1] + t.intrusion,
      t.translation[2],
    ];
  }, [tooth.transform]);

  const rotation = useMemo<[number, number, number]>(() => {
    const r = tooth.transform.rotation;
    return [
      THREE.MathUtils.degToRad(r[0]),
      THREE.MathUtils.degToRad(r[1]),
      THREE.MathUtils.degToRad(r[2]),
    ];
  }, [tooth.transform.rotation]);

  if (!tooth.visible) return null;

  return (
    <group position={position} rotation={rotation}>
      <mesh
        ref={meshRef}
        geometry={tooth.geometry}
        material={material}
        castShadow
        receiveShadow
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      />
    </group>
  );
}
