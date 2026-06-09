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
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-400/15 text-sm text-violet-300">AI</span>
        <div>
          <p className="text-sm font-semibold">Orthodontic copilot</p>
          <p className="text-[10px] uppercase tracking-wider text-emerald-400">Plan grounded</p>
        </div>
      </div>
      <div className="min-h-[84px] rounded-xl border border-white/5 bg-black/20 p-3 text-xs leading-relaxed text-slate-300">
        {loading ? "Reviewing treatment plan…" : answer}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => void submit(undefined, prompt)}
            className="rounded-full border border-white/10 px-2.5 py-1.5 text-[10px] text-slate-400 hover:border-violet-300/30 hover:text-violet-200"
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
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs outline-none placeholder:text-slate-600 focus:border-violet-300/40"
        />
        <button
          disabled={!plan || loading}
          className="rounded-xl bg-violet-400 px-3 text-xs font-semibold text-[#10091a] disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
