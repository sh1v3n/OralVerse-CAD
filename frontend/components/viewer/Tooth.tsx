"use client";
import { ThreeEvent } from "@react-three/fiber";
import type { Severity, ToothLayout } from "@/lib/teeth";
import { SEVERITY_COLOR } from "@/lib/teeth";

interface Props {
  layout: ToothLayout;
  severity: Severity;
  selected: boolean;
  onSelect: (fdi: number) => void;
}

export function Tooth({ layout, severity, selected, onSelect }: Props) {
  const color = SEVERITY_COLOR[severity];

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(layout.fdi);
  };

  return (
    <group position={layout.position} rotation={[0, layout.rotationY, 0]}>
      <mesh
        scale={layout.scale}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
        castShadow
        receiveShadow
      >
        <capsuleGeometry args={[0.5, 0.6, 4, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={selected ? color : "#000000"}
          emissiveIntensity={selected ? 0.55 : 0}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}
