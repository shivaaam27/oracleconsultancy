"use client";

/**
 * The ONE place to filter a task list (owner, 26 Sept 2026: "there's a lot of
 * duplication … remove all the filters and just keep one in the search
 * section … the way we did for the menu"). It replaces the title-bar pickers,
 * the black Filters button and the lenses under the search box.
 *
 * Laid out like the Go-to panel: on a desk and a tablet every group is in view
 * at once — what to show and the stage, the companies, the people — with the
 * ways to group the list along the foot. On a phone the groups become tabs, so
 * a list of fourteen companies never pushes the rest off the screen.
 *
 * ⚠️ Each option is a LINK the server built, as before: the address stays the
 * list's state (saved views, Back, "where I was"). A new address remounts the
 * page, which would close the panel after every tap — so a tap inside it leaves
 * a note (`reopenOn`) and the panel that mounts next opens itself on the same
 * tab. You pick several things, then press Done.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type FilterItem = { key: string; label: string; count?: number; href: string; active: boolean; tone?: string };
/** `id` places a group: show · stage · company · person · group · flags · cards. */
export type FilterSection = { id?: string; title: string; note?: string; items: FilterItem[] };

const TONE_DOT: Record<string, string> = { danger: "#E0479E", warn: "#F5A524", info: "#2490EF", success: "#19C37D" };

// Survives the remount a filter change causes (see the header).
let reopenOn: string | null = null;

type Tab = "show" | "company" | "person" | "more";

