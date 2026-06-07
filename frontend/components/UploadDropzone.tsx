"use client";
import { useRef, useState } from "react";
import { getScan, startAnalyze, uploadImage } from "@/lib/api";
import { useScanStore } from "@/lib/store";

function friendlyError(raw: string): string {
  if (raw === "models_unavailable") {
    return "The AI models aren't installed on the backend yet — ask the admin to run the training step.";
  }
  if (raw.startsWith("error:")) {
    return "Something went wrong while analyzing the scan. Try uploading again.";
  }
  if (raw === "timeout waiting for analysis") {
    return "Analysis is taking longer than expected. Try again in a moment.";
  }
  return raw;
}

export function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const { setScan, setStatus, status, error } = useScanStore();

  async function handleFile(file: File) {
    try {
      setStatus("uploading");
      const { image_id } = await uploadImage(file);
      setStatus("analyzing");
      await startAnalyze(image_id);
      // poll until analyzed or failed
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const scan = await getScan(image_id);
        if (scan.status === "analyzed") {
          setScan(scan);
          setStatus("ready");
          return;
        }
        if (scan.status.startsWith("error") || scan.status === "models_unavailable") {
          setStatus("error", scan.status);
          return;
        }
      }
      setStatus("error", "timeout waiting for analysis");
    } catch (e) {
      setStatus("error", (e as Error).message);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) void handleFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${
        drag ? "border-accent bg-panel" : "border-gray-700 hover:border-gray-500"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <p className="text-sm text-gray-300">
        {status === "idle" && "Drop a panoramic OPG X-ray here, or click to upload"}
        {status === "uploading" && "Uploading…"}
        {status === "analyzing" && "Analyzing — detect → segment → classify"}
        {status === "ready" && "Scan ready. Click any tooth on the right."}
        {status === "error" && (
          <span className="text-severity-red">
            {friendlyError(error ?? "error")}
          </span>
        )}
      </p>
    </div>
  );
}
