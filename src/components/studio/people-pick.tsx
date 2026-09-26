"use client";

/**
 * Choosing people for a task, in the Studio look (owner, 25 Sept 2026: "fix or
 * use system design when selecting someone, and multiple people"). Replaces
 * the Desk PersonPicker on the Studio task screens.
 *
 *  - Who is chosen sits on top as chips, each with their face; × takes them off.
 *    The first is the one accountable, as everywhere else.
 *  - A search field, then the people as rows — face, name, a tick when chosen.
 *    Tap to add, tap again to take off: as many as you like.
 *  - Typing a name nobody has offers "Add … as a new name", as the old one did.
 *  - Enter picks the top match (or adds the new name); Escape clears the search.
 *
 * `tone` follows where it sits: "sheet" for the dark create sheet, "page" for
 * the white task pages.
 */
import { Check, Plus, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { PersonFace } from "@/components/studio/face";
import { cn } from "@/lib/cn";

type Person = { id: number; name: string };

const TONES = {
  sheet: {
    field: "border-[var(--sh-field-line)] bg-[var(--sh-field)] text-[var(--sh-fg)]",
    muted: "text-[var(--sh-muted)]",
    fg: "text-[var(--sh-fg)]",
    row: "hover:bg-[var(--sh-hover)]",
    on: "bg-[var(--sh-hover)]",
    chip: "border-[var(--sh-chip-line)] bg-[var(--sh-card)] text-[var(--sh-fg)]",
    tick: "border-[var(--sh-on-bg)] bg-[var(--sh-on-bg)] text-[var(--sh-on-fg)]",
    tickOff: "border-[var(--sh-chip-line)]",
    list: "border-[var(--sh-chip-line)]",
  },
  page: {
    field: "border-[var(--st-line)] bg-[var(--st-surface)] text-[var(--st-ink)]",
    muted: "text-[var(--st-muted)]",
    fg: "text-[var(--st-ink)]",
    row: "hover:bg-[var(--st-page)]",
    on: "bg-[var(--st-page)]",
    chip: "border-[var(--st-line)] bg-[var(--st-surface)] text-[var(--st-ink)]",
    tick: "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-surface)]",
    tickOff: "border-[var(--st-line)]",
    list: "border-[var(--st-line)]",
  },
} as const;

const bare = (s: string) => s.replace(/^(mr|mrs|ms|miss|dr|chef)\.?\s+/i, "").toLowerCase();

/** "Mr Jitesh Solanki" → "Mr Jitesh" (the title and first name). */
export function shortName(n: string): string {
  const parts = n.trim().split(/\s+/);
  if (parts.length > 1 && /^(mr|mrs|ms|miss|dr|chef)\.?$/i.test(parts[0])) return `${parts[0]} ${parts[1]}`;
  return parts[0] ?? n;
}

export function StudioPeoplePick({ people, value, onChange, tone = "page", autoFocus = false, maxHeight = 232, showChosen = true, compact = false }: {
  people: Person[];
  value: string[];
  onChange: (names: string[]) => void;
  tone?: keyof typeof TONES;
  autoFocus?: boolean;
  maxHeight?: number;
  /** Off where the screen already lists who is chosen (the new-task page). */
  showChosen?: boolean;
  /** The same size as the rows around it (a task's Details): short names,
   *  small chips, a normal-height search and list (owner, 26 Sept 2026). */
  compact?: boolean;
}) {
  const t = TONES[tone];
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const chosen = new Set(value.map((n) => n.toLowerCase()));

  const shown = useMemo(() => {
    const s = bare(q.trim());
    const list = s ? people.filter((p) => bare(p.name).includes(s) || p.name.toLowerCase().includes(s)) : people;
    // Chosen first, then A–Z — so what you picked never scrolls out of sight.
    return [...list].sort((a, b) => Number(chosen.has(b.name.toLowerCase())) - Number(chosen.has(a.name.toLowerCase())) || bare(a.name).localeCompare(bare(b.name)));
  }, [people, q, value]); // eslint-disable-line react-hooks/exhaustive-deps

  const typed = q.trim();
  const isNew = !!typed && !people.some((p) => p.name.toLowerCase() === typed.toLowerCase() || bare(p.name) === bare(typed)) && !chosen.has(typed.toLowerCase());

  const toggle = (name: string) => {
    onChange(chosen.has(name.toLowerCase()) ? value.filter((n) => n.toLowerCase() !== name.toLowerCase()) : [...value, name]);
    setQ("");
    input.current?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      {showChosen && value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((n, i) => (
            <span key={n} title={n} className={cn("inline-flex items-center gap-1.5 border py-0", compact ? "h-7 rounded-md pl-1 pr-1 text-[12px]" : "h-8 rounded-full pl-1 pr-1.5 text-[12.5px] font-medium", t.chip)}>
              <PersonFace name={n} size={compact ? 18 : 22} />
              <span className="max-w-[10rem] truncate">{compact ? shortName(n) : n}</span>
              {i === 0 && value.length > 1 && <span className={cn("text-[10.5px] font-normal", t.muted)}>lead</span>}
              <button type="button" aria-label={`Take ${n} off`} onClick={() => toggle(n)} className={cn("grid h-5 w-5 place-items-center rounded-full", t.muted, t.row)}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <label className={cn("flex items-center gap-2 border px-3", compact ? "h-8 rounded-md" : "h-10 rounded-[11px]", t.field)}>
        <Search size={14} className={t.muted} />
        <span className="sr-only">Find someone</span>
        <input
          ref={input}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); e.stopPropagation();
              if (shown[0] && typed) toggle(shown[0].name); else if (isNew) toggle(typed);
            } else if (e.key === "Escape" && q) { e.preventDefault(); e.stopPropagation(); setQ(""); }
          }}
          placeholder={compact ? "Find someone" : "Find someone, or type a new name"}
          style={{ background: "transparent", border: 0, boxShadow: "none", color: "inherit" }}
          className={cn("bare-field h-full w-full outline-none", compact ? "text-[13px]" : "text-[13.5px]", tone === "sheet" ? "placeholder:text-[var(--sh-muted)]" : "placeholder:text-[var(--st-muted)]")}
        />
      </label>
      <div role="listbox" aria-multiselectable aria-label="People" className={cn("st-scroll overflow-y-auto border p-1", compact ? "rounded-md" : "rounded-[12px]", t.list)} style={{ maxHeight: compact ? Math.min(maxHeight, 176) : maxHeight }}>
        {isNew && (
          <button type="button" onClick={() => toggle(typed)} className={cn("flex w-full items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left text-[13px]", t.row, t.fg)}>
            <span className={cn("grid h-7 w-7 place-items-center rounded-full border border-dashed", t.tickOff)}><Plus size={13} /></span>
            Add “{typed}” as a new name
          </button>
        )}
        {shown.map((p) => {
          const on = chosen.has(p.name.toLowerCase());
          return (
            <button key={p.id} type="button" role="option" aria-selected={on} onClick={() => toggle(p.name)}
              className={cn("flex w-full items-center rounded-[7px] text-left", compact ? "gap-2 px-1.5 py-1" : "gap-2.5 px-2 py-1.5", t.row, on && t.on)}>
              <PersonFace name={p.name} size={compact ? 20 : 28} />
              <span className={cn("min-w-0 flex-1 truncate text-[13px]", compact ? (on ? "font-medium" : "font-normal") : on ? "font-semibold" : "font-medium", t.fg)}>{p.name}</span>
              <span className={cn("grid shrink-0 place-items-center rounded-full border", compact ? "h-4 w-4" : "h-5 w-5", on ? t.tick : t.tickOff)}>{on && <Check size={compact ? 10 : 12} strokeWidth={3} />}</span>
            </button>
          );
        })}
        {!shown.length && !isNew && <div className={cn("px-2 py-3 text-center text-xs", t.muted)}>Nobody called “{typed}”.</div>}
      </div>
    </div>
  );
}
