"use client";

/**
 * The ONE place to filter a list (owner, 26 Sept 2026: "there's a lot of
 * duplication … remove all the filters and just keep one in the search
 * section … the way we did for the menu"). First on Tasks, then on every
 * Studio list — People, Assets, Supplies, Calendar — so each filters the same
 * way: a Filter button in the search bar, and this panel.
 *
 * Laid out like the Go-to panel, and every option looks the same: a row with
 * its count, set in COLUMNS so a long list is short (owner, 26 Sept 2026:
 * "column-wise … so it looks cleaner and shorter"). The main groups come first
 * — Company always leads — each across the full width in up to five columns;
 * the rest ("More": what to show, stage, group by, flags) sit two side by side
 * underneath. A very long list (people) stops after a few rows and scrolls in
 * place, with a find box. On a phone the main groups and "More" are tabs, each
 * two columns wide.
 *
 * An option is a LINK (the address is the list's state — saved views, Back,
 * "where I was") or, for a switch that is a device preference and not in the
 * address (Calendar's layers), an `onSelect`. A new address remounts the page,
 * which would close the panel after every tap — so a tap inside it leaves a
 * note (`reopenOn`) and the panel that mounts next opens itself on the same
 * tab. You pick several things, then press Done.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type FilterItem = {
  key: string; label: string; count?: number; active: boolean; tone?: string;
  /** Where the option goes — the usual case. */
  href?: string;
  /** Or what it does, for a switch that is not in the address. */
  onSelect?: () => void;
};
/** `kind` places a group: "list" = a main group (its own tab on a phone, full
 *  width on a desk), "chips" = under More. Without a `kind`, the task list's
 *  ids decide: company and person are main groups, the rest go under More. */
export type FilterSection = { id?: string; title: string; note?: string; items: FilterItem[]; kind?: "list" | "chips"; searchable?: boolean };

const TONE_DOT: Record<string, string> = { danger: "#E0479E", warn: "#F5A524", info: "#2490EF", success: "#19C37D" };
const CHIP_IDS = new Set(["show", "stage", "group", "flags", "cards"]);
const kindOf = (s: FilterSection) => s.kind ?? (s.id && CHIP_IDS.has(s.id) ? "chips" : "list");

// Survives the remount a filter change causes (see the header).
let reopenOn: string | null = null;