export function TaskFilterButton({ sections, activeCount, clearHref, extra }: {
  sections: FilterSection[];
  activeCount: number;
  /** Where "Clear all" goes — the list with no filters. */
  clearHref: string;
  /** Rendered at the foot (the saved views). */
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("show");
  useEffect(() => {
    if (reopenOn) { setTab(reopenOn as Tab); setOpen(true); reopenOn = null; }
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    document.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); html.style.overflow = was; };
  }, [open]);

  const by = (id: string) => sections.find((s) => s.id === id);
  const show = by("show"), stage = by("stage"), company = by("company"), person = by("person");
  const lower = sections.filter((s) => s.id === "group" || s.id === "flags" || s.id === "cards");
  const tabs = ([
    ["show", "Show", !!(show || stage)],
    ["company", "Company", !!company],
    ["person", "Person", !!person],
    ["more", "Group & more", lower.length > 0 || !!extra],
  ] as const).filter(([, , has]) => has);
  const keep = () => { reopenOn = tab; };
  const cols = [!!(show || stage), !!company, !!person].filter(Boolean).length;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        className={cn("inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] px-3 text-[13px] font-medium transition-colors",
          activeCount ? "bg-[var(--st-ink)] text-[var(--st-page)]" : "border border-[var(--st-line)] bg-[var(--st-surface)] text-[var(--st-ink)] hover:bg-[var(--st-page)]")}>
        <SlidersHorizontal size={14} />Filter
        {activeCount > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-white/20 px-1 text-[11px] tabular-nums">{activeCount}</span>}
      </button>

      {/* Portalled to <body>: the search bar that holds the button is a
          sticky layer of its own, and inside it the panel sat UNDER the footer. */}
      {open && createPortal(
        <div className="studio fixed inset-0 z-[55]" role="dialog" aria-modal="true" aria-label="Filter tasks">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default bg-[rgba(14,15,16,0.35)]" />
          <div className="st-sheet st-sheet-dots st-pop absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-60px)] flex-col overflow-hidden rounded-t-[26px] bg-[var(--sh-bg)] text-[var(--sh-fg)] shadow-[0_30px_80px_rgba(0,0,0,0.4)] [font-family:var(--font-geist),var(--font-sans)] sm:inset-x-3 sm:bottom-[calc(var(--foot-h)+var(--foot-safe)+8px)] sm:mx-auto sm:max-h-[calc(100dvh-100px)] sm:max-w-[920px] sm:rounded-3xl">
            <span aria-hidden className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-full bg-[var(--sh-chip-line)] sm:hidden" />
            {/* head */}
            <div className="flex items-center gap-3 px-4 pb-3 pt-3 sm:px-5 sm:pt-4">
              <div className="min-w-0 flex-1">
                <div className="text-[18px] font-medium tracking-[-0.01em]">Filter</div>
                <div className="text-xs text-[var(--sh-sub)]">{activeCount ? `${activeCount} on · pick as many as you like` : "Pick as many as you like"}</div>
              </div>
              {activeCount > 0 && (
                <Link href={clearHref} scroll={false} onClick={keep} className="whitespace-nowrap text-[13px] text-[var(--sh-sub)] underline-offset-2 hover:text-[var(--sh-fg)] hover:underline">Clear all</Link>
              )}
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--sh-on-bg)] px-3.5 text-[13px] font-semibold text-[var(--sh-on-fg)] hover:opacity-90">
                <Check size={14} />Done
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="hidden h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--sh-chip-line)] text-[var(--sh-sub)] hover:text-[var(--sh-fg)] md:flex"><X size={14} /></button>
            </div>

            {/* phone: the groups are tabs */}
            {tabs.length > 1 && (
              <div className="mx-4 mb-3 flex shrink-0 gap-0.5 rounded-xl bg-[var(--sh-field)] p-[3px] md:hidden">
                {tabs.map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
                    className={cn("h-8 min-w-0 flex-1 truncate rounded-[9px] px-1 text-xs", tab === id ? "bg-[var(--sh-on-bg)] font-medium text-[var(--sh-on-fg)]" : "text-[var(--sh-sub)]")}>{label}</button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:px-5 sm:pb-5">
              <div className={cn("grid gap-x-5 gap-y-4", cols === 3 ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1.15fr)]" : cols === 2 ? "md:grid-cols-2" : "")}>
                {(show || stage) && (
                  <div className={cn("flex min-w-0 flex-col gap-4", tab !== "show" && "max-md:hidden")}>
                    {show && <Group s={show} onPick={keep} />}
                    {/* On a phone the stages sit under Show; from md up they
                        are short buttons in the band below, so the first
                        column is not twice the height of the others. */}
                    {stage && <div className={cn(show && "md:hidden")}><Group s={stage} onPick={keep} /></div>}
                  </div>
                )}
                {company && <div className={cn("min-w-0", tab !== "company" && "max-md:hidden")}><Group s={company} onPick={keep} searchable /></div>}
                {person && <div className={cn("min-w-0", tab !== "person" && "max-md:hidden")}><Group s={person} onPick={keep} searchable /></div>}
              </div>
              {(lower.length > 0 || extra || (stage && show)) && (
                <div className={cn("mt-4 flex flex-col gap-3.5 border-t border-[var(--sh-line)] pt-4 max-md:mt-0 max-md:border-0 max-md:pt-0", tab !== "more" && "max-md:hidden")}>
                  {stage && show && <div className="max-md:hidden"><ChipGroup s={stage} onPick={keep} /></div>}
                  {lower.map((s) => <ChipGroup key={s.title} s={s} onPick={keep} />)}
                  {extra && <div className="min-w-0">{extra}</div>}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Label({ s }: { s: FilterSection }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
      <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--sh-muted)]">{s.title}</span>
      {s.note && <span className="truncate text-[11px] text-[var(--sh-muted)]">{s.note}</span>}
    </div>
  );
}

/** A list of choices — the Go-to panel's rows. */
function Group({ s, onPick, searchable = false }: { s: FilterSection; onPick: () => void; searchable?: boolean }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => (q.trim() ? s.items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase())) : s.items), [q, s.items]);
  return (
    <div className="flex min-w-0 flex-col">
      <Label s={s} />
      {searchable && s.items.length > 8 && (
        <label className="mb-1.5 flex h-9 shrink-0 items-center gap-2 rounded-[10px] border border-[var(--sh-field-line)] bg-[var(--sh-field)] px-3 text-[var(--sh-muted)]">
          <Search size={13} />
          <span className="sr-only">Find in {s.title}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find a ${s.title.toLowerCase()}`} className="bare-field w-full border-0 bg-transparent text-[13px] text-[var(--sh-fg)] outline-none placeholder:text-[var(--sh-muted)]" />
        </label>
      )}
      <div className={cn("flex flex-col gap-1", searchable && "md:max-h-[300px] md:overflow-y-auto md:overscroll-contain md:pr-1")}>
        {shown.map((o) => (
          <Link key={o.key} href={o.href} scroll={false} onClick={onPick} aria-current={o.active ? "true" : undefined}
            className={cn("flex h-10 min-w-0 shrink-0 items-center gap-2.5 rounded-[10px] px-3 text-[13px] transition-colors md:h-9",
              o.active ? "bg-[var(--sh-on-bg)] font-medium text-[var(--sh-on-fg)]" : "bg-[var(--sh-card)] text-[var(--sh-fg)] hover:bg-[var(--sh-hover)]")}>
            {o.tone && <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: TONE_DOT[o.tone] ?? o.tone }} />}
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.count != null && <span className={cn("st-mono text-[11px] tabular-nums", o.active ? "opacity-80" : "text-[var(--sh-muted)]")}>{o.count}</span>}
            {o.active && <Check size={13} className="shrink-0" />}
          </Link>
        ))}
        {shown.length === 0 && <div className="px-3 py-2 text-xs text-[var(--sh-muted)]">Nothing matches.</div>}
      </div>
    </div>
  );
}

/** Short choices side by side — group by, flags and lanes. */
function ChipGroup({ s, onPick }: { s: FilterSection; onPick: () => void }) {
  return (
    <div className="flex min-w-0 flex-col md:flex-row md:items-start md:gap-4">
      <div className="md:w-[130px] md:shrink-0 md:pt-2"><Label s={s} /></div>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {s.items.map((o) => (
          <Link key={o.key} href={o.href} scroll={false} onClick={onPick} aria-pressed={o.active}
            className={cn("inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 text-[13px] transition-colors md:h-8 md:text-xs",
              o.active ? "border-transparent bg-[var(--sh-on-bg)] font-medium text-[var(--sh-on-fg)]" : "border-[var(--sh-chip-line)] bg-[var(--sh-card)] text-[var(--sh-fg)] hover:bg-[var(--sh-hover)]")}>
            {o.tone && <span className="h-[7px] w-[7px] rounded-full" style={{ background: TONE_DOT[o.tone] ?? o.tone }} />}
            {o.label}
            {o.count != null && <span className="st-mono text-[11px] opacity-60">{o.count}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
