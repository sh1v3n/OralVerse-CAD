"use client";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { Tooth } from "./Tooth";
import { TOOTH_LAYOUT, type Severity } from "@/lib/teeth";
import { useScanStore } from "@/lib/store";

export function DentalViewer() {
  const { scan, selectedFdi, selectTooth, status } = useScanStore();

  // Teeth that the AI explicitly flagged keep their severity color; any tooth
  // the AI didn't detect is assumed healthy (the OPG detector only labels a
  // few teeth per image — undetected does NOT mean missing).
  const severityByFdi = new Map<number, Severity>();
  scan?.teeth.forEach((t) => severityByFdi.set(t.fdi, t.severity as Severity));

  const flaggedCount = scan?.teeth.length ?? 0;
  const scanReady = scan != null;
  const allHealthy = scanReady && flaggedCount === 0;

  return (
    <div className="w-full h-full bg-bg rounded-2xl overflow-hidden relative">
      <Canvas shadows camera={{ position: [0, 3.5, 6], fov: 45 }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <directionalLight position={[-4, 4, -3]} intensity={0.5} />
        <hemisphereLight args={["#ffffff", "#1f2937", 0.35]} />

        {TOOTH_LAYOUT.map((layout) => {
          const severity: Severity = severityByFdi.get(layout.fdi) ?? "green";
          return (
            <Tooth
              key={layout.fdi}
              layout={layout}
              severity={severity}
              selected={selectedFdi === layout.fdi}
              onSelect={selectTooth}
            />
          );
        })}

        <Grid
          args={[20, 20]}
          position={[0, -1.4, 0]}
          cellColor="#1f2937"
          sectionColor="#374151"
          fadeDistance={18}
        />
        <OrbitControls makeDefault enableDamping minDistance={3} maxDistance={14} />
      </Canvas>

      <ViewerBanner status={status} scanReady={scanReady} allHealthy={allHealthy} />
    </div>
  );
}

function ViewerBanner({
  status,
  scanReady,
  allHealthy,
}: {
  status: "idle" | "uploading" | "analyzing" | "ready" | "error";
  scanReady: boolean;
  allHealthy: boolean;
}) {
  if (status === "analyzing" || status === "uploading") {
    return (
      <div className="absolute top-3 left-3 right-3 sm:right-auto px-3 py-2 rounded-lg bg-panel/90 backdrop-blur text-xs text-gray-200 shadow">
        Analyzing your scan — this usually takes a few seconds.
      </div>
    );
  }
  if (!scanReady) {
    return (
      <div className="absolute top-3 left-3 right-3 sm:right-auto px-3 py-2 rounded-lg bg-panel/90 backdrop-blur text-xs text-gray-300 shadow">
        Showing a sample arch in healthy green. Upload an OPG x-ray to see your own teeth.
      </div>
    );
  }
  if (allHealthy) {
    return (
      <div className="absolute top-3 left-3 right-3 sm:right-auto px-3 py-2 rounded-lg bg-panel/90 backdrop-blur text-xs text-severity-green shadow">
        The AI didn&apos;t flag any teeth — everything looks healthy.
      </div>
    );
  }
  return null;
}
