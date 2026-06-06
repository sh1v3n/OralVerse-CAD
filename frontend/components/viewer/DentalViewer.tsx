"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { Tooth } from "./Tooth";
import { TOOTH_LAYOUT, type Severity } from "@/lib/teeth";
import { useScanStore } from "@/lib/store";

export function DentalViewer() {
  const { scan, selectedFdi, selectTooth } = useScanStore();

  const severityByFdi = new Map<number, Severity>();
  scan?.teeth.forEach((t) => severityByFdi.set(t.fdi, t.severity as Severity));

  return (
    <div className="w-full h-full bg-bg rounded-2xl overflow-hidden">
      <Canvas shadows camera={{ position: [0, 3.5, 6], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1.1} castShadow />
        <directionalLight position={[-4, 4, -3]} intensity={0.45} />

        {TOOTH_LAYOUT.map((layout) => (
          <Tooth
            key={layout.fdi}
            layout={layout}
            severity={severityByFdi.get(layout.fdi) ?? "green"}
            selected={selectedFdi === layout.fdi}
            onSelect={selectTooth}
          />
        ))}

        <Grid
          args={[20, 20]}
          position={[0, -1.4, 0]}
          cellColor="#1f2937"
          sectionColor="#374151"
          fadeDistance={18}
        />
        <OrbitControls makeDefault enableDamping minDistance={3} maxDistance={14} />
      </Canvas>
    </div>
  );
}
