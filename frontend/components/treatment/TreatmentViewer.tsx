"use client";

/**
 * TreatmentViewer (STL-first)
 *
 * Renders the 3D canvas when STL scans are loaded.
 * When no scans are loaded, shows a clean "Load a scan to begin" empty state.
 * All placeholder anatomical tooth geometry has been removed.
 */

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useTreatmentStore } from "@/lib/store";
import { useSTLScanStore } from "@/lib/scanStore";
import type { CameraView } from "@/lib/store";
import { STLDentalScene } from "@/components/viewer/STLDentalScene";
import { STLViewerControls } from "@/components/viewer/STLViewerControls";

// ─── Empty state ───────────────────────────────────────────────────────────────

function ScanNotLoadedOverlay() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#f0eeeb]">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70 shadow-sm border border-stone-200">
          <svg className="h-7 w-7 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-stone-600">No scan loaded</p>
        <p className="text-xs text-stone-400 mt-1">Select a dataset case from the sidebar</p>
      </div>
    </div>
  );
}

// ─── Camera controller ─────────────────────────────────────────────────────────

const CAMERA_POSITIONS: Record<CameraView, [number, number, number]> = {
  both:       [0,  5.0,  9.0],
  labial:     [0,  1.5,  10.0],
  lingual:    [0,  1.5, -3.0], // Positioned inside the arch looking outward
  maxillary:  [0, 12.0,  0.5],
  mandibular: [0,-12.0,  0.5],
  right:      [-10, 2.0, 2.0],
  left:       [ 10, 2.0, 2.0],
  overjet:    [0,  4.5,  8.0],
};

function CameraController({ view }: { view: CameraView }) {
  const { camera } = useThree();
  const targetVec = useMemo(() => new THREE.Vector3(...CAMERA_POSITIONS[view]), [view]);

  useFrame(() => {
    camera.position.lerp(targetVec, 0.06);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ─── Loading fallback ──────────────────────────────────────────────────────────

function SceneLoading() {
  return (
    <Html center>
      <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-white/95 px-4 py-2 text-[11px] font-medium text-stone-600 shadow-md whitespace-nowrap">
        <span className="h-2 w-2 rounded-full bg-clay animate-pulse" />
        Loading scan…
      </div>
    </Html>
  );
}

// ─── Main Viewer ───────────────────────────────────────────────────────────────

export function TreatmentViewer() {
  const { cameraView } = useTreatmentStore();
  const stlUpper = useSTLScanStore((s) => s.upperArch);
  const stlLower = useSTLScanStore((s) => s.lowerArch);
  const loadingStatus = useSTLScanStore((s) => s.loadingStatus);
  const hasSTL = stlUpper !== null || stlLower !== null;
  const isLoading = loadingStatus === "loading" || loadingStatus === "fetching_manifest";

  // If no scans and not loading, show empty state
  if (!hasSTL && !isLoading) {
    return <ScanNotLoadedOverlay />;
  }

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden bg-[#f0eeeb]">
      {/* Loading overlay — covers the canvas while STL is parsing */}
      {isLoading && !hasSTL && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#f0eeeb]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-stone-300 border-t-stone-700 animate-spin" />
            <p className="text-xs text-stone-500 font-medium">Parsing STL scan…</p>
          </div>
        </div>
      )}

      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 12, 0.5], fov: 35, near: 0.1, far: 100 }}
        gl={{
          antialias: true,
          toneMapping: THREE.LinearToneMapping,
          toneMappingExposure: 1.0,
        }}
      >
        <color attach="background" args={["#f0eeeb"]} />

        <Suspense fallback={<SceneLoading />}>
          <CameraController view={cameraView} />
          <STLDentalScene />
        </Suspense>
      </Canvas>

      {/* Viewer overlay controls */}
      <STLViewerControls />
    </div>
  );
}
