"use client";

/**
 * Studio Phase 2 — the frame and the footer that replace the sidebar and the
 * floating nav pill (mockup boards `Main`, `Footer`, `GoTo`).
 *
 * ⚠️ THE PAGE STILL SCROLLS THE DOCUMENT. The mockup draws the page inside a
 * rounded panel with its own scroll; doing that for real would make `main` a
 * scroll box, and every "go back to where you were" mechanism in COS reads
 * `window.scrollY` (see CLAUDE.md, "Going back from a record"). So the panel is
 * an ILLUSION: a fixed, click-through ring whose huge dark box-shadow paints
 * everything OUTSIDE a rounded rectangle. Content scrolls under it and is
 * clipped at the rounded corners exactly as in the mockup.
 *
 * Page order comes from `studioStops()`, which is derived from nav.ts — the
 * footer can never list a page the rest of COS does not know about.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, Home, Plus, Search, Settings as SettingsIcon, X } from "lucide-react";
import { studioStops, stopIndexFor, type StudioStop } from "@/lib/studio-nav";
import { useCommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { StudioQuickAdd } from "./quick-add";
import { ThemeToggle } from "@/components/theme-toggle";
import { useNavVisibility, isHiddenNavHref } from "@/components/nav-visibility";
import { cn } from "@/lib/cn";

export type StudioFootNote = { label: string; text: string; href?: string } | null;

const FOOT_BTN =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-[#2A2C30] bg-transparent text-xs text-[#A3A6AB] transition-colors hover:border-[#3A3D42] hover:text-[#F2F2F0]";

export function StudioShell({ nextDeadline }: { nextDeadline: StudioFootNote }) {
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const router = useRouter();
  const vis = useNavVisibility();
  const { open: openPalette } = useCommandPalette();
  const [goTo, setGoTo] = useState(false);
  const [quick, setQuick] = useState(false);

  const stops = useMemo(() => studioStops().filter((s) => !isHiddenNavHref(s.href, vis)), [vis]);
  const tab = params.get("tab");
  const here = studioStops()[stopIndexFor(pathname, tab)];
  let i = stops.findIndex((s) => s.id === here?.id);
  if (i < 0) i = 0;
  const current = stops[i];
  const prev = stops[(i - 1 + stops.length) % stops.length];
  const next = stops[(i + 1) % stops.length];
  const onHome = pathname === "/" && tab !== "tasks";
  const onSettings = pathname.startsWith("/settings");

  // Close the panels whenever the page changes.
  useEffect(() => { setGoTo(false); setQuick(false); }, [pathname, tab]);
  // What "+ New" makes on this page — the card opens on that tab.
  const newWord = pathname.startsWith("/people") ? "person"
    : pathname.startsWith("/companies") ? "company"
    : pathname.startsWith("/documents") ? "document"
    : pathname.startsWith("/calendar") ? "event"
    : pathname.startsWith("/notes") ? "note"
    : pathname.startsWith("/announcements") ? "announcement"
    : "task";

  // The left-hand note: on a task record say where you are; everywhere else,
  // the next thing due.
  const recordCode = /^\/task\/([A-Za-z0-9]+-\d+)$/.exec(pathname)?.[1];
  const note: StudioFootNote = recordCode
    ? { label: "You are in", text: `Tasks › ${recordCode}` }
    : nextDeadline;

  // Chat is a full-screen app on a phone; the footer steps aside there, as the
  // pill did.
  const chat = pathname.startsWith("/chat");

  return (
    <>
      {/* The frame. Click-through; paints only OUTSIDE the rounded panel. */}
      <div data-studio-frame aria-hidden className="studio-frame" />

      <footer
        data-studio-foot
        className={cn(
          "fixed inset-x-0 bottom-0 z-[41] h-[calc(64px+env(safe-area-inset-bottom))] bg-[#0E0F10] pb-[env(safe-area-inset-bottom)] text-[#F2F2F0]",
          "[font-family:var(--font-geist),var(--font-sans)]",
          chat && "max-md:hidden",
        )}
      >
        <div className="grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-5">
          {/* Left: the next deadline (hidden on a phone — no room). */}
          <div className="hidden min-w-0 md:block">
            {note && (
              <>
                <div className="text-[11px] text-[#8E9197]">{note.label}</div>
                {note.href ? (
                  <Link href={note.href} className="block truncate text-[13px] text-[#F2F2F0] hover:underline">{note.text}</Link>
                ) : (
                  <div className="truncate text-[13px]">{note.text}</div>
                )}
              </>
            )}
          </div>

          {/* Centre: Home · ‹ page › · Settings */}
          <nav aria-label="Pages" className="col-start-1 flex items-center gap-1 text-[13px] md:col-start-auto md:gap-3 lg:gap-[22px]">
            <Link
              href="/"
              aria-label="Home"
              className={cn("flex h-9 items-center gap-[7px] rounded-[10px] px-2 transition-colors hover:text-white md:px-0", onHome ? "text-white" : "text-[#8E9197]")}
            >
              <Home size={16} strokeWidth={2} />
              <span className="hidden lg:inline">Home</span>
            </Link>
            <div className="flex items-center gap-1 rounded-xl border border-[#2A2C30] bg-[#1C1D20] p-[3px]">
              <Link
                href={prev.href}
                aria-label={`Previous page: ${prev.label}`}
                title={prev.label}
                className="flex h-7 w-7 items-center justify-center rounded-[9px] text-[#A3A6AB] transition-colors hover:bg-[#2A2C30] hover:text-white"
              >
                <ChevronLeft size={13} strokeWidth={2.2} />
              </Link>
              <button
                type="button"
                onClick={() => setGoTo((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={goTo}
                title="Go to any page"
                className="flex h-7 min-w-[96px] max-w-[46vw] items-center justify-center gap-2 rounded-[9px] bg-[#2A2C30] px-3 font-medium text-white"
              >
                <span className="truncate">{current.label}</span>
                <ChevronUp size={11} strokeWidth={2.2} className={cn("shrink-0 transition-transform", goTo && "rotate-180")} />
              </button>
              <Link
                href={next.href}
                aria-label={`Next page: ${next.label}`}
                title={next.label}
                className="flex h-7 w-7 items-center justify-center rounded-[9px] text-[#A3A6AB] transition-colors hover:bg-[#2A2C30] hover:text-white"
              >
                <ChevronRight size={13} strokeWidth={2.2} />
              </Link>
            </div>
            <Link
              href="/settings"
              aria-label="Settings"
              className={cn("flex h-9 items-center gap-[7px] rounded-[10px] px-2 transition-colors hover:text-white md:px-0", onSettings ? "text-white" : "text-[#8E9197]")}
            >
              <SettingsIcon size={16} strokeWidth={2} />
              <span className="hidden lg:inline">Settings</span>
            </Link>
          </nav>

          {/* Right: search everything · notifications · + New */}
          <div className="col-start-3 flex items-center justify-end gap-2">
            {/* Ask ORI or search — the palette (mockup board Ask). */}
            <button type="button" onClick={openPalette} aria-label="Ask ORI or search everything (⌘K)" className={cn(FOOT_BTN, "hidden pl-3 pr-2 sm:inline-flex")}>
              <Search size={14} />
              <span className="hidden min-w-[110px] text-left text-[#C9CBCF] lg:inline">Ask or search</span>
              <span className="rounded-[5px] bg-[#1F2023] px-1.5 py-px text-[11px] text-[#8E9197]">⌘K</span>
            </button>
            <NotificationBell
              to="/task"
              align="right"
              lanes
              variant="studio"
              triggerClassName="relative inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#2A2C30] text-[#C9CBCF] transition-colors hover:border-[#3A3D42] hover:text-white"
            />
            {/* "+ New" opens the one create card (mockup board QuickAdd). */}
            <button
              type="button"
              onClick={() => setQuick(true)}
              aria-haspopup="dialog"
              aria-expanded={quick}
              aria-label="Create something new"
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#F2F2F0] px-2.5 text-[13px] font-semibold text-[#111214] transition-opacity hover:opacity-90 sm:px-3.5"
            >
              <Plus size={14} strokeWidth={2.4} /><span className="hidden sm:inline">New {newWord}</span>
            </button>
          </div>
        </div>
      </footer>

      {quick && <StudioQuickAdd onClose={() => setQuick(false)} />}

      {goTo && (
        <GoToPanel
          stops={stops}
          current={current}
          prev={prev}
          next={next}
          onClose={() => setGoTo(false)}
          onGo={(href) => { setGoTo(false); router.push(href); }}
          onSearch={() => { setGoTo(false); openPalette(); }}
        />
      )}
    </>
  );
}

function GoToPanel({
  stops, current, prev, next, onClose, onGo, onSearch,
}: {
  stops: StudioStop[];
  current: StudioStop;
  prev: StudioStop;
  next: StudioStop;
  onClose: () => void;
  onGo: (href: string) => void;
  onSearch: () => void;
}) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const shown = needle ? stops.filter((s) => s.label.toLowerCase().includes(needle) || s.group.toLowerCase().includes(needle)) : stops;
  const groups: { label: string; items: StudioStop[] }[] = [];
  for (const s of shown) {
    const g = groups.find((x) => x.label === s.group);
    if (g) g.items.push(s); else groups.push({ label: s.group, items: [s] });
  }

  return (
    <div data-studio-goto className="fixed inset-0 z-[45]" role="dialog" aria-label="Go to a page">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-[rgba(14,15,16,0.35)]" />
      <div
        className="st-sheet st-sheet-dots st-pop absolute inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] mx-auto flex max-h-[calc(100dvh-100px)] max-w-[1080px] flex-col gap-4 overflow-y-auto rounded-3xl bg-[var(--sh-bg)] p-4 text-[var(--sh-fg)] shadow-[0_30px_80px_rgba(0,0,0,0.4)] [font-family:var(--font-geist),var(--font-sans)] sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-11 min-w-0 flex-1 basis-60 items-center gap-2.5 rounded-xl border border-[var(--sh-chip-line)] bg-[var(--sh-field)] px-3.5 text-[var(--sh-muted)]">
            <Search size={16} />
            <span className="sr-only">Find a page</span>
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) onGo(shown[0].href); }}
              placeholder="Go to a page — type a few letters"
              className="bare-field w-full border-0 bg-transparent text-sm text-[var(--sh-fg)] outline-none placeholder:text-[var(--sh-muted)]"
            />
          </label>
          <button type="button" onClick={() => onGo(prev.href)} className="flex h-11 items-center gap-2 rounded-xl border border-[var(--sh-chip-line)] px-3.5 text-[13px] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]">
            <ChevronLeft size={13} strokeWidth={2.2} />{prev.label}
          </button>
          <button type="button" onClick={() => onGo(next.href)} className="flex h-11 items-center gap-2 rounded-xl border border-[var(--sh-chip-line)] px-3.5 text-[13px] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]">
            {next.label}<ChevronRight size={13} strokeWidth={2.2} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--sh-chip-line)] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]">
            <X size={15} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {groups.map((g) => (
            <div key={g.label} className="flex min-w-0 flex-col gap-2">
              <div className="px-1 text-[11px] uppercase tracking-[0.08em] text-[var(--sh-muted)]">{g.label}</div>
              {g.items.map((s) => {
                const on = s.id === current.id;
                const Icon = s.icon;
                return (
                  <Link
                    key={s.id}
                    href={s.href}
                    onClick={onClose}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors",
                      on ? "bg-[var(--sh-on-bg)] text-[var(--sh-on-fg)]" : "border border-[var(--sh-line)] bg-[var(--sh-card)] text-[var(--sh-fg)] hover:border-[var(--sh-field-line)]",
                    )}
                  >
                    <span className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]", on ? "bg-[var(--sh-hover)]" : "bg-[var(--sh-hover)]")}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-medium">{s.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          {groups.length === 0 && <div className="col-span-full py-6 text-center text-sm text-[var(--sh-muted)]">No page called “{q}”.</div>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--sh-muted)]">
          <span>‹ and › in the footer step through the pages in this order</span>
          <span className="flex items-center gap-3">
            <button type="button" onClick={onSearch} className="text-[var(--sh-sub)] hover:text-[var(--sh-fg)]">⌘K searches every record</button>
            <span className="[&_button]:text-[var(--sh-sub)]"><ThemeToggle /></span>
          </span>
        </div>
      </div>
    </div>
  );
}
