"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { polishActionItem } from "@/lib/smart-parse";

type Props = {
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
};

export function PolishedInput({ name, defaultValue = "", required, placeholder }: Props) {
  const [value, setValue] = useState(defaultValue);
  const [flashed, setFlashed] = useState(false);

  function handlePolish() {
    const polished = polishActionItem(value);
    if (polished !== value) {
      setValue(polished);
      setFlashed(true);
      setTimeout(() => setFlashed(false), 1200);
    }
  }

  return (
    <div className="relative">
      <input
        name={name}
        value={value}
        onChange={e => setValue(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors ${
          flashed ? "border-accent bg-accent/5" : "border-border bg-bg"
        }`}
      />
      <button
        type="button"
        onClick={handlePolish}
        title="Polish action item"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-fg-muted hover:text-accent transition-colors"
      >
        <Sparkles size={14} className={flashed ? "text-accent" : ""} />
      </button>
    </div>
  );
}
