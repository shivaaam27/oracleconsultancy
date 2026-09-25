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
import { ChevronLeft, ChevronRight, ChevronUp, Home, LogOut, Moon, Plus, Search, Sun, Settings as SettingsIcon, UserRound, X } from "lucide-react";
import { adminLogout } from "@/app/login/actions";
import { portalLogout } from "@/app/portal/actions";
import { studioStops, stopIndexFor, directorStops, directorStopIndex, type StudioStop } from "@/lib/studio-nav";
import { useCommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { StudioQuickAdd } from "./quick-add";
import { useTheme } from "next-themes";
import { useNavVisibility, isHiddenNavHref } from "@/components/nav-visibility";
import { cn } from "@/lib/cn";
import { FOOT_NOTE_EVENT, type PageFootNote } from "./foot-note";

export type StudioFootNote = { label: string; text: string; href?: string; tone?: "late" | "soon" | "info" } | null;

const FOOT_BTN =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-[#2A2C30] bg-transparent text-xs text-[#D4D6DA] transition-colors hover:border-[#3A3D42] hover:text-[#F2F2F0]";

/** A director on the shared screens (lib/viewer.ts): their own pages in the
 *  footer, their profile instead of Settings, no everything-search, and "+ New"
 *  makes a task (the one thing they create here). */
export type ShellDirector = { name: string; outbox: boolean; createTasks: boolean };

export function StudioShell({ needs, director = null }: { needs: NonNullable<StudioFootNote>[]; director?: ShellDirector | null }) {
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const router = useRouter();
  const vis = useNavVisibility();
  const { open: openPalette } = useCommandPalette();
  const [goTo, setGoTo] = useState(false);
  const [quick, setQuick] = useState(false);
  const [quickTab, setQuickTab] = useState<string | undefined>(undefined);
  // A page can open the card on its own tab ("Add person" on People):
  // window.dispatchEvent(new CustomEvent("studio:new", { detail: { tab: "person" } })).
  useEffect(() => {
    const onNew = (e: Event) => { setQuickTab((e as CustomEvent<{ tab?: string }>).detail?.tab); setQuick(true); };
    window.addEventListener("studio:new", onNew);
    return () => window.removeEventListener("studio:new", onNew);
  }, []);

  // A page's own footer line (useStudioFootNote), if it set one for this path.
  const [pageNote, setPageNote] = useState<PageFootNote>(null);
  useEffect(() => {
    setPageNote(window.__studioFootNote ?? null);
    const on = (e: Event) => setPageNote((e as CustomEvent<PageFootNote>).detail);
    window.addEventListener(FOOT_NOTE_EVENT, on);
    return () => window.removeEventListener(FOOT_NOTE_EVENT, on);
  }, []);

  const directorOutbox = director?.outbox ?? false;
  const isDirector = !!director;
  const stops = useMemo(
    () => (isDirector ? directorStops({ outbox: directorOutbox }) : studioStops().filter((s) => !isHiddenNavHref(s.href, vis))),
    [vis, isDirector, directorOutbox],
  );
  const tab = params.get("tab");
  let i: number;
  if (director) {
    i = directorStopIndex(stops, pathname, tab);
  } else {
    const here = studioStops()[stopIndexFor(pathname, tab)];
    i = stops.findIndex((s) => s.id === here?.id);
    if (i < 0) i = 0;
  }
  const current = stops[i];
  const prev = stops[(i - 1 + stops.length) % stops.length];
  const next = stops[(i + 1) % stops.length];
  const onHome = pathname === "/" && tab !== "tasks";

  /* ── Scroll or swipe through the pages (owner, 25 Sept 2026) ─────────────
     Over the ‹ page › pill a mouse wheel (or a trackpad, either direction)
     steps the name through the pages AT ONCE, and the page follows when the
     wheel comes to rest — so flicking past three pages loads only the one you
     stop on. On a phone a sideways swipe on the pill goes one page.
     The pages either side are loaded in advance (`prefetch` on the arrows and
     below), so a step lands without a loading screen. */
  const [pending, setPending] = useState<number | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const shown = pending ?? i;
  const pill = useRef<HTMLDivElement>(null);
  const wheel = useRef({ acc: 0, timer: 0 as number | ReturnType<typeof setTimeout>, at: i });
  wheel.current.at = pending ?? i;
  useEffect(() => { setPending(null); }, [pathname, tab]);
  useEffect(() => { router.prefetch(prev.href); router.prefetch(next.href); }, [router, prev.href, next.href]);
  useEffect(() => {
    const el = pill.current;
    if (!el || stops.length < 2) return;
    const go = (to: number) => { if (to !== i) router.push(stops[to].href); else setPending(null); };
    const step = (d: 1 | -1) => {
      const to = (wheel.current.at + d + stops.length) % stops.length;
      wheel.current.at = to;
      setDir(d);
      setPending(to);
      router.prefetch(stops[to].href);
      return to;
    };
    const onWheel = (e: WheelEvent) => {
      // The pill takes the wheel: the page underneath must not scroll too.
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      wheel.current.acc += e.deltaMode === 1 ? d * 16 : d;
      if (Math.abs(wheel.current.acc) >= 60) {
        step(wheel.current.acc > 0 ? 1 : -1);
        wheel.current.acc = 0;
      }
      clearTimeout(wheel.current.timer);
      wheel.current.timer = setTimeout(() => { wheel.current.acc = 0; go(wheel.current.at); }, 420);
    };
    let x0: number | null = null, y0 = 0;
    const onStart = (e: TouchEvent) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      // Sideways and deliberate; a tap on the name still opens the menu.
      if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      e.preventDefault();
      go(step(dx < 0 ? 1 : -1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      clearTimeout(wheel.current.timer);
    };
  }, [i, stops, router]);
  const onSettings = pathname.startsWith("/settings");

  // Close the panels whenever the page changes.
  useEffect(() => { setGoTo(false); setQuick(false); }, [pathname, tab]);
  // What "+ New" makes on this page — the card opens on that tab.
  const onFiles = pathname.startsWith("/files");
  const newWord = pathname.startsWith("/people") ? "person"
    : pathname.startsWith("/companies") ? "company"
    : pathname.startsWith("/files") ? "document"
    : pathname.startsWith("/calendar") ? "event"
    : pathname.startsWith("/notes") ? "note"
    : pathname.startsWith("/announcements") ? "announcement"
    : "task";

  // The left corner: "What needs you now" (StudioShellServer). A page's own
  // line (useStudioFootNote), when it set one, leads — it is about THIS page.
  const own = pageNote && pageNote.path === pathname ? pageNote.note : null;
  const items = own ? [own, ...needs] : needs;

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
          "fixed inset-x-0 bottom-0 z-[41] h-[calc(var(--foot-h)+env(safe-area-inset-bottom))] bg-[#0E0F10] pb-[env(safe-area-inset-bottom)] text-[#F2F2F0]",
          "[font-family:var(--font-geist),var(--font-sans)]",
          chat && "max-md:hidden",
        )}
      >
        <div className="grid h-[var(--foot-h)] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3.5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-5">
          {/* Left: what needs you now (hidden on a phone — no room). */}
          <div className="hidden min-w-0 md:block">
            <NeedsTicker items={items} />
          </div>

          {/* Centre: Home · ‹ page › · Settings */}
          <nav aria-label="Pages" className="flex min-w-0 items-center gap-1.5 text-[13px] md:gap-3 lg:gap-[22px]">
            <Link
              href="/"
              aria-label="Home"
              className={cn("flex h-11 w-11 shrink-0 items-center justify-center gap-[7px] rounded-[12px] transition-colors hover:text-white md:h-9 md:w-auto md:justify-start md:px-0", onHome ? "text-white" : "text-[#B4B7BC]")}
            >
              <Home size={16} strokeWidth={2} />
              <span className="hidden lg:inline">Home</span>
            </Link>
            <div ref={pill} title="Scroll or swipe to move between pages" className="flex touch-pan-y items-center gap-0.5 rounded-[13px] border border-[#2A2C30] bg-[#1C1D20] p-[3px] md:gap-1 md:rounded-xl">
              <Link
                href={prev.href}
                prefetch
                onClick={() => { setDir(-1); setPending((i - 1 + stops.length) % stops.length); }}
                aria-label={`Previous page: ${prev.label}`}
                title={prev.label}
                className="flex h-[38px] w-11 items-center justify-center rounded-[10px] text-[#D4D6DA] transition-colors hover:bg-[#2A2C30] hover:text-white md:h-7 md:w-7 md:rounded-[9px]"
              >
                <ChevronLeft size={13} strokeWidth={2.2} />
              </Link>
              <button
                type="button"
                onClick={() => setGoTo((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={goTo}
                title="Go to any page"
                className="flex h-[38px] min-w-[96px] max-w-[40vw] items-center justify-center gap-2 overflow-hidden rounded-[10px] bg-[#2A2C30] px-3 text-[14px] font-medium text-white md:h-7 md:min-w-[96px] md:rounded-[9px] md:text-[13px] md:max-w-[46vw]"
              >
                {/* The name slides the way you are going, the moment you ask —
                    before the page has arrived, so the step never feels stuck. */}
                <span key={shown} className={cn("truncate", shown !== i || pending != null ? (dir > 0 ? "st-slide-l" : "st-slide-r") : undefined)}>{stops[shown]?.label ?? current.label}</span>
                <ChevronUp size={11} strokeWidth={2.2} className={cn("shrink-0 transition-transform", goTo && "rotate-180")} />
              </button>
              <Link
                href={next.href}
                prefetch
                onClick={() => { setDir(1); setPending((i + 1) % stops.length); }}
                aria-label={`Next page: ${next.label}`}
                title={next.label}
                className="flex h-[38px] w-11 items-center justify-center rounded-[10px] text-[#D4D6DA] transition-colors hover:bg-[#2A2C30] hover:text-white md:h-7 md:w-7 md:rounded-[9px]"
              >
                <ChevronRight size={13} strokeWidth={2.2} />
              </Link>
            </div>
            {director ? (
              <Link
                href="/portal/profile"
                aria-label="Your profile"
                className="hidden h-9 items-center gap-[7px] rounded-[10px] px-2 text-[#B4B7BC] transition-colors hover:text-white sm:flex md:px-0"
              >
                <UserRound size={16} strokeWidth={2} />
                <span className="hidden lg:inline">Profile</span>
              </Link>
            ) : (
            <Link
              href="/settings"
              aria-label="Settings"
              className={cn("hidden h-9 items-center gap-[7px] rounded-[10px] px-2 transition-colors hover:text-white sm:flex md:px-0", onSettings ? "text-white" : "text-[#B4B7BC]")}
            >
              <SettingsIcon size={16} strokeWidth={2} />
              <span className="hidden lg:inline">Settings</span>
            </Link>
            )}
          </nav>

          {/* Right: search everything · notifications · + New */}
          <div className="flex items-center justify-end gap-2 md:col-start-3">
            {/* Ask ORI or search — the palette (mockup board Ask). */}
            <button type="button" onClick={openPalette} aria-label="Ask ORI or search everything (⌘K)" className={cn(FOOT_BTN, "hidden pl-3 pr-2", !director && "sm:inline-flex")}>
              <Search size={14} />
              <span className="hidden min-w-[110px] text-left text-[#C9CBCF] lg:inline">Ask or search</span>
              <span className="rounded-[5px] bg-[#1F2023] px-1.5 py-px text-[11px] text-[#B4B7BC]">⌘K</span>
            </button>
            {/* Sign out — the owner's session, or a director's portal one. It
                lived only at the foot of Settings, which nobody finds (owner,
                25 Sept 2026: "how do you expect me to log out"). */}
            <form action={director ? portalLogout : adminLogout} className="hidden sm:block">
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#2A2C30] text-[#C9CBCF] transition-colors hover:border-[#3A3D42] hover:text-white"
              >
                <LogOut size={15} />
              </button>
            </form>
            <NotificationBell
              to="/task"
              align="right"
              lanes
              variant="studio"
              triggerClassName="relative inline-flex h-11 w-11 items-center justify-center rounded-[12px] border border-[#2A2C30] text-[#C9CBCF] transition-colors hover:border-[#3A3D42] hover:text-white sm:h-9 sm:w-9 sm:rounded-[10px]"
            />
            {/* "+ New" opens the one create card (mockup board QuickAdd). */}
            {(!director || director.createTasks) && (
            <button
              type="button"
              onClick={() => {
                // A director makes tasks only: straight to the new-task page.
                if (director) { const q = params.toString(); router.push(`/task/new?returnTo=${encodeURIComponent(q ? `${pathname}?${q}` : pathname)}`); return; }
                if (onFiles) { window.dispatchEvent(new Event("files:upload")); return; }
                setQuickTab(undefined); setQuick(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={quick}
              aria-label="Create something new"
              className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] bg-[#F2F2F0] px-2.5 text-[13px] font-semibold text-[#111214] transition-opacity hover:opacity-90 sm:h-9 sm:rounded-[10px] sm:px-3.5"
            >
              {/* The owner's footer carries three more buttons than a
                  director's, so on a tablet the word did not fit ("New task"
                  on two lines, "Upload" cut off): the + alone until lg. */}
              <Plus size={14} strokeWidth={2.4} /><span className={cn("hidden", director ? "sm:inline" : "lg:inline")}>{director ? "New task" : onFiles ? "Upload" : `New ${newWord}`}</span>
            </button>
            )}
          </div>
        </div>
      </footer>

      {quick && <StudioQuickAdd initialTab={quickTab} onClose={() => setQuick(false)} />}

      {goTo && (
        <GoToPanel
          stops={stops}
          current={current}
          prev={prev}
          next={next}
          onClose={() => setGoTo(false)}
          onGo={(href) => { setGoTo(false); router.push(href); }}
          onSearch={director ? undefined : () => { setGoTo(false); openPalette(); }}
          me={director
            ? { name: director.name, role: "Director", profile: "/portal/profile", profileLabel: "Profile", logout: portalLogout }
            : { name: "Administrator", role: "Every company", profile: "/settings", profileLabel: "Settings", logout: adminLogout }}
        />
      )}
    </>
  );
}

type GoToMe = { name: string; role: string; profile: string; profileLabel: string; logout: () => Promise<void> | void };

function GoToPanel({
  stops, current, prev, next, onClose, onGo, onSearch, me,
}: {
  me: GoToMe;
  stops: StudioStop[];
  current: StudioStop;
  prev: StudioStop;
  next: StudioStop;
  onClose: () => void;
  onGo: (href: string) => void;
  /** Absent for a director — they have no palette. */
  onSearch?: () => void;
}) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [shortcut, setShortcut] = useState("Ctrl K");
  useEffect(() => { if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("⌘K"); }, []);
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
        className="st-sheet st-sheet-dots st-pop absolute inset-x-0 bottom-0 mx-auto flex max-h-[calc(100dvh-60px)] max-w-[1080px] flex-col gap-4 overflow-y-auto rounded-t-[26px] bg-[var(--sh-bg)] px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-2 text-[var(--sh-fg)] shadow-[0_30px_80px_rgba(0,0,0,0.4)] [font-family:var(--font-geist),var(--font-sans)] sm:inset-x-3 sm:bottom-[calc(var(--foot-h)+env(safe-area-inset-bottom)+8px)] sm:rounded-3xl sm:p-5"
      >
        {/* Phone: the sheet's grabber, then who you are with Profile and Sign
            out — they left the footer so the footer fits a thumb. */}
        <span aria-hidden className="mx-auto h-[5px] w-10 shrink-0 rounded-full bg-[var(--sh-chip-line)] sm:hidden" />
        <div className="flex items-center gap-3 border-b border-[var(--sh-line)] pb-3 sm:hidden">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--sh-hover)] text-sm font-semibold">{initialsOf(me.name)}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{me.name}</div>
            <div className="truncate text-xs text-[var(--sh-muted)]">{me.role}</div>
          </div>
          <ShellThemeButton />
        </div>
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
          <button type="button" onClick={() => onGo(prev.href)} className="hidden h-11 items-center gap-2 rounded-xl border border-[var(--sh-chip-line)] px-3.5 text-[13px] text-[var(--sh-sub)] hover:text-[var(--sh-fg)] sm:flex">
            <ChevronLeft size={13} strokeWidth={2.2} />{prev.label}
          </button>
          <button type="button" onClick={() => onGo(next.href)} className="hidden h-11 items-center gap-2 rounded-xl border border-[var(--sh-chip-line)] px-3.5 text-[13px] text-[var(--sh-sub)] hover:text-[var(--sh-fg)] sm:flex">
            {next.label}<ChevronRight size={13} strokeWidth={2.2} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--sh-chip-line)] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]">
            <X size={15} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:hidden">
          {shown.map((s) => {
            const on = s.id === current.id;
            const Icon = s.icon;
            return (
              <Link key={s.id} href={s.href} onClick={onClose} aria-current={on ? "page" : undefined}
                className={cn("flex h-[68px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[14px] px-1 text-xs",
                  on ? "bg-[var(--sh-on-bg)] text-[var(--sh-on-fg)]" : "bg-[var(--sh-card)] text-[var(--sh-fg)]")}>
                <Icon size={17} />
                <span className="w-full truncate text-center">{s.label}</span>
              </Link>
            );
          })}
          {shown.length === 0 && <div className="col-span-full py-6 text-center text-sm text-[var(--sh-muted)]">No page called “{q}”.</div>}
        </div>
        <div className="flex gap-2 sm:hidden">
          <Link href={me.profile} onClick={onClose} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--sh-chip-line)] text-sm">
            <UserRound size={15} />{me.profileLabel}
          </Link>
          <form action={me.logout} className="flex flex-1">
            <button type="submit" className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--sh-chip-line)] text-sm text-[#E0479E]">
              <LogOut size={15} />Sign out
            </button>
          </form>
        </div>

        <div className="hidden grid-cols-2 gap-4 sm:grid md:grid-cols-4">
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
                    {/* The tile on the selected (inverted) item is a tint of its own
                        text colour — a light tile there held a white icon in light
                        mode and a black one in dark, and the icon vanished. */}
                    <span
                      className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]", !on && "bg-[var(--sh-hover)] text-[var(--sh-sub)]")}
                      style={on ? { background: "color-mix(in srgb, var(--sh-on-fg) 16%, transparent)", color: "var(--sh-on-fg)" } : undefined}
                    >
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

        <div className="hidden flex-wrap items-center justify-between gap-2 border-t border-[var(--sh-line)] pt-3 text-xs text-[var(--sh-muted)] sm:flex">
          <span className="flex items-center gap-1.5">
            <span className={KEY}><ChevronLeft size={11} strokeWidth={2.4} /></span>
            <span className={KEY}><ChevronRight size={11} strokeWidth={2.4} /></span>
            <span className="ml-0.5">in the footer step through these pages in order</span>
          </span>
          <span className="flex items-center gap-2">
            {onSearch && (
              <button type="button" onClick={onSearch} className="flex h-8 items-center gap-2 rounded-lg border border-[var(--sh-chip-line)] px-2.5 text-[var(--sh-sub)] hover:text-[var(--sh-fg)]">
                <Search size={13} />Search every record<span className={KEY}>{shortcut}</span>
              </button>
            )}
            <ShellThemeButton />
          </span>
        </div>
      </div>
    </div>
  );
}

