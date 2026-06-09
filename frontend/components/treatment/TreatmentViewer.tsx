"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useTreatmentStore } from "@/lib/store";
import { TOOTH_LAYOUT } from "@/lib/teeth";
import type { ToothMovementDto, ToothPoseDto } from "@/lib/api";

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

  if (!plan) {
    return <ViewerLoading />;
  }

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden rounded-[28px] border border-white/10 bg-[#080d14]">
      <Canvas shadows camera={{ position: [0, 4.2, 7.2], fov: 40 }}>
        <color attach="background" args={["#080d14"]} />
        <fog attach="fog" args={["#080d14", 8, 17]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 7, 4]} intensity={2.2} castShadow color="#dff9ff" />
        <directionalLight position={[-5, 2, -3]} intensity={1.1} color="#9e8cff" />
        <group rotation={[-0.08, 0, 0]}>
          {TOOTH_LAYOUT.map((layout) => {
            const base = poseMap.get(layout.fdi);
            const movement = movementMap.get(layout.fdi);
            return (
              <AnimatedTreatmentTooth
                key={layout.fdi}
                fdi={layout.fdi}
                scale={layout.scale}
                fallbackPosition={layout.position}
                fallbackRotation={layout.rotationY}
                base={base}
                movement={movement}
                progress={getProgress(plan.stages.length, stage, compareMode)}
                active={activeTeeth.has(layout.fdi)}
                selected={selectedFdi === layout.fdi}
                highlighted={highlightedTeeth.includes(layout.fdi)}
                onSelect={selectTooth}
              />
            );
          })}
        </group>
        <Grid
          args={[18, 18]}
          position={[0, -1.48, 0]}
          cellColor="#152131"
          sectionColor="#24384d"
          fadeDistance={13}
        />
        <OrbitControls makeDefault enableDamping minDistance={4} maxDistance={12} />
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
  scale,
  fallbackPosition,
  fallbackRotation,
  base,
  movement,
  progress,
  active,
  selected,
  highlighted,
  onSelect,
}: {
  fdi: number;
  scale: [number, number, number];
  fallbackPosition: [number, number, number];
  fallbackRotation: number;
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
  const startRotation = THREE.MathUtils.degToRad(base?.rotation_deg ?? 0) + fallbackRotation;
  const targetRotation =
    THREE.MathUtils.degToRad(movement?.target.rotation_deg ?? base?.rotation_deg ?? 0)
    + fallbackRotation;
  const desired = useMemo(
    () => new THREE.Vector3(
      THREE.MathUtils.lerp(start[0], target[0], progress),
      THREE.MathUtils.lerp(start[1], target[1], progress),
      THREE.MathUtils.lerp(start[2], target[2], progress),
    ),
    [progress, start, target],
  );

  useFrame((_, delta) => {
    if (!group.current) return;
    const alpha = 1 - Math.exp(-delta * 7);
    group.current.position.lerp(desired, alpha);
    group.current.rotation.y = THREE.MathUtils.lerp(
      group.current.rotation.y,
      THREE.MathUtils.lerp(startRotation, targetRotation, progress),
      alpha,
    );
  });

  const color = selected ? SELECTED : highlighted ? HIGHLIGHTED : active ? ACTIVE : ENAMEL;
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(fdi);
  };

  return (
    <group ref={group} position={start} rotation={[0, startRotation, 0]}>
      <mesh
        scale={scale}
        onClick={handleClick}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "auto"; }}
        castShadow
        receiveShadow
      >
        <capsuleGeometry args={[0.5, 0.6, 5, 16]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active || selected || highlighted ? 0.18 : 0.02}
          roughness={0.28}
          clearcoat={0.55}
        />
      </mesh>
      {movement?.attachment && (
        <mesh position={[0, 0, 0.38]} scale={[0.17, 0.28, 0.08]}>
          <boxGeometry />
          <meshStandardMaterial color={active ? "#22d3ee" : "#b8c4ce"} />
        </mesh>
      )}
    </group>
  );
}

function getProgress(totalStages: number, stage: number, mode: "planned" | "before" | "after") {
  if (mode === "before") return 0;
  if (mode === "after") return 1;
  return Math.min(1, stage / Math.max(1, totalStages - 2));
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
