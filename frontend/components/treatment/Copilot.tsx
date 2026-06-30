"use client";

import { FormEvent, useState } from "react";
import { askOrthodonticCopilot } from "@/lib/api";
import { useTreatmentStore } from "@/lib/store";

const PROMPTS = [
  "What changes occur in aligner 12?",
  "Which teeth have the highest movement?",
  "Suggest attachment placement",
  "Predict refinement probability",
];

export function Copilot() {
  const { plan, setHighlightedTeeth } = useTreatmentStore();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(
    "Ask about a stage, movement load, attachments, IPR, duration, or refinement risk.",
  );
  const [loading, setLoading] = useState(false);

  async function submit(event?: FormEvent, prompt?: string) {
    event?.preventDefault();
    const query = prompt ?? question;
    if (!plan || !query.trim()) return;
    setLoading(true);
    try {
      const response = await askOrthodonticCopilot(query, plan);
      setAnswer(response.answer);
      setHighlightedTeeth(response.highlight_teeth);
      setQuestion("");
    } catch {
      setAnswer("The copilot service is unavailable. The treatment plan remains accessible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ortho-panel overflow-hidden">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-clay-soft text-sm text-clay-dark">AI</span>
        <div>
          <p className="text-sm font-semibold text-ink">Orthodontic copilot</p>
          <p className="text-[10px] uppercase tracking-wider text-emerald-600">Plan grounded</p>
        </div>
      </div>
      <div className="min-h-[84px] rounded-xl border border-line bg-cream-200 p-3 text-xs leading-relaxed text-ink-70">
        {loading ? "Reviewing treatment plan…" : answer}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => void submit(undefined, prompt)}
            className="rounded-full border border-line px-2.5 py-1.5 text-[10px] text-ink-40 hover:border-clay/40 hover:text-clay-dark"
          >
            {prompt}
          </button>
        ))}
      </div>
      <form onSubmit={(event) => void submit(event)} className="mt-3 flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask the treatment plan…"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-xs text-ink outline-none placeholder:text-ink-40 focus:border-clay"
        />
        <button
          disabled={!plan || loading}
          className="rounded-xl bg-ink px-3 text-xs font-semibold text-cream-100 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
