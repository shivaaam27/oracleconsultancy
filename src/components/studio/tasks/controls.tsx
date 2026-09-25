"use client";

/**
 * The Studio Tasks page's controls — the title-bar pickers, the Filters panel,
 * and the search/segment bar that floats at the foot of the list.
 *
 * ⚠️ NOTHING HERE FILTERS ANYTHING ITSELF. Every option is a link the server
 * already built (the same `buildHref` the old page uses), so the address stays
 * the list's state: saved views, Back, and "take me back to where I was" all
 * keep working exactly as before.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import type { FilterChip, FilterOption, IdentityStrip } from "@/components/tasks/task-filter-bar";
import { adminRemindTask } from "@/app/task/actions";
import { useToast } from "@/components/shell/toast";
import { Dot, stBtn, stFloatBar } from "@/components/studio/kit";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------ picker ---- */

/** A chip in the title bar that opens a short list of links ("All companies ▾"). */
export function StudioMenu({ label, sub, options, searchable = false, width = 280, up = false, plus = false }: {
  label: string; sub?: string; options: FilterOption[]; searchable?: boolean; width?: number;
  /** Open ABOVE the trigger — for the search bar at the foot of the screen. */
  up?: boolean;
  /** The search bar's soft "Filter by company +" look instead of a chip. */
  plus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <div ref={root} className="relative min-w-0 max-sm:shrink">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={plus ? "flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[var(--st-page)] px-3 text-xs transition-colors hover:bg-[var(--st-seg)]" : cn(stBtn.chip, "max-w-full max-sm:h-9 max-sm:gap-1.5 max-sm:px-2.5")}
      >
        <span className="min-w-0 max-w-[14rem] truncate">{label}</span>
        {sub && <span className="text-[var(--st-muted)]">{sub}</span>}
        {plus ? <Plus size={12} strokeWidth={2.2} /> : <ChevronDown size={12} className={cn("shrink-0 transition-transform", open && "rotate-180")} />}
      </button>
      {open && (
        <div data-st-menu className={cn("st-pop absolute left-0 z-40", up ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+6px)]", "overflow-hidden rounded-xl border border-[var(--st-line)] bg-[var(--st-surface)] shadow-[0_16px_40px_rgba(17,18,20,0.16)]")} style={{ width }}>
          {searchable && (
            <label className="flex items-center gap-2 border-b border-[var(--st-line-soft)] px-3 py-2 text-[var(--st-muted)]">
              <Search size={13} />
              <span className="sr-only">Find</span>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find…" className="bare-field w-full border-0 bg-transparent text-[13px] text-[var(--st-ink)] outline-none" />
            </label>
          )}
          <div className="max-h-[340px] overflow-y-auto p-1">
            {shown.map((o) => (
              <Link
                key={o.key}
                href={o.href}
                scroll={false}
                onClick={() => setOpen(false)}
                className={cn("flex items-center gap-2 rounded-lg px-2.5 py-3 text-[14px] hover:bg-[var(--st-page)] sm:py-1.5 sm:text-[13px]", o.active && "bg-[var(--st-page)] font-medium")}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.count != null && <span className="st-mono text-[11px] text-[var(--st-muted)]">{o.count}</span>}
              </Link>
            ))}
            {shown.length === 0 && <div className="px-2.5 py-2 text-xs text-[var(--st-muted)]">Nothing matches.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------- the panel ---- */

export type FilterSection = { title: string; note?: string; items: { key: string; label: string; count?: number; href: string; active: boolean; tone?: FilterChip["tone"] }[] };

const TONE_DOT: Record<string, string> = { danger: "var(--st-late)", warn: "var(--st-soon)", info: "var(--st-blue)", success: "var(--st-ok)" };

/** The black “Filters” button and the panel it opens. `extra` is rendered at the
 *  foot of the panel — the saved views live there. */
export function FiltersButton({ sections, activeCount, extra }: { sections: FilterSection[]; activeCount: number; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Filters" className={cn(stBtn.dark, "max-sm:h-10 max-sm:w-10 max-sm:justify-center max-sm:px-0")}>
        <SlidersHorizontal size={15} /><span className="hidden sm:inline">Filters</span>
        {activeCount > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-[#2E3035] px-1 text-[11px] text-white">{activeCount}</span>}
      </button>
      {open && (
        <div className="studio fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Filters">
          <button type="button" aria-label="Close filters" className="absolute inset-0 bg-[rgba(14,15,16,0.28)]" onClick={() => setOpen(false)} />
          <div className="st-pop absolute bottom-3 right-3 top-3 flex w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-[20px] bg-[var(--st-surface)] shadow-[0_24px_60px_rgba(17,18,20,0.25)]">
            <div className="flex items-center justify-between border-b border-[var(--st-line-soft)] px-5 py-4">
              <div>
                <div className="text-lg font-semibold">Filters</div>
                <div className="text-xs text-[var(--st-muted)]">Each choice is saved in the address, so a view can be kept.</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--st-line)]"><X size={14} /></button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {sections.map((s) => (
                <div key={s.title}>
                  <div className="mb-2 flex justify-between text-xs text-[var(--st-muted)]"><span>{s.title}</span>{s.note && <span className="text-[var(--st-muted)]">{s.note}</span>}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.items.map((o) => (
                      <Link
                        key={o.key}
                        href={o.href}
                        scroll={false}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-[9px] border px-2.5 text-xs transition-colors",
                          o.active ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-page)]" : "border-[var(--st-line)] bg-[var(--st-surface)] hover:bg-[var(--st-page)]",
                        )}
                      >
                        {o.tone && <Dot color={TONE_DOT[o.tone]} />}
                        {o.label}
                        {o.count != null && <span className="st-mono text-[11px] opacity-60">{o.count}</span>}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              {extra && <div>{extra}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------ who / which ---- */

/**
 * When the list is narrowed to one person or one company, a strip says so —
 * with the Assigned / Created-by switch and "Remind them about all N late",
 * exactly as the old page's identity strip does.
 */
export function StudioIdentity({ strip }: { strip: IdentityStrip }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function remindAll() {
    if (!strip.remindTaskId) return;
    setBusy(true);
    const res = await adminRemindTask(strip.remindTaskId, true);
    setBusy(false);
    if (!res.ok) return toast(res.error, { tone: "warn" });
    if (res.link) window.open(res.link, "_blank");
    toast(`Full task list ready for ${res.name}.`, { tone: "success" });
  }
  return (
    <div className="st-pop flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--st-surface)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{strip.title}</div>
        <div className="text-xs text-[var(--st-muted)]">{strip.sub}</div>
      </div>
      {strip.segments && (
        <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-page)] p-[3px]">
          {strip.segments.map((s) => (
            <Link key={s.label} href={s.href} scroll={false} className={cn("h-[30px] rounded-lg px-3 text-xs leading-[30px]", s.active ? "bg-[var(--st-surface)] font-medium shadow-sm" : "text-[var(--st-sub)]")}>{s.label}</Link>
          ))}
        </div>
      )}
      {strip.remindTaskId != null && (strip.lateCount ?? 0) > 0 && (
        <button type="button" disabled={busy} onClick={remindAll} className={stBtn.dark}>Remind about all {strip.lateCount} late</button>
      )}
      <Link href={strip.clearHref} scroll={false} aria-label="Show everyone again" className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--st-line)]"><X size={14} /></Link>
    </div>
  );
}

/* ------------------------------------------------- the bottom bar ---- */

const SEARCH_SETTLE_MS = 300;

/**
 * Search + the quick lenses, floating at the foot of the list.
 *
 * ⚠️ SAME RULES AS THE OLD SEARCH BOX: it filters as you
 * type, settling 300ms after the keyboard goes quiet; it REPLACES the address,
 * never pushes (or Back walks through your typing); and while someone is typing
 * the box is the truth — the arriving address must not overwrite it.
 */
export function StudioSearchBar({ q, searchHrefBase, lenses, companyMenu }: { q: string; searchHrefBase: string; lenses: FilterChip[]; companyMenu?: ReactNode }) {
  const router = useRouter();
  const [text, setText] = useState(q);
  const typing = useRef(false);
  useEffect(() => { if (!typing.current) setText(q); }, [q]);
  const commit = useCallback((value: string) => {
    typing.current = false;
    const u = new URL(searchHrefBase, window.location.origin);
    if (value.trim()) u.searchParams.set("q", value.trim());
    else u.searchParams.delete("q");
    const next = `${u.pathname}?${u.searchParams.toString()}`;
    if (`${window.location.pathname}${window.location.search}` === next) return;
    router.replace(next, { scroll: false });
  }, [router, searchHrefBase]);
  useEffect(() => {
    if (!typing.current) return;
    const id = setTimeout(() => commit(text), SEARCH_SETTLE_MS);
    return () => clearTimeout(id);
  }, [text, commit]);

  return (
    // Below lg the old floating nav pill (z-40) owns the foot of the screen,
    // so the bar rides just above it rather than behind it.
    <div data-sticky-foot className={cn(stFloatBar.sticky, "mt-3")}>
      <div className="pointer-events-auto flex w-full max-w-[860px] flex-wrap items-center gap-2.5 rounded-2xl border border-[var(--st-line)] bg-[var(--st-surface)] p-2 pl-4 shadow-[0_10px_28px_rgba(17,18,20,0.12)] sm:h-14 sm:flex-nowrap sm:py-0">
        <label className="flex min-w-[180px] flex-1 items-center gap-2 text-[var(--st-muted)]">
          <Search size={15} />
          <span className="sr-only">Search tasks</span>
          <input
            type="search"
            value={text}
            onChange={(e) => { typing.current = true; setText(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") commit(text); }}
            placeholder="Search — a task, a code, a company or a person"
            className="bare-field h-9 w-full border-0 bg-transparent text-[13px] text-[var(--st-ink)] outline-none"
          />
        </label>
        {companyMenu && <div className="hidden shrink-0 md:block">{companyMenu}</div>}
        <span className="hidden h-6 w-px bg-[var(--st-line)] sm:block" aria-hidden />
        {/* One row that scrolls sideways — wrapped, the lenses made the bar
            three rows tall on a phone and covered the list. */}
        <div className="flex w-full min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] sm:w-auto">
          {lenses.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              scroll={false}
              aria-pressed={l.active}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 text-xs transition-colors",
                l.active ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-page)]" : "border-[var(--st-line)] bg-[var(--st-surface)] hover:bg-[var(--st-page)]",
              )}
            >
              <Dot color={l.tone ? TONE_DOT[l.tone] : "var(--st-ink)"} />
              {l.label}
              <span className="st-mono text-[11px] opacity-70">{l.count}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
