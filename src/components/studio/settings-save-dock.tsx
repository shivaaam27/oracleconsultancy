"use client";

/**
 * Studio Settings: ONE save bar, and only when something has changed.
 *
 * Settings is a page of separate forms, and each used to carry its own sticky
 * "Save changes" button whether or not anything had been touched — five black
 * buttons on one screen, all saying the same thing. In Studio they are hidden
 * (`.st-settings [data-savebar]`) and this dock appears instead, naming the
 * section that has unsaved changes. Saving still submits THAT form through its
 * own button, so every save goes exactly where it always went.
 *
 * "Changed" is worked out by comparing each form's values with what it held
 * when the page settled — so switching something on and off again is not a
 * change. Switches and dropdowns write hidden inputs from React state, which
 * fires no input event, so any click or key re-checks a moment later.
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { cn } from "@/lib/cn";

type Dirty = { key: string; label: string; form: HTMLFormElement };

function snapshot(form: HTMLFormElement): string {
  const out: string[] = [];
  new FormData(form).forEach((v, k) => { out.push(`${k}=${typeof v === "string" ? v : `file:${v.name}:${v.size}`}`); });
  return out.join("&");
}

function labelOf(form: HTMLFormElement): string {
  const titles = [...form.querySelectorAll<HTMLElement>("[data-card] h2")].map((h) => h.textContent?.trim()).filter(Boolean) as string[];
  return titles.length ? titles.join(" · ") : "This section";
}

export function SettingsSaveDock({ root }: { root: React.RefObject<HTMLElement | null> }) {
  const sp = useSearchParams();
  const base = useRef(new Map<HTMLFormElement, string>());
  const [dirty, setDirty] = useState<Dirty[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const forms = () => [...el.querySelectorAll<HTMLFormElement>("form")].filter((f) => f.querySelector("[data-savebar]"));
    // A fresh baseline whenever the page settles (first load, and after every
    // save, which comes back with a new address).
    const settle = window.setTimeout(() => {
      base.current = new Map(forms().map((f) => [f, snapshot(f)]));
      setDirty([]);
      setSaving(null);
    }, 150);

    let t = 0;
    const check = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const next: Dirty[] = [];
        forms().forEach((f, i) => {
          if (!base.current.has(f)) base.current.set(f, snapshot(f));
          if (snapshot(f) !== base.current.get(f)) next.push({ key: String(i), label: labelOf(f), form: f });
        });
        setDirty(next);
      }, 60);
    };
    const onSubmit = (e: Event) => {
      const f = e.target as HTMLFormElement;
      if (f.querySelector("[data-savebar]")) setSaving(labelOf(f));
    };
    document.addEventListener("input", check, true);
    document.addEventListener("change", check, true);
    document.addEventListener("click", check, true);
    document.addEventListener("keyup", check, true);
    el.addEventListener("submit", onSubmit, true);
    return () => {
      window.clearTimeout(settle);
      window.clearTimeout(t);
      document.removeEventListener("input", check, true);
      document.removeEventListener("change", check, true);
      document.removeEventListener("click", check, true);
      document.removeEventListener("keyup", check, true);
      el.removeEventListener("submit", onSubmit, true);
    };
  }, [root, sp]);

  const show = dirty.length > 0 || saving;
  return (
    <div aria-live="polite"
      className={cn("pointer-events-none fixed inset-x-0 z-[45] flex justify-center px-4 transition-all duration-200",
        "bottom-[calc(var(--foot-h)+env(safe-area-inset-bottom)+16px)]",
        show ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}>
      {show && (
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-[var(--st-line)] bg-[var(--st-surface)] py-2 pl-4 pr-2 shadow-[0_14px_36px_rgba(17,18,20,0.16)]">
          {saving ? (
            <span className="flex items-center gap-2 text-[13px]"><Loader2 size={14} className="animate-spin" />Saving {saving}…</span>
          ) : dirty.map((d) => (
            <span key={d.key} className="flex min-w-0 items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--st-soon)]" />
              <span className="min-w-0 truncate text-[13px]"><span className="text-[var(--st-muted)]">Unsaved · </span>{d.label}</span>
              {/* A reload, not form.reset(): switches and dropdowns keep their own
                  state, which reset() does not touch. */}
              <button type="button" onClick={() => window.location.reload()}
                className="h-8 rounded-[9px] px-2.5 text-xs text-[var(--st-sub)] hover:bg-[var(--st-page)]">Discard</button>
              <button type="button" onClick={() => d.form.querySelector<HTMLButtonElement>("[data-savebar] button[type=submit]")?.click()}
                className="flex h-8 items-center gap-1.5 rounded-[9px] bg-[var(--st-ink)] px-3 text-xs font-medium text-[var(--st-surface)] hover:opacity-90"><Save size={13} />Save</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
