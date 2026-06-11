"use client";
import { useEffect, useState } from "react";
import { Moon, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/* Focus mode — a calm view that hides the floating distractions (the AI
 * assistant bubble + the suggestions peek) so the page reads cleanly. Persisted
 * in localStorage and applied as `data-focus` on <html>; the global stylesheet
 * hides anything marked `data-focus-hide`. Mirrors the density toggle. */

const KEY = "cos-focus";

function apply(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-focus", on ? "on" : "off");
}

export function FocusScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{var f=localStorage.getItem('${KEY}')==='on';document.documentElement.setAttribute('data-focus',f?'on':'off');}catch(e){}`,
      }}
    />
  );
}

export function FocusToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(KEY) === "on";
    setOn(stored);
    apply(stored);
  }, []);

  const toggle = () => {
    const next = !on;
    setOn(next);
    localStorage.setItem(KEY, next ? "on" : "off");
    apply(next);
  };

  const Icon = on ? Moon : Sparkles;
  return (
    <button
      type="button"
      onClick={toggle}
      title={on ? "Focus mode on" : "Focus mode off"}
      aria-label="Toggle focus mode"
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md p-1.5 transition-colors",
        on ? "text-accent" : "text-fg-muted hover:text-fg hover:bg-bg-muted",
        className
      )}
    >
      <Icon size={14} />
      {withLabel && <span className="text-[11px] font-medium">Focus</span>}
    </button>
  );
}
