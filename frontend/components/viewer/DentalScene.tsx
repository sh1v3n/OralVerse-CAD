"use client";

import { useMemo } from "react";
import { Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { makeArchCurve, LOWER_Y, UPPER_Y } from "@/lib/teeth";

export function DentalLighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <hemisphereLight args={["#ffffff", "#e0e5ec", 0.6]} />
      {/* Key light */}
      <directionalLight
        position={[4, 6, 4]}
        intensity={2.0}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      {/* Fill light */}
      <directionalLight position={[-4, 4, -4]} intensity={1.2} color="#e6f2ff" />
      {/* Back rim light */}
      <pointLight position={[0, -1, -6]} intensity={15} distance={20} color="#f0f5ff" />
    </>
  );
}

export function Gingiva({ opacity = 1 }: { opacity?: number }) {
  return (
    <group>
      <GumArch y={UPPER_Y + 0.35} isUpper={true} />
      <GumArch y={LOWER_Y - 0.35} isUpper={false} />
      
      {/* Upper Palate */}
      <mesh position={[0, UPPER_Y + 0.6, -1.5]} scale={[2.8, 0.4, 3.5]}>
        <sphereGeometry args={[1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#d97c8e"
          roughness={0.4}
          clearcoat={0.3}
          side={THREE.DoubleSide}
          transparent
          opacity={opacity}
        />
      </mesh>
      
      {/* Lower Jaw Floor */}
      <mesh
        position={[0, LOWER_Y - 0.6, -1.5]}
        rotation={[Math.PI, 0, 0]}
        scale={[2.8, 0.4, 3.5]}
      >
        <sphereGeometry args={[1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#d97c8e"
          roughness={0.4}
          clearcoat={0.3}
          side={THREE.DoubleSide}
          transparent
          opacity={opacity}
        />
      </mesh>
    </group>
  );
}

function GumArch({ y, isUpper }: { y: number; isUpper: boolean }) {
  const curve = useMemo(() => makeArchCurve(y, isUpper), [y, isUpper]);
  return (
    <mesh castShadow receiveShadow>
      <tubeGeometry args={[curve, 128, 0.45, 32, false]} />
      <meshPhysicalMaterial
        color="#d97c8e"
        roughness={0.4}
        clearcoat={0.3}
        clearcoatRoughness={0.2}
      />
    </mesh>
  );
}

export function ViewerEnvironment() {
  return (
    <>
      <Grid
        args={[18, 18]}
        position={[0, -1.68, 0]}
        cellColor="#cbd5e1"
        sectionColor="#94a3b8"
        fadeDistance={13}
        fadeStrength={1.4}
      />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.075}
        minDistance={4.2}
        maxDistance={12}
        minPolarAngle={0.18}
        maxPolarAngle={Math.PI - 0.18}
        target={[0, 0, -0.45]}
      />
    </>
  );
}

export function AlignerOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <group>
      {[UPPER_Y - 0.12, LOWER_Y + 0.12].map((y, index) => {
        const isUpper = index === 0;
        const curve = makeArchCurve(y, isUpper);
        return (
          <mesh key={y} renderOrder={2}>
            <tubeGeometry args={[curve, 128, 0.36, 16, false]} />
            <meshPhysicalMaterial
              color="#d9fbff"
              roughness={0.08}
              metalness={0}
              transmission={0.82}
              thickness={0.08}
              transparent
              opacity={0.14}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
