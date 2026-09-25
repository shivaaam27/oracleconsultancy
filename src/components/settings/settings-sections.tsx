"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Lucide from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { SettingsSaveDock } from "@/components/studio/settings-save-dock";

export type SettingsGroup = {
  id: string;
  label: string;
  icon: string; // lucide icon name
  /** Card ids in this group — so a deep link to #card-id opens the right group. */
  cards: string[];
};

function icon(name: string): LucideIcon {
  return ((Lucide as Record<string, unknown>)[name] as LucideIcon) ?? Lucide.Circle;
}

/**
 * Sectioned Settings shell: a search box + a left rail of groups. Only the chosen
 * group's cards show. Typing in the search jumps across every group at once,
 * surfacing just the matching cards. The children are server-rendered
 * `<section data-group>` blocks holding `<… data-card data-search>` cards — this
 * component only toggles visibility, so every server action inside is untouched.
 */
export function SettingsSections({
  groups,
  initial,
  children,
  studio,
}: {
  groups: SettingsGroup[];
  initial?: string;
  children: React.ReactNode;
  /** Studio (mockup board Settings): the title, the search and the two cards
   *  come from the page; the groups become one row of buttons; the cards sit
   *  three to a row. Same visibility logic, same forms. */
  studio?: { title: React.ReactNode; note?: React.ReactNode; top?: React.ReactNode };
}) {
  const ids = useMemo(() => groups.map((g) => g.id), [groups]);
  const first = ids[0];
  const [active, setActive] = useState<string>(
    initial && ids.includes(initial) ? initial : first,
  );
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const [hits, setHits] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const studioRoot = useRef<HTMLDivElement>(null);

  // On mount, refine the initial group from the hash / sessionStorage when the
  // server didn't pin one via ?section=.
  useEffect(() => {
    if (initial && ids.includes(initial)) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) {
      const byCard = groups.find((g) => g.cards.includes(hash));
      if (byCard) { setActive(byCard.id); return; }
      if (ids.includes(hash)) { setActive(hash); return; }
    }
    const saved = sessionStorage.getItem("settings.section");
    if (saved && ids.includes(saved)) setActive(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive what's visible. Search mode wins: show only cards that match, across
  // all groups, hiding any section + any form save-bar with no visible card.
  useEffect(() => {
    const q = query.trim().toLowerCase();
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-group]"));
    if (!q) {
      sections.forEach((s) => {
        s.style.display = s.dataset.group === active ? "block" : "none";
        s.querySelectorAll<HTMLElement>("[data-card]").forEach((c) => { c.style.display = ""; });
        s.querySelectorAll<HTMLElement>("[data-savebar]").forEach((b) => { b.style.display = ""; });
      });
      setHits(null);
      try { sessionStorage.setItem("settings.section", active); } catch {}
      return;
    }
    let total = 0;
    sections.forEach((s) => {
      let anyVisible = false;
      s.querySelectorAll<HTMLElement>("[data-card]").forEach((c) => {
        const match = (c.dataset.search ?? "").includes(q);
        c.style.display = match ? "" : "none";
        if (match) { anyVisible = true; total += 1; }
      });
      // Hide save-bars while searching — saving from a filtered view is confusing.
      s.querySelectorAll<HTMLElement>("[data-savebar]").forEach((b) => { b.style.display = "none"; });
      s.style.display = anyVisible ? "block" : "none";
    });
    setHits(total);
  }, [active, query]);

  function pick(id: string) {
    setQuery("");
    setActive(id);
  }

  if (studio) {
    const count = (g: SettingsGroup) => g.cards.length;
    return (
      <div ref={studioRoot} className="st-settings flex flex-col gap-5">
        <SettingsSaveDock root={studioRoot} />
        <div data-page-header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-2">
            <h1 className="m-0 whitespace-nowrap text-[40px] font-medium leading-[0.95] tracking-[-0.035em] sm:text-[56px]">{studio.title}</h1>
            <label className="flex h-[38px] w-full max-w-[420px] items-center gap-2 rounded-[11px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[var(--st-muted)] sm:w-[420px]">
              <Search size={15} />
              <span className="sr-only">Search settings</span>
              <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings — e.g. “password”, “WhatsApp”, “quiet hours”"
                style={{ background: "transparent", border: 0, boxShadow: "none", color: "var(--st-ink)" }}
                className="bare-field h-full w-full text-[13px] outline-none" />
              {searching && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="text-[var(--st-muted)] hover:text-[var(--st-ink)]"><X size={14} /></button>}
            </label>
          </div>
          {studio.note}
        </div>
        {studio.top}
        {/* Phone: ONE line that scrolls sideways — wrapped, the seven sections
            took three rows. From sm they wrap as before. */}
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          {groups.map((g) => {
            const on = !searching && active === g.id;
            return (
              <button key={g.id} type="button" aria-pressed={on} onClick={() => pick(g.id)}
                className={cn("flex h-[34px] shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] border px-3.5 text-[13px] transition-colors",
                  on ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-surface)]" : "border-[var(--st-line)] bg-[var(--st-surface)] hover:bg-[var(--st-page)]")}>
                {g.label}<span className="text-[11px] opacity-60">{count(g)}</span>
              </button>
            );
          })}
          <span className="flex-1" />
          {searching && <span className="text-xs text-[var(--st-muted)]">{hits === 0 ? "No matching settings." : `${hits} setting${hits === 1 ? "" : "s"} found`}</span>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }

  return (
    <div className="mt-5 lg:grid lg:grid-cols-[13rem_1fr] lg:gap-6">
      <div className="lg:sticky lg:top-20 lg:self-start">
        {/* Search — above everything, jumps across all groups */}
        <div className="relative mb-3">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="h-9 w-full rounded-xl border border-border bg-bg-elev/70 pl-9 pr-8 text-sm text-fg outline-none ring-accent/30 transition placeholder:text-fg-subtle focus:border-accent/40 focus:ring-2"
          />
          {searching && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-muted hover:text-fg"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {searching ? (
          <p className="px-1 text-xs text-fg-muted lg:px-0">
            {hits === 0 ? "No matching settings." : `${hits} setting${hits === 1 ? "" : "s"} found`}
          </p>
        ) : (
          <>
            {/* Mobile: horizontal chips */}
            <nav className="lg:hidden -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {groups.map((g) => {
                const Icon = icon(g.icon);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => pick(g.id)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 transition-colors",
                      active === g.id ? "bg-accent text-accent-fg ring-accent" : "bg-bg-subtle/70 text-fg-muted ring-border hover:text-fg",
                    )}
                  >
                    <Icon size={13} /> {g.label}
                  </button>
                );
              })}
            </nav>

            {/* Desktop: vertical rail */}
            <nav className="hidden lg:block space-y-0.5">
              {groups.map((g) => {
                const Icon = icon(g.icon);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => pick(g.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-base transition-colors",
                      active === g.id ? "bg-accent-soft font-medium text-accent" : "text-fg-muted hover:bg-bg-muted/50 hover:text-fg",
                    )}
                  >
                    <Icon size={15} className="shrink-0" /> {g.label}
                  </button>
                );
              })}
            </nav>
          </>
        )}
      </div>

      <div className="min-w-0 space-y-3">{children}</div>
    </div>
  );
}
