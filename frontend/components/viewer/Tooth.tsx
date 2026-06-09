"use client";
import type { Severity, ToothLayout } from "@/lib/teeth";
import { SEVERITY_COLOR } from "@/lib/teeth";
import { AnatomicalTooth } from "./AnatomicalTooth";

interface Props {
  layout: ToothLayout;
  severity: Severity;
  selected: boolean;
  onSelect: (fdi: number) => void;
}

export function Tooth({ layout, severity, selected, onSelect }: Props) {
  const color = SEVERITY_COLOR[severity];

  return (
    <group position={layout.position}>
      <AnatomicalTooth
        fdi={layout.fdi}
        color={color}
        emissive={selected ? color : "#000000"}
        emissiveIntensity={selected ? 0.42 : 0}
        onSelect={onSelect}
      />
    </group>
  );
}