export function FilterPanelButton({ sections, activeCount, clearHref, onClear, extra, label = "Filter" }: {
  sections: FilterSection[];
  activeCount: number;
  /** Where "Clear all" goes — the list with no filters. */
  clearHref?: string;
  /** Or what it does. */
  onClear?: () => void;
  /** Rendered at the foot (saved views). */
  extra?: ReactNode;
  label?: string;
}) {
  const lists = sections.filter((s) => kindOf(s) === "list").slice(0, 3);
  const band = sections.filter((s) => !lists.includes(s));
  const tabs = [...lists.map((s) => s.title), ...(band.length || extra ? ["More"] : [])];

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(tabs[0] ?? "More");
  useEffect(() => {
    if (reopenOn != null) { if (tabs.includes(reopenOn)) setTab(reopenOn); setOpen(true); reopenOn = null; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    document.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); html.style.overflow = was; };
  }, [open]);

  const keep = () => { reopenOn = tab; };
  const onTab = (t: string) => cn("min-w-0", tab !== t && "max-md:hidden");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        className={cn("inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] px-3 text-[13px] font-medium transition-colors",
          activeCount ? "bg-[var(--st-ink)] text-[var(--st-page)]" : "border border-[var(--st-line)] bg-[var(--st-surface)] text-[var(--st-ink)] hover:bg-[var(--st-page)]")}>
        <SlidersHorizontal size={14} />{label}
        {activeCount > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-white/20 px-1 text-[11px] tabular-nums">{activeCount}</span>}
      </button>

      {/* Portalled to <body>: the search bar that holds the button is a
          sticky layer of its own, and inside it the panel sat UNDER the footer. */}
      {open && createPortal(
        <div className="studio fixed inset-0 z-[55]" role="dialog" aria-modal="true" aria-label={label}>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default bg-[rgba(14,15,16,0.35)]" />
          <div className="st-sheet st-sheet-dots st-pop absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-60px)] flex-col overflow-hidden rounded-t-[26px] bg-[var(--sh-bg)] text-[var(--sh-fg)] shadow-[0_30px_80px_rgba(0,0,0,0.4)] [font-family:var(--font-geist),var(--font-sans)] sm:inset-x-3 sm:bottom-[calc(var(--foot-h)+var(--foot-safe)+8px)] sm:mx-auto sm:max-h-[calc(100dvh-100px)] sm:max-w-[1040px] sm:rounded-3xl">
            <span aria-hidden className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-full bg-[var(--sh-chip-line)] sm:hidden" />
            <div className="flex items-center gap-3 px-4 pb-3 pt-3 sm:px-5 sm:pt-4">
              <div className="min-w-0 flex-1">
                <div className="text-[18px] font-medium tracking-[-0.01em]">{label}</div>
                <div className="text-xs text-[var(--sh-sub)]">{activeCount ? `${activeCount} on · pick as many as you like` : "Pick as many as you like"}</div>
              </div>
              {activeCount > 0 && (clearHref ? (
                <Link href={clearHref} scroll={false} onClick={keep} className="whitespace-nowrap text-[13px] text-[var(--sh-sub)] underline-offset-2 hover:text-[var(--sh-fg)] hover:underline">Clear all</Link>
              ) : onClear ? (
                <button type="button" onClick={onClear} className="whitespace-nowrap text-[13px] text-[var(--sh-sub)] underline-offset-2 hover:text-[var(--sh-fg)] hover:underline">Clear all</button>
              ) : null)}
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--sh-on-bg)] px-3.5 text-[13px] font-semibold text-[var(--sh-on-fg)] hover:opacity-90">
                <Check size={14} />Done
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="hidden h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--sh-chip-line)] text-[var(--sh-sub)] hover:text-[var(--sh-fg)] md:flex"><X size={14} /></button>
            </div>

            {/* phone: each group is a tab */}
            {tabs.length > 1 && (
              <div className="mx-4 mb-3 flex shrink-0 gap-0.5 rounded-xl bg-[var(--sh-field)] p-[3px] md:hidden">
                {tabs.map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                    className={cn("h-8 min-w-0 flex-1 truncate rounded-[9px] px-1 text-xs", tab === t ? "bg-[var(--sh-on-bg)] font-medium text-[var(--sh-on-fg)]" : "text-[var(--sh-sub)]")}>{t}</button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:px-5 sm:pb-5">
              <div className="flex flex-col gap-5">
                {lists.map((s) => (
                  <div key={s.title} className={onTab(s.title)}>
                    <Group s={s} onPick={keep} wide searchable={s.searchable ?? (s.id === "company" || s.id === "person")} />
                  </div>
                ))}
                {(band.length > 0 || extra) && (
                  <div className={cn("grid gap-x-6 gap-y-5 lg:grid-cols-2", lists.length > 0 && "border-t border-[var(--sh-line)] pt-5 max-md:border-0 max-md:pt-0", lists.length > 0 && tab !== "More" && "max-md:hidden")}>
                    {band.map((s) => <Group key={s.title} s={s} onPick={keep} />)}
                    {extra && <div className="min-w-0 lg:col-span-2">{extra}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** The task lists' name for it. */
export const TaskFilterButton = FilterPanelButton;

/** One option — a link, or a switch when it is not in the address. */
function Option({ o, onPick, className, children, list }: { o: FilterItem; onPick: () => void; className: string; children: ReactNode; list?: boolean }) {
  const a11y = list ? { "aria-current": o.active ? ("true" as const) : undefined } : { "aria-pressed": o.active };
  if (o.href) return <Link href={o.href} scroll={false} onClick={onPick} className={className} {...a11y}>{children}</Link>;
  return <button type="button" onClick={() => o.onSelect?.()} className={cn(className, "text-left")} {...a11y}>{children}</button>;
}

/** A group of choices — rows with their counts, in columns. `wide` = a main
 *  group across the whole panel; otherwise a half-width group under More. */
function Group({ s, onPick, searchable = false, wide = false }: { s: FilterSection; onPick: () => void; searchable?: boolean; wide?: boolean }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => (q.trim() ? s.items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase())) : s.items), [q, s.items]);
  const find = searchable && s.items.length > 10;
  // A long main list stops after a few rows and scrolls in place.
  const tall = wide && s.items.length > 20;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-1.5 flex items-center gap-3 px-1">
        <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--sh-muted)]">{s.title}</span>
        {s.note && <span className="truncate text-[11px] text-[var(--sh-muted)]">· {s.note}</span>}
        <span className="flex-1" />
        {find && (
          <label className="flex h-8 w-[min(220px,50%)] shrink-0 items-center gap-1.5 rounded-[9px] border border-[var(--sh-field-line)] bg-[var(--sh-field)] px-2.5 text-[var(--sh-muted)]">
            <Search size={12} />
            <span className="sr-only">Find in {s.title}</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find…" className="bare-field w-full min-w-0 border-0 bg-transparent text-[12.5px] text-[var(--sh-fg)] outline-none placeholder:text-[var(--sh-muted)]" />
          </label>
        )}
      </div>
      <div className={cn("grid grid-cols-2 gap-1", wide ? "md:grid-cols-4 lg:grid-cols-5" : "md:grid-cols-3", tall && "max-h-[196px] overflow-y-auto overscroll-contain pr-1 md:max-h-[160px]")}>
        {shown.map((o) => (
          <Option key={o.key} o={o} onPick={onPick} list
            className={cn("flex h-9 w-full min-w-0 items-center gap-2 rounded-[9px] px-2.5 text-[12.5px] transition-colors md:h-8",
              o.active ? "bg-[var(--sh-on-bg)] font-medium text-[var(--sh-on-fg)]" : "bg-[var(--sh-card)] text-[var(--sh-fg)] hover:bg-[var(--sh-hover)]")}>
            {o.tone && <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: TONE_DOT[o.tone] ?? o.tone }} />}
            <span className="min-w-0 flex-1 truncate" title={o.label}>{o.label}</span>
            {o.count != null && <span className={cn("st-mono shrink-0 text-[11px] tabular-nums", o.active ? "opacity-80" : "text-[var(--sh-muted)]")}>{o.count}</span>}
          </Option>
        ))}
        {shown.length === 0 && <div className="col-span-full px-2.5 py-2 text-xs text-[var(--sh-muted)]">Nothing matches.</div>}
      </div>
    </div>
  );
}
