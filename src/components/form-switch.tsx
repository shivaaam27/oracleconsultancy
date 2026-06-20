"use client";

import { useState, type ReactNode } from "react";
import { Switch } from "./ui";

/**
 * An Aurora iPhone-style toggle that submits inside a plain server-action form.
 * Renders a hidden input (`name`) carrying "on"/"off" so `saveSettings`'
 * `fd.get(name) === "on"` check keeps working — no client action needed.
 */
export function FormSwitch({
  name,
  defaultChecked = false,
  label,
  hint,
}: {
  name: string;
  defaultChecked?: boolean;
  label: ReactNode;
  hint?: ReactNode;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn((v) => !v)}
      className="flex w-full items-center gap-3 rounded-xl bg-bg-subtle/50 px-3.5 py-2.5 text-left ring-1 ring-border/70 transition-[background-color,transform] hover:bg-bg-subtle active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-fg-muted">{hint}</span>}
      </span>
      <Switch on={on} />
      <input type="hidden" name={name} value={on ? "on" : "off"} />
    </button>
  );
}