function initialsOf(name: string): string {
  const clean = name.replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

const KEY = "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-[var(--sh-chip-line)] bg-[var(--sh-card)] px-1 text-[10px] font-medium text-[var(--sh-sub)]";

/** Light / dark, drawn for the sheet. The shared ThemeToggle wears the Desk
 *  tokens (grey on grey here) and reads `theme`, so on "system" it showed the
 *  moon in a dark room; this reads what is actually on screen. */
function ShellThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sh-chip-line)] px-2.5 text-[var(--sh-sub)] hover:text-[var(--sh-fg)]"
    >
      {dark ? <Sun size={13} /> : <Moon size={13} />}{dark ? "Light" : "Dark"}
    </button>
  );
}

const TONE_DOT: Record<string, string> = { late: "#E0479E", soon: "#F5A524", info: "#2490EF" };

/** "What needs you now": one item at a time, the next every few seconds,
 *  still while the pointer (or focus) is on it so it can be read and clicked.
 *  Reduced motion: no stepping — the most urgent item stays. */
function NeedsTicker({ items }: { items: NonNullable<StudioFootNote>[] }) {
  const [i, setI] = useState(0);
  const [held, setHeld] = useState(false);
  const count = items.length;
  const sig = items.map((x) => x.label + x.text).join("|");
  useEffect(() => { setI(0); }, [sig]);
  useEffect(() => {
    if (count < 2 || held) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
    if (reduced) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % count), 5000);
    return () => window.clearInterval(t);
  }, [count, held]);
  const it = items[Math.min(i, count - 1)];
  if (!it) return null;
  return (
    <div
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
      aria-live="polite"
    >
      <div className="flex items-center gap-1.5 text-[11px] text-[#B4B7BC]">
        {it.tone && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE_DOT[it.tone] }} />}
        <span>{it.label}</span>
        {count > 1 && (
          <button type="button" onClick={() => setI((n) => (n + 1) % count)} title="Next" className="tabular-nums text-[#A3A6AB] hover:text-[#C9CBCF]">
            {Math.min(i, count - 1) + 1}/{count}
          </button>
        )}
      </div>
      <div key={i} className="st-slide-l">
        {it.href ? (
          <Link href={it.href} className="block truncate text-[13px] text-[#F2F2F0] hover:underline">{it.text}</Link>
        ) : (
          <div className="truncate text-[13px]">{it.text}</div>
        )}
      </div>
    </div>
  );
}
