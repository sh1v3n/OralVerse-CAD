"use client";
import type { Severity, ToothLayout } from "@/lib/teeth";
import { SEVERITY_COLOR, ENAMEL_COLOR } from "@/lib/teeth";
import { AnatomicalTooth } from "./AnatomicalTooth";

interface Props {
  layout: ToothLayout;
  severity: Severity;
  selected: boolean;
  onSelect: (fdi: number) => void;
}

export function Tooth({ layout, severity, selected, onSelect }: Props) {
  const isHealthy = severity === "green";
  const color = isHealthy ? ENAMEL_COLOR : SEVERITY_COLOR[severity];
  const emissiveColor = selected ? (isHealthy ? "#66ccff" : color) : "#000000";

  return (
    <group position={layout.position} rotation={layout.rotation}>
      <AnatomicalTooth
        fdi={layout.fdi}
        color={color}
        emissive={emissiveColor}
        emissiveIntensity={selected ? 0.6 : 0}
        onSelect={onSelect}
      />
    </group>
  );
}
