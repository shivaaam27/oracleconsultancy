"use client";

/**
 * Settings → General → Appearance. Light, dark, or follow the device — the
 * same switch as the footer's sun/moon, with the third choice the footer has
 * no room for. Saves at once, on this device (next-themes keeps it).
 */
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const CHOICES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "Match device", icon: Monitor },
] as const;

export function AppearanceSetting() {
  const { theme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const on = ready ? theme ?? "system" : null;
  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-2">
      {CHOICES.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" role="radio" aria-checked={on === id} onClick={() => setTheme(id)}
          className={cn("flex flex-col items-center gap-2 rounded-[12px] border px-2 py-3 text-[12px] font-medium transition-colors",
            on === id ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-surface)]" : "border-[var(--st-line)] bg-[var(--st-surface)] text-[var(--st-ink)] hover:bg-[var(--st-page)]")}>
          <Icon size={18} />
          {label}
        </button>
      ))}
    </div>
  );
}
