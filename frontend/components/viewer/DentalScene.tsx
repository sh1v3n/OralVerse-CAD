"use client";

import { Grid, OrbitControls } from "@react-three/drei";
import { makeArchCurve, LOWER_Y, UPPER_Y } from "@/lib/teeth";

export function DentalLighting() {
  return (
    <>
      <ambientLight intensity={0.32} />
      <hemisphereLight args={["#dff7ff", "#25181b", 0.72]} />
      <directionalLight
        position={[4.5, 7, 5]}
        intensity={2.8}
        color="#fff8ec"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-5, 3, 1]} intensity={1.25} color="#9adfff" />
      <pointLight position={[0, 1, -5]} intensity={18} distance={12} color="#c7b8ff" />
    </>
  );
}

export function Gingiva({ opacity = 0.9 }: { opacity?: number }) {
  return (
    <group>
      <GumArch y={UPPER_Y + 0.28} />
      <GumArch y={LOWER_Y - 0.28} />
      <mesh position={[0, UPPER_Y + 0.63, -0.5]} scale={[3.1, 0.13, 2.45]}>
        <sphereGeometry args={[1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#8f394f"
          roughness={0.52}
          clearcoat={0.16}
          transparent
          opacity={opacity * 0.34}
          side={2}
        />
      </mesh>
      <mesh
        position={[0, LOWER_Y - 0.63, -0.5]}
        rotation={[Math.PI, 0, 0]}
        scale={[3.1, 0.13, 2.45]}
      >
        <sphereGeometry args={[1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#8f394f"
          roughness={0.52}
          clearcoat={0.16}
          transparent
          opacity={opacity * 0.34}
          side={2}
        />
      </mesh>
    </group>
  );
}

function GumArch({ y }: { y: number }) {
  return (
    <mesh castShadow receiveShadow>
      <tubeGeometry args={[makeArchCurve(y), 96, 0.29, 16, false]} />
      <meshPhysicalMaterial
        color="#a84b61"
        roughness={0.46}
        clearcoat={0.22}
        clearcoatRoughness={0.38}
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
        cellColor="#142130"
        sectionColor="#294057"
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
      {[UPPER_Y - 0.12, LOWER_Y + 0.12].map((y) => (
        <mesh key={y} renderOrder={2}>
          <tubeGeometry args={[makeArchCurve(y), 96, 0.36, 14, false]} />
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
      ))}
    </group>
  );
}
