"use client";
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Tooth } from "./Tooth";
import { TOOTH_LAYOUT, type Severity } from "@/lib/teeth";
import { useScanStore } from "@/lib/store";
import { DentalLighting, Gingiva, ViewerEnvironment } from "./DentalScene";

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
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [0, 4.5, 7.8], fov: 38 }}
        gl={{ antialias: true, toneMapping: 4, toneMappingExposure: 1.08 }}
      >
        <color attach="background" args={["#080d14"]} />
        <fog attach="fog" args={["#080d14", 9, 17]} />
        <DentalLighting />
        <Suspense fallback={<ModelLoading />}>
          <group rotation={[-0.08, 0, 0]}>
            <Gingiva />
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
          </group>
        </Suspense>
        <ViewerEnvironment />
      </Canvas>

      <ViewerBanner status={status} scanReady={scanReady} allHealthy={allHealthy} />
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
