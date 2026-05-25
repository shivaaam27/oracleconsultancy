"use client";

import { useState, useRef } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { polishActionItem } from "@/lib/smart-parse";

type Props = {
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
};

export function PolishedInput({ name, defaultValue = "", required, placeholder }: Props) {
  const [value, setValue] = useState(defaultValue);
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const abortRef = useRef<AbortController | null>(null);

  async function handlePolish() {
    if (!value.trim()) return;

    // Step 1 — instant rule-based result
    const rulebased = polishActionItem(value);
    setValue(rulebased);
    setState("loading");

    // Step 2 — AI upgrade in background
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
        signal: ctrl.signal,
      });
      const { result } = await res.json();
      if (result && result.trim()) setValue(result);
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      // Aborted or network error — rule-based result stays
      setState("idle");
    }
  }

  return (
    <div className="relative">
      <input
        name={name}
        value={value}
        onChange={e => { setValue(e.target.value); setState("idle"); }}
        required={required}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors ${
          state === "done" ? "border-accent bg-accent/5" : "border-border bg-bg"
        }`}
      />
      <button
        type="button"
        onClick={handlePolish}
        disabled={state === "loading"}
        title={state === "loading" ? "AI polishing…" : "Polish with AI (✦)"}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-fg-muted hover:text-accent transition-colors disabled:opacity-50"
      >
        {state === "loading"
          ? <Loader2 size={14} className="animate-spin text-accent" />
          : <Sparkles size={14} className={state === "done" ? "text-accent" : ""} />
        }
      </button>
    </div>
  );
}
