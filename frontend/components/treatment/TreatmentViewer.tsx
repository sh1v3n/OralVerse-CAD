"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useTreatmentStore } from "@/lib/store";
import { idealRotation, TOOTH_LAYOUT, toothKind } from "@/lib/teeth";
import { attachmentSize } from "@/lib/toothAssets";
import type { ToothMovementDto, ToothPoseDto } from "@/lib/api";
import { AnatomicalTooth } from "@/components/viewer/AnatomicalTooth";
import {
  AlignerOverlay,
  DentalLighting,
  Gingiva,
  ViewerEnvironment,
} from "@/components/viewer/DentalScene";

const ENAMEL = "#e8e5dc";
const ACTIVE = "#67e8f9";
const SELECTED = "#fbbf24";
const HIGHLIGHTED = "#c084fc";

export function TreatmentViewer() {
  const {
    plan,
    stage,
    compareMode,
    selectedFdi,
    highlightedTeeth,
    selectTooth,
  } = useTreatmentStore();

  const activeTeeth = useMemo(
    () => new Set(plan?.stages[stage - 1]?.movements.map((m) => m.fdi) ?? []),
    [plan, stage],
  );
  const movementMap = useMemo(
    () => new Map(plan?.movements.map((movement) => [movement.fdi, movement]) ?? []),
    [plan],
  );
  const poseMap = useMemo(
    () => new Map(plan?.model.teeth.map((tooth) => [tooth.fdi, tooth]) ?? []),
    [plan],
  );
  const activeStageCount = useMemo(
    () => plan?.stages.filter((item) => item.kind === "active").length ?? 1,
    [plan],
  );

  if (!plan) {
    return <ViewerLoading />;
  }

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden rounded-[28px] border border-white/10 bg-[#080d14]">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [0, 4.4, 7.7], fov: 38 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }}
      >
        <color attach="background" args={["#080d14"]} />
        <fog attach="fog" args={["#080d14", 9, 17]} />
        <DentalLighting />
        <Suspense fallback={<ModelLoading />}>
          <group rotation={[-0.08, 0, 0]}>
            <Gingiva opacity={0.82} />
            <AlignerOverlay visible={compareMode === "planned" && stage > 0} />
            {TOOTH_LAYOUT.map((layout) => {
              const base = poseMap.get(layout.fdi);
              const movement = movementMap.get(layout.fdi);
              return (
                <AnimatedTreatmentTooth
                  key={layout.fdi}
                  fdi={layout.fdi}
                  fallbackPosition={layout.position}
                  base={base}
                  movement={movement}
                  progress={getProgress(activeStageCount, stage, compareMode)}
                  active={activeTeeth.has(layout.fdi)}
                  selected={selectedFdi === layout.fdi}
                  highlighted={highlightedTeeth.includes(layout.fdi)}
                  onSelect={selectTooth}
                />
              );
            })}
          </group>
        </Suspense>
        <ViewerEnvironment />
      </Canvas>

      <div className="pointer-events-none absolute left-5 top-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
          Movement simulation
        </p>
        <p className="mt-1 text-sm text-white">
          {compareMode === "before"
            ? "Initial dentition"
            : compareMode === "after"
              ? "Predicted outcome"
              : stage === 0
                ? "Initial dentition"
                : `Aligner ${stage} of ${plan.stages.length}`}
        </p>
      </div>

      <div className="pointer-events-none absolute bottom-5 left-5 flex gap-4 text-[10px] uppercase tracking-wider text-slate-400">
        <LegendDot color={ACTIVE} label="Active" />
        <LegendDot color={SELECTED} label="Selected" />
        <LegendDot color={HIGHLIGHTED} label="Copilot" />
      </div>
    </div>
  );
}

function AnimatedTreatmentTooth({
  fdi,
  fallbackPosition,
  base,
  movement,
  progress,
  active,
  selected,
  highlighted,
  onSelect,
}: {
  fdi: number;
  fallbackPosition: [number, number, number];
  base?: ToothPoseDto;
  movement?: ToothMovementDto;
  progress: number;
  active: boolean;
  selected: boolean;
  highlighted: boolean;
  onSelect: (fdi: number | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const start = base?.position ?? fallbackPosition;
  const target = movement?.target.position ?? start;
  const anatomicalRotation = idealRotation(fdi);
  const startRotation =
    THREE.MathUtils.degToRad(base?.rotation_deg ?? THREE.MathUtils.radToDeg(anatomicalRotation))
    - anatomicalRotation;
  const targetRotation =
    THREE.MathUtils.degToRad(
      movement?.target.rotation_deg
        ?? base?.rotation_deg
        ?? THREE.MathUtils.radToDeg(anatomicalRotation),
    )
    - anatomicalRotation;
  const desired = useMemo(
    () => new THREE.Vector3(
      THREE.MathUtils.lerp(start[0], target[0], progress),
      THREE.MathUtils.lerp(start[1], target[1], progress),
      THREE.MathUtils.lerp(start[2], target[2], progress),
    ),
    [progress, start, target],
  );
  const desiredQuaternion = useMemo(
    () => new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        0,
        THREE.MathUtils.lerp(startRotation, targetRotation, progress),
        0,
      ),
    ),
    [progress, startRotation, targetRotation],
  );

  useFrame((_, delta) => {
    if (!group.current) return;
    const alpha = 1 - Math.exp(-delta * 8.5);
    group.current.position.lerp(desired, alpha);
    group.current.quaternion.slerp(desiredQuaternion, alpha);
  });

  const color = selected ? SELECTED : highlighted ? HIGHLIGHTED : active ? ACTIVE : ENAMEL;
  const size = attachmentSize(toothKind(fdi));

  return (
    <group ref={group} position={start} rotation={[0, startRotation, 0]}>
      <AnatomicalTooth
        fdi={fdi}
        color={color}
        emissive={color}
        emissiveIntensity={active || selected || highlighted ? 0.16 : 0.01}
        onSelect={onSelect}
      />
      {movement?.attachment && (
        <mesh position={[0, 0, 0.42]} scale={size} castShadow>
          <boxGeometry args={[1, 1, 1, 2, 2, 2]} />
          <meshPhysicalMaterial
            color={active ? "#bffaff" : "#e8e3d6"}
            roughness={0.25}
            clearcoat={0.4}
          />
        </mesh>
      )}
    </group>
  );
}

function getProgress(activeStages: number, stage: number, mode: "planned" | "before" | "after") {
  if (mode === "before") return 0;
  if (mode === "after") return 1;
  return THREE.MathUtils.smoothstep(Math.min(1, stage / Math.max(1, activeStages)), 0, 1);
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function ViewerLoading() {
  return (
    <div className="grid h-full min-h-[520px] place-items-center rounded-[28px] border border-white/10 bg-[#080d14]">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">Building treatment plan</p>
      </div>
    </div>
  );
}

function ModelLoading() {
  return (
    <Html center>
      <div className="whitespace-nowrap rounded-full border border-white/10 bg-[#0d1520]/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200 shadow-2xl">
        Loading anatomical dentition
      </div>
    </Html>
  );
}
