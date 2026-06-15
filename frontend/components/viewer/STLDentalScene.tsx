"use client";

/**
 * Professional STL Dental Scene
 *
 * Clinical-grade rendering: warm off-white background, balanced three-point lighting,
 * no grid, no material presets, no HDR environment injection.
 * Automatic camera LOD tracking for smooth orbit.
 */

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";
import { useSTLScanStore } from "@/lib/scanStore";
import { useToothObjectStore } from "@/lib/toothObjectStore";
import { STLMesh } from "./STLMesh";
import { ToothMesh } from "./ToothMesh";
import { GingivaMesh } from "./GingivaMesh";

export function STLDentalScene() {
  const {
    upperArch,
    lowerArch,
    showUpper,
    showLower,
    meshOpacity,
    wireframe,
    clipPlaneEnabled,
    clipPlanePosition,
    shadowsEnabled,
    isInteracting,
    setIsInteracting,
    segmented,
  } = useSTLScanStore();

  const {
    teeth,
    gingivaUpper,
    gingivaLower,
    showSegmentationColors,
  } = useToothObjectStore();

  const { gl, camera } = useThree();
  gl.localClippingEnabled = clipPlaneEnabled;

  // ─── Camera LOD tracker ────────────────────────────────────────────────────
  const lastCamPos = useRef(new THREE.Vector3());
  const lastCamRot = useRef(new THREE.Euler());
  const lastMoveTime = useRef(0);

  useFrame(() => {
    const posChanged = camera.position.distanceToSquared(lastCamPos.current) > 0.00001;
    const rotChanged =
      Math.abs(camera.rotation.x - lastCamRot.current.x) > 0.001 ||
      Math.abs(camera.rotation.y - lastCamRot.current.y) > 0.001;

    const now = performance.now();
    if (posChanged || rotChanged) {
      lastMoveTime.current = now;
      setIsInteracting(true);
      lastCamPos.current.copy(camera.position);
      lastCamRot.current.copy(camera.rotation);
    } else if (isInteracting && now - lastMoveTime.current > 120) {
      setIsInteracting(false);
    }
  });

  // ─── Clipping plane ────────────────────────────────────────────────────────
  const clipPlane = useMemo(() => {
    if (!clipPlaneEnabled) return null;
    return new THREE.Plane(new THREE.Vector3(0, -1, 0), clipPlanePosition * 3);
  }, [clipPlaneEnabled, clipPlanePosition]);

  const castShadows = shadowsEnabled && !isInteracting;

  return (
    <>
      {/* Clinical three-point lighting — tuned for tan/bone-colored casts */}
      <ambientLight intensity={0.65} color="#fff9f2" />
      <hemisphereLight args={["#fff8f0", "#e0d8cc", 0.4]} />

      {/* Key light — warm top-front-right */}
      <directionalLight
        position={[4, 9, 6]}
        intensity={1.8}
        color="#fff5e8"
        castShadow={castShadows}
        shadow-mapSize={castShadows ? [1024, 1024] : [256, 256]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.015}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />

      {/* Fill light — neutral left */}
      <directionalLight
        position={[-6, 5, -3]}
        intensity={0.9}
        color="#ece8e0"
      />

      {/* Soft rim light — behind-below */}
      <pointLight
        position={[0, -3, -7]}
        intensity={12}
        distance={22}
        color="#f0ece4"
      />

      {/* Subtle top fill for occlusal surfaces */}
      <directionalLight
        position={[0, 12, 0]}
        intensity={0.5}
        color="#ffffff"
      />

      {/* Ground shadow plane */}
      {castShadows && (
        <mesh position={[0, -3.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[30, 30]} />
          <shadowMaterial opacity={0.08} />
        </mesh>
      )}

      {/* Meshes */}
      <group>
        {segmented ? (
          <>
            {/* Segmented Mode: Individual Teeth + Gingiva */}
            {teeth.map((tooth) => (
              <ToothMesh
                key={tooth.id}
                tooth={tooth}
                opacity={meshOpacity}
                wireframe={wireframe}
                clipPlane={clipPlane}
                mode={showSegmentationColors ? "segmentation" : "normal"}
              />
            ))}
            {gingivaUpper && showUpper && (
              <GingivaMesh
                geometry={gingivaUpper}
                opacity={meshOpacity}
                wireframe={wireframe}
                clipPlane={clipPlane}
              />
            )}
            {gingivaLower && showLower && (
              <GingivaMesh
                geometry={gingivaLower}
                opacity={meshOpacity}
                wireframe={wireframe}
                clipPlane={clipPlane}
              />
            )}
          </>
        ) : (
          <>
            {/* Monolithic Mode: Full Arch STLs */}
            {upperArch && (
              <STLMesh
                geometry={upperArch}
                materialPreset="bone"
                opacity={meshOpacity}
                wireframe={wireframe}
                clipPlane={clipPlane}
                visible={showUpper}
              />
            )}
            {lowerArch && (
              <STLMesh
                geometry={lowerArch}
                materialPreset="bone"
                opacity={meshOpacity}
                wireframe={wireframe}
                clipPlane={clipPlane}
                visible={showLower}
              />
            )}
          </>
        )}
      </group>

      {/* Professional orbit controls — clean limits */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.07}
        minDistance={4}
        maxDistance={14}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI - 0.1}
        target={[0, 0, 0]}
        enablePan={true}
        panSpeed={0.6}
        rotateSpeed={0.7}
        zoomSpeed={0.8}
      />
    </>
  );
}
