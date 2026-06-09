"use client";
import { useRef, useState } from "react";
import { getScan, startAnalyze, uploadImage } from "@/lib/api";
import { useScanStore } from "@/lib/store";

// Cold-start of the YOLO + EfficientNet + SAM 2 stack on CPU can take a few
// minutes for a full panoramic OPG. Poll for up to ANALYZE_TIMEOUT_MS before
// giving up.
const ANALYZE_TIMEOUT_MS = 5 * 60 * 1000;
const ANALYZE_POLL_MS = 2000;

function friendlyError(raw: string): string {
  if (raw === "models_unavailable") {
    return "The AI models aren't installed on the backend yet — ask the admin to run the training step.";
  }
  if (raw.startsWith("error:")) {
    return "Something went wrong while analyzing the scan. Try uploading again.";
  }
  if (raw === "timeout waiting for analysis") {
    return "Analysis is still running on the backend but is taking longer than expected. Check the backend logs, or refresh the page in a minute to see the result.";
  }
  return raw;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

export function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const { setScan, setStatus, status, error } = useScanStore();

  async function handleFile(file: File) {
    try {
      setStatus("uploading");
      setElapsedMs(0);
      const { image_id } = await uploadImage(file);
      setStatus("analyzing");
      await startAnalyze(image_id);
      const startedAt = Date.now();
      while (Date.now() - startedAt < ANALYZE_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, ANALYZE_POLL_MS));
        setElapsedMs(Date.now() - startedAt);
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

  function analyzingMessage(): string {
    const elapsed = formatElapsed(elapsedMs);
    if (elapsedMs < 30_000) {
      return `Analyzing — detect → segment → classify (${elapsed})`;
    }
    if (elapsedMs < 90_000) {
      return `Still analyzing — first run loads the AI models, this can take a minute or two (${elapsed})`;
    }
    return `Still analyzing — cold-start inference on CPU is slow but it's still working (${elapsed})`;
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
        {status === "analyzing" && analyzingMessage()}
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
