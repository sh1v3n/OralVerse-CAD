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
 *   - Stage animation: smooth lerp/slerp towards staged treatment plan transforms
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useToothObjectStore, type ToothObject } from "@/lib/toothObjectStore";
import { useTreatmentStore } from "@/lib/store";
import { useTreatmentPlanStore } from "@/lib/treatmentPlanStore";

interface ToothMeshProps {
  tooth: ToothObject;
  opacity?: number;
  wireframe?: boolean;
  clipPlane?: THREE.Plane | null;
  mode?: "normal" | "segmentation";
}

// ─── Reusable temporaries (avoid allocation per frame) ────────────────────────

const _targetPos = new THREE.Vector3();
const _targetEuler = new THREE.Euler();
const _targetQuat = new THREE.Quaternion();

export function ToothMesh({
  tooth,
  opacity = 1,
  wireframe = false,
  clipPlane = null,
  mode = "normal",
}: ToothMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  // Store state — selections
  const selectedFdis = useToothObjectStore((s) => s.selectedFdis);
  const hoveredFdi = useToothObjectStore((s) => s.hoveredFdi);
  const setHoveredTooth = useToothObjectStore((s) => s.setHoveredTooth);
  const toggleTooth = useToothObjectStore((s) => s.toggleTooth);
  const selectTooth = useToothObjectStore((s) => s.selectTooth);
  const selectInTreatment = useTreatmentStore((s) => s.selectTooth);

  // Treatment plan state
  const planStatus = useTreatmentPlanStore((s) => s.status);
  const currentStage = useTreatmentPlanStore((s) => s.currentStage);
  const getStageTransform = useTreatmentPlanStore((s) => s.getStageTransform);

  const isSelected = selectedFdis.has(tooth.fdi);
  const isHovered = hoveredFdi === tooth.fdi;
  const hasPlan = planStatus === "ready";

  // Determine the display color
  const displayColor = useMemo(() => {
    if (mode === "segmentation") {
      return tooth.segmentation.color;
    }
    if (isSelected) return "#8b9dc3"; // soft indigo-blue for selected
    return "#c8a87a"; // bone/tan default
  }, [mode, isSelected, tooth.segmentation.color]);

  // Material — one instance per tooth, all dynamic props mutated in useEffect
  const material = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(displayColor),
      roughness: mode === "segmentation" ? 0.55 : 0.72,
      metalness: 0.0,
      clearcoat: 0.0,
      envMapIntensity: 0.0,
      transparent: false,
      opacity: 1,
      side: THREE.FrontSide,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mutate dynamic properties without recreating material
  useEffect(() => {
    if (!material) return;
    material.color.set(displayColor);
    material.roughness = mode === "segmentation" ? 0.55 : 0.72;
    material.transparent = opacity < 1;
    material.opacity = opacity;
    material.wireframe = wireframe;

    // Hover / selection highlight
    if (isSelected) {
      // In segmentation mode: bright white-tinted emissive ring so it pops against the tooth color
      // In normal mode: the color itself changes to indigo so emissive can be subtle
      material.emissive.set(mode === "segmentation" ? "#ffffff" : "#4a5fa8");
      material.emissiveIntensity = mode === "segmentation" ? 0.35 : 0.22;
    } else if (isHovered) {
      material.emissive.set("#b08850");
      material.emissiveIntensity = 0.25;
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
  }, [material, displayColor, mode, opacity, wireframe, isHovered, isSelected, clipPlane]);

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

  // ── Compute target position/rotation ────────────────────────────────────

  // Manual transform (Initial Position mode, or when no plan exists)
  const manualPosition = useMemo<[number, number, number]>(() => {
    const t = tooth.transform;
    return [
      t.translation[0],
      t.translation[1] + t.intrusion,
      t.translation[2],
    ];
  }, [tooth.transform]);

  const manualRotation = useMemo<[number, number, number]>(() => {
    const r = tooth.transform.rotation;
    return [
      THREE.MathUtils.degToRad(r[0]),
      THREE.MathUtils.degToRad(r[1]),
      THREE.MathUtils.degToRad(r[2]),
    ];
  }, [tooth.transform.rotation]);

  // ── Frame-based smooth animation ─────────────────────────────────────────

  // Flag to check if we just loaded or changed the manual position drastically
  const isFirstRender = useRef(true);

  // Monitor for manual transform changes so we can snap instantly when sliding
  // rather than lagging behind the slider.
  useEffect(() => {
    isFirstRender.current = true;
  }, [manualPosition, manualRotation]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Determine target transform
    if (hasPlan && currentStage > 0) {
      // Stage-based: read from treatment plan
      const stageTransform = getStageTransform(tooth.fdi);
      if (stageTransform) {
        // Stage transforms are in absolute world coordinates
        // We need to compute the offset from the tooth's original centroid
        _targetPos.set(
          stageTransform.position[0] - tooth.centroid.x,
          stageTransform.position[1] - tooth.centroid.y,
          stageTransform.position[2] - tooth.centroid.z,
        );
        _targetEuler.set(
          THREE.MathUtils.degToRad(stageTransform.rotation[0]),
          THREE.MathUtils.degToRad(stageTransform.rotation[1]),
          THREE.MathUtils.degToRad(stageTransform.rotation[2]),
        );
        _targetQuat.setFromEuler(_targetEuler);
      } else {
        // Tooth not in plan — stay at manual position
        _targetPos.set(...manualPosition);
        _targetEuler.set(...manualRotation);
        _targetQuat.setFromEuler(_targetEuler);
      }
    } else {
      // No plan or stage 0 — use manual transform
      _targetPos.set(...manualPosition);
      _targetEuler.set(...manualRotation);
      _targetQuat.setFromEuler(_targetEuler);
    }

    if (isFirstRender.current) {
      // Snap instantly on first render or when sliders are used (Stage 0)
      groupRef.current.position.copy(_targetPos);
      groupRef.current.quaternion.copy(_targetQuat);
      isFirstRender.current = false;
    } else {
      // Smooth exponential-decay interpolation (framerate-independent)
      // Factor approaches 1 quickly but never overshoots
      const lerpFactor = 1 - Math.pow(0.00001, delta);
      groupRef.current.position.lerp(_targetPos, lerpFactor);
      groupRef.current.quaternion.slerp(_targetQuat, lerpFactor);
    }
  });

  if (!tooth.visible) return null;

  // Compute label position: slightly above the bounding box top
  // Bounding box coords are in local mesh space (which corresponds to world space originally)
  // Since the mesh is translated by the group, Html inherits that translation.
  // We place the HTML at the tooth's centroid X and Z, but higher in Y.
  const labelYOffset = (tooth.boundingBox.max.y - tooth.centroid.y) + 1.2;

  return (
    // We intentionally omit `position` and `rotation` props here so that React does not 
    // repeatedly overwrite the group's transform during state changes (e.g. currentStage updates).
    // The `useFrame` hook exclusively manages the transform for smooth, uninterrupted animation.
    <group ref={groupRef}>
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
      {mode === "segmentation" && (
        <Html position={[tooth.centroid.x, tooth.centroid.y + labelYOffset, tooth.centroid.z]} center zIndexRange={[100, 0]}>
          <div className="flex flex-col items-center pointer-events-none transform -translate-y-full pb-1">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white shadow-sm ring-1 ring-white/50">
              {tooth.fdi}
            </div>
            <div className="w-px h-6 bg-gradient-to-b from-indigo-400 to-transparent opacity-60" />
          </div>
        </Html>
      )}
    </group>
  );
}
