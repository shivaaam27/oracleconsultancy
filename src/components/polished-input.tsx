"use client";

import { useState, useRef } from "react";
import { Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { polishActionItem } from "@/lib/smart-parse";

type Props = {
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  onValueChange?: (v: string) => void;
};

export function PolishedInput({ name, defaultValue = "", required, placeholder, onValueChange }: Props) {
  const [value, setValueState] = useState(defaultValue);
  const setValue = (v: string) => {
    setValueState(v);
    onValueChange?.(v);
  };
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [source, setSource] = useState<"ai" | "rules" | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handlePolish() {
    if (!value.trim()) return;

    const original = value;
    const rulebased = polishActionItem(value);
    setValue(rulebased);
    setState("loading");
    setSource(null);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: original }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (data.result && data.result.trim()) setValue(data.result);
      setSource(data.source === "ai" ? "ai" : "rules");
      setState("done");
      setTimeout(() => { setState("idle"); setSource(null); }, 3000);
    } catch {
      setState("done");
      setSource("rules");
      setTimeout(() => { setState("idle"); setSource(null); }, 3000);
    }
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          name={name}
          value={value}
          onChange={e => { setValue(e.target.value); setState("idle"); setSource(null); }}
          required={required}
          placeholder={placeholder}
          className={`w-full h-8 rounded-md border px-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors ${
            state === "done" ? "border-accent bg-accent/5" : "border-border bg-bg"
          }`}
        />
        <button
          type="button"
          onClick={handlePolish}
          disabled={state === "loading"}
          title={state === "loading" ? "Polishing…" : "Polish with AI ✦"}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-fg-muted hover:text-accent transition-colors disabled:opacity-50"
        >
          {state === "loading"
            ? <Loader2 size={14} className="animate-spin text-accent" />
            : <Sparkles size={14} className={state === "done" ? "text-accent" : ""} />
          }
        </button>
      </div>
      {state === "done" && (
        <p className="flex items-center gap-1 text-xs text-success">
          <CheckCircle2 size={11} />
          {source === "ai" ? "Polished with AI" : "Polished"}
        </p>
      )}
    </div>
  );
}
