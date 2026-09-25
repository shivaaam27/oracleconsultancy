"use client";
/* The "+ New" card's Company tab (mockup board Companies: "Add a company —
 * name · task-code prefix · colour"). The same `createCompany` the old dashed
 * card used, so the name and prefix checks are the server's, not ours. Enter
 * creates it and opens its page; Ctrl+Enter adds another. */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createCompany } from "@/app/companies/reference-actions";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";

const FIELD = { color: "var(--sh-fg)", background: "var(--sh-field)", border: "1px solid var(--sh-field-line)", boxShadow: "none" } as const;
const SWATCHES = ["#2490EF", "#19C37D", "#F5A524", "#E0479E", "#8B5CF6", "#0EA5E9", "#64748B"];

/** Two letters from the name: the first letter of the first two words. */
function guessPrefix(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return (w.length >= 2 ? w[0][0] + w[1][0] : name.trim().slice(0, 2)).toUpperCase();
}

export function QuickCompanyPane({ onDone, registerSubmit }: {
  onDone: (again: boolean) => void;
  registerSubmit: (fn: (again: boolean) => void, busy: boolean, fullHref: () => string) => void;
}) {
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [touched, setTouched] = useState(false);
  const [colour, setColour] = useState(SWATCHES[0]);
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  // After the card has painted — the card focuses its own tab strip first.
  useEffect(() => { const t = window.setTimeout(() => input.current?.focus(), 60); return () => window.clearTimeout(t); }, []);

  function submit(again: boolean) {
    if (!name.trim()) { toast("Give the company a name first.", { tone: "warn" }); input.current?.focus(); return; }
    start(async () => {
      const res = await createCompany(name, prefix, colour);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`${name.trim()} added — its tasks will be numbered ${prefix.toUpperCase()}-001 onwards.`, { tone: "success" });
      router.refresh();
      if (again) { setName(""); setPrefix(""); setTouched(false); input.current?.focus(); }
      else router.push(`/companies/${res.id}`);
      onDone(again);
    });
  }
  useEffect(() => { registerSubmit(submit, busy, () => "/companies?new=1"); }); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(true); }
    else if (e.key === "Enter") { e.preventDefault(); submit(false); }
  };
  const shown = prefix || "··";
  return (
    <div className="flex flex-col gap-4">
      {/* The name, with a live preview of the tile it will get on Companies. */}
      <div className="flex items-center gap-3.5">
        <span className="st-mono flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-[15px] font-semibold text-white transition-colors"
          style={{ background: colour }} aria-hidden>{shown}</span>
        <input ref={input} value={name} onKeyDown={onKey} placeholder="Company name" aria-label="Company name" autoFocus
          onChange={(e) => { setName(e.target.value); if (!touched) setPrefix(guessPrefix(e.target.value)); }}
          style={{ color: "var(--sh-fg)", background: "transparent", border: 0, boxShadow: "none" }}
          className="bare-field min-w-0 flex-1 px-0 py-1 text-[26px] tracking-[-0.02em] outline-none placeholder:text-[var(--sh-muted)]" />
      </div>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <label className="flex w-[150px] flex-col gap-1.5">
          <span className="text-[11px] text-[var(--sh-muted)]">Task-code prefix</span>
          <input value={prefix} maxLength={4} onKeyDown={onKey} placeholder="e.g. DS" style={FIELD}
            onChange={(e) => { setTouched(true); setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); }}
            className="bare-field st-mono h-9 w-full rounded-[10px] px-3 text-[13px] tracking-[0.08em] outline-none placeholder:tracking-normal placeholder:text-[var(--sh-muted)]" />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-[var(--sh-muted)]">Colour</span>
          <div className="flex h-9 items-center gap-2" role="radiogroup" aria-label="Colour">
            {SWATCHES.map((c) => (
              <button key={c} type="button" role="radio" aria-label={`Colour ${c}`} aria-checked={colour === c} onClick={() => setColour(c)}
                className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-105", colour === c ? "border-[var(--sh-fg)]" : "border-transparent")}
                style={{ background: c, backgroundClip: "padding-box" }}>
                {colour === c && <Check size={13} strokeWidth={3} className="text-white" />}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--sh-muted)]">
        {prefix.length >= 2 ? <>Its tasks will read <span className="st-mono text-[var(--sh-fg)]">{prefix}-001</span>, <span className="st-mono text-[var(--sh-fg)]">{prefix}-002</span>… The prefix can&apos;t be one another company already uses.</> : "Two to four letters or numbers — they start every task code for this company."}
        <br />Enter creates it and opens its page — legal details, branding and the rest are there · Ctrl+Enter adds another.
      </p>
    </div>
  );
}
