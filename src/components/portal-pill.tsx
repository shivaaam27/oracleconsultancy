"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, CalendarClock, ClipboardList, Contact, Home, ListTodo, MessageCircle, Plus, Send, Sparkles, SprayCan, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { portalCapabilities } from "@/lib/portal-capabilities";
import { ThemeToggle } from "./theme-toggle";

/* The staff portal's own bottom-floating pill. Same liquid-glass language
 * as the admin pill (top-pill.tsx) but a deliberately tiny, fixed menu —
 * only safe destinations exist here, so staff can never reach admin pages. */

/* Adaptive labels: the pill breathes with the page. It condenses to icon-only
 * tabs while you scroll down (a calm, out-of-the-way thumb bar), and expands —
 * the active tab's label morphs back in (and every tab's label, where there's
 * room: tablet/desktop) — when you reach the top, scroll up, or pause. On the
 * web (lg+) it's always a full label bar. The active tab rides a sliding
 * accent-soft glass lens (shared layoutId). Reduced-motion: no slide/grow, the
 * labels just snap. */

/** Track a CSS media query on the client (false during SSR + first paint). */
function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** Condense while scrolling down; expand at the top, on scroll-up, or when the
 *  scroll pauses (~1.1s idle). Disabled (always expanded) when `enabled` is false. */
function useCondenseOnScroll(enabled: boolean): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!enabled) { setCompact(false); return; }
    // Read the scroll position from whichever element is the page scroller
    // (window / documentElement / body — varies by layout & browser), and use a
    // capture-phase listener so we catch the page scroll wherever it originates.
    const getY = () => window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    let lastY = getY();
    let idle: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      const y = getY();
      if (y < 24) setCompact(false);
      else if (y > lastY + 6) setCompact(true);
      else if (y < lastY - 6) setCompact(false);
      lastY = y;
      clearTimeout(idle);
      idle = setTimeout(() => setCompact(false), 1100);
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => { window.removeEventListener("scroll", onScroll, { capture: true }); clearTimeout(idle); };
  }, [enabled]);
  return compact;
}

/** Make the horizontal tab row navigable with a MOUSE on the web: a vertical
 *  wheel scrolls it sideways, and click-and-drag pans it (a real drag suppresses
 *  the click so you don't accidentally open a tab). Touch already pans natively. */
function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault(); }
    };
    let down = false, startX = 0, startLeft = 0, moved = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return; // touch scrolls natively
      down = true; moved = false; startX = e.clientX; startLeft = el.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) { moved = true; el.scrollLeft = startLeft - dx; }
    };
    const onUp = () => { down = false; };
    const onClickCapture = (e: MouseEvent) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } };
    // Live "there's more to scroll" cue: fade whichever edge has hidden tabs so the
    // next icon peeks out (see .nav-scroll in globals.css).
    const updatePeek = () => {
      const more = el.scrollWidth - el.clientWidth;
      if (more <= 2) { delete el.dataset.peekL; delete el.dataset.peekR; return; }
      if (el.scrollLeft > 2) el.dataset.peekL = "1"; else delete el.dataset.peekL;
      if (el.scrollLeft < more - 2) el.dataset.peekR = "1"; else delete el.dataset.peekR;
    };
    updatePeek();
    const ro = new ResizeObserver(updatePeek);
    ro.observe(el);
    el.addEventListener("scroll", updatePeek, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("resize", updatePeek);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updatePeek);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", updatePeek);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);
  return ref;
}

type NavTipData = { label: string; cx: number };
type TipFn = (t: NavTipData | null) => void;

/** Accepts the same props we hand a Lucide icon; lets custom SVGs stand in. */
type NavIcon = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

/** A tiny "layout preview" glyph for the Board tab (managers/directors): the wide
 *  welcome header, the slim compose bar, then the two working columns (Needs you +
 *  Company health) — a literal mini-map of the page it opens. */
function BoardLayoutIcon({ size = 24, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="5" rx="1.6" />
      <rect x="3" y="9.6" width="18" height="2.6" rx="1.1" fillOpacity="0.45" />
      <rect x="3" y="13.8" width="9.7" height="7.2" rx="1.6" />
      <rect x="14.1" y="13.8" width="6.9" height="7.2" rx="1.6" fillOpacity="0.45" />
    </svg>
  );
}

/** Layout preview for the staff Home tab: welcome header, the large tasks block,
 *  then the slim to-do list. */
function HomeLayoutIcon({ size = 24, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="5" rx="1.6" />
      <rect x="3" y="9.7" width="18" height="8.1" rx="1.6" fillOpacity="0.45" />
      <rect x="3" y="19.3" width="18" height="2.4" rx="1.1" />
    </svg>
  );
}

function PillTab({ href, icon: Icon, label, active, labelled: showLabel, reduce, tourTag, onTip }: { href: string; icon: NavIcon; label: string; active: boolean; labelled: boolean; reduce: boolean; tourTag?: string; onTip?: TipFn }) {
  const show = (el: HTMLElement) => { const r = el.getBoundingClientRect(); onTip?.({ label, cx: r.left + r.width / 2 }); };
  return (
    <Link
      href={href}
      aria-label={label}
      data-tour={tourTag}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => onTip?.(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => onTip?.(null)}
      onClick={() => onTip?.(null)}
      className={cn(
        "group relative inline-flex items-center justify-center gap-1.5 h-11 md:h-12 rounded-full shrink-0 transition-colors outline-none",
        // Hover fills with the soft accent (a clear "this is a button" cue) —
        // was too see-through before.
        active ? "text-accent px-3 md:px-3.5" : "text-fg-muted hover:text-accent hover:bg-accent-soft/60",
        showLabel ? (active ? "" : "px-3 md:px-3.5") : "w-11 md:w-12"
      )}
    >
      {active && (
        reduce ? (
          <span className="absolute inset-0 rounded-full bg-accent-soft" />
        ) : (
          <motion.span
            layoutId="portalpill"
            className="absolute inset-0 rounded-full bg-accent-soft"
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
          />
        )
      )}
      {/* Playful spring bounce on hover (motion-safe honours reduced motion). */}
      <Icon size={18} strokeWidth={active ? 2.4 : 2} className="relative shrink-0 transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] motion-safe:group-hover:scale-125" />
      {showLabel && <span className="relative whitespace-nowrap text-[13px] font-medium">{label}</span>}
    </Link>
  );
}

/** A frosted name-label that floats ABOVE the hovered icon (replaces the OS's
 *  black title tooltip). Positioned ABSOLUTELY inside the pill (which isn't
 *  clipped, unlike the inner scroll row) and zoom-corrected: the portal renders
 *  at `zoom: 0.8` on the web, so we divide the viewport delta by the pill's
 *  effective zoom to land the label dead-centre over the icon. */
function NavTip({ tip, containerRef }: { tip: NavTipData | null; containerRef: React.RefObject<HTMLDivElement | null> }) {
  if (!tip) return null;
  const el = containerRef.current;
  let left = tip.cx;
  if (el) {
    const cr = el.getBoundingClientRect();
    const zoom = el.offsetWidth ? cr.width / el.offsetWidth : 1;
    left = (tip.cx - cr.left) / (zoom || 1);
  }
  return (
    <div
      style={{ position: "absolute", left, bottom: "calc(100% + 10px)", transform: "translateX(-50%)" }}
      className="pointer-events-none z-[60] whitespace-nowrap rounded-lg glass px-2.5 py-1 text-[11px] font-semibold text-fg shadow-pill"
    >
      {tip.label}
    </div>
  );
}

export function PortalPill({ canCreate = false, canOri = false, role, tabOverrides }: {
  canCreate?: boolean;
  /** Show the ORI search/ask entry — gated on me.caps.oriAsk (resolved
   *  server-side). Opens the scoped portal command surface. */
  canOri?: boolean;
  role?: string;
  /** Owner-configurable tab visibility (Settings → Portals → Roles & permissions),
   *  resolved server-side and passed in. When omitted, the built-in defaults from
   *  portalCapabilities apply. */
  tabOverrides?: Partial<{ tasks: boolean; outbox: boolean; insights: boolean; cleaning: boolean }>;
}) {
  const pathname = usePathname() || "/portal";
  // Role capabilities come from the single registry (src/lib/portal-capabilities.ts)
  // for the STRUCTURAL tabs (board/home/directory/chat/…). The three configurable
  // tabs (tasks/outbox/insights) honour the owner's per-role toggles when provided
  // via tabOverrides.
  const caps = portalCapabilities(role);
  const showBoard = caps.tabs.board;
  const showHome = caps.tabs.home;
  const showTasks = tabOverrides?.tasks ?? caps.tabs.tasks;
  const showOutbox = tabOverrides?.outbox ?? caps.tabs.outbox;
  const showInsights = tabOverrides?.insights ?? caps.tabs.insights;
  // Cleaning also honours the owner's per-role cap (cleaningLog / cleaningOverview)
  // when provided — the raw isReceptionist||isManagement default is just the fallback.
  const showCleaning = tabOverrides?.cleaning ?? caps.tabs.cleaning;
  const onCleaning = pathname.startsWith("/portal/cleaning");
  const onBoard = pathname.startsWith("/portal/board");
  const onTasks = pathname.startsWith("/portal/tasks");
  const onDirectory = pathname.startsWith("/portal/directory");
  const onOutbox = pathname.startsWith("/portal/outbox");
  const onInsights = pathname.startsWith("/portal/insights");
  const onHome = pathname === "/portal" || pathname.startsWith("/portal/task/");
  const onMeetings = pathname.startsWith("/portal/meetings");
  const onActivity = pathname.startsWith("/portal/activity");
  const onChat = pathname.startsWith("/portal/chat");
  const onProfile = pathname.startsWith("/portal/profile");

  // Honour reduced-motion — both the OS setting AND the portal's own manual toggle
  // (which sets data-motion="reduced" on <html>; framer's JS animations ignore CSS,
  // so we must check it ourselves).
  const prefersReduced = useReducedMotion();
  const [manualReduced, setManualReduced] = useState(false);
  useEffect(() => {
    setManualReduced(document.documentElement.getAttribute("data-motion") === "reduced");
  }, [pathname]);
  const reduce = !!prefersReduced || manualReduced;

  // Adaptive density. lg = always a full label bar; below that, condense on
  // scroll. Tablet (md) has room for every label when expanded; a phone keeps
  // only the active label when expanded, all icons when condensed.
  const lg = useMediaQuery("(min-width: 1024px)");
  const compact = useCondenseOnScroll(!lg && !reduce);
  // Compact like the command-centre pill: ONLY the active tab is labelled (every
  // other tab is icon-only), so the pill stays short instead of spanning the
  // whole width. The row scrolls (wheel/drag on web, swipe on touch) for the rest.
  const showActiveLabel = lg || !compact;
  const labelFor = (active: boolean) => active && showActiveLabel;
  const scrollRef = useDragScroll();
  const pillRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<NavTipData | null>(null);

  return (
    <>
    {/* On mobile, chat is a full-screen app of its own — the pill steps aside. */}
    <div className={cn(
      "fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-5 z-40 justify-center px-2 pointer-events-none",
      onChat ? "hidden md:flex" : "flex"
    )}>
      <motion.div
        ref={pillRef}
        layout={!reduce}
        data-nav-pill
        initial={reduce ? false : { y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
        className="relative pointer-events-auto max-w-[min(20rem,calc(100vw-1.5rem))] md:max-w-[calc(100vw-1.5rem)] nav-frost glass elevated rounded-full shadow-pill flex items-center gap-0 md:gap-1 px-1 md:px-2.5 h-[3.25rem] md:h-[4.25rem] md:[&_svg]:w-[22px] md:[&_svg]:h-[22px]"
      >
        <NavTip tip={tip} containerRef={pillRef} />
        {/* Tabs scroll horizontally only if they truly can't fit; the controls
            below stay anchored so the bell + theme are always reachable. */}
        <div ref={scrollRef} className="nav-scroll no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto select-none touch-pan-x [@media(pointer:fine)]:cursor-grab [@media(pointer:fine)]:active:cursor-grabbing">
          {showBoard && <PillTab href="/portal/board" icon={BoardLayoutIcon} label="Board" active={onBoard} labelled={labelFor(onBoard)} reduce={reduce} onTip={setTip} />}
          {/* Directors + managers are board-first (/portal redirects them to
              /portal/board), so a Home tab is redundant for them — show it for
              staff + HR only. The tab icon mirrors each surface's real layout. */}
          {showHome && <PillTab href="/portal" icon={HomeLayoutIcon} label="Home" active={onHome} labelled={labelFor(onHome)} reduce={reduce} onTip={setTip} tourTag="nav-home" />}
          {showTasks && <PillTab href="/portal/tasks" icon={ClipboardList} label="Tasks" active={onTasks} labelled={labelFor(onTasks)} reduce={reduce} onTip={setTip} />}
          {/* Office cleaning register — the receptionist logs it; oversight roles view it. */}
          {showCleaning && <PillTab href="/portal/cleaning" icon={SprayCan} label="Cleaning" active={onCleaning} labelled={labelFor(onCleaning)} reduce={reduce} onTip={setTip} />}
          {/* The contact book / company list — scoped per role server-side
              (group-wide for HR/directors, own-company for managers/staff). */}
          {caps.tabs.directory && <PillTab href="/portal/directory" icon={Contact} label="Directory" active={onDirectory} labelled={labelFor(onDirectory)} reduce={reduce} onTip={setTip} />}
          {/* Chat sits right after Directory — it's a primary, everyday destination. */}
          {caps.tabs.chat && <PillTab href="/portal/chat" icon={MessageCircle} label="Chat" active={onChat} labelled={labelFor(onChat)} reduce={reduce} onTip={setTip} tourTag="nav-chat" />}
          {/* Briefings = meetings + announcements — everyone (scoped server-side). */}
          {caps.tabs.meetings && <PillTab href="/portal/meetings" icon={CalendarClock} label="Briefings" active={onMeetings} labelled={labelFor(onMeetings)} reduce={reduce} onTip={setTip} />}
          {/* Drafted messages/announcements — management only. */}
          {showOutbox && <PillTab href="/portal/outbox" icon={Send} label="Outbox" active={onOutbox} labelled={labelFor(onOutbox)} reduce={reduce} onTip={setTip} />}
          {/* Glanceable portfolio/team Insights — management only. */}
          {showInsights && <PillTab href="/portal/insights" icon={BarChart3} label="Insights" active={onInsights} labelled={labelFor(onInsights)} reduce={reduce} onTip={setTip} />}
          {caps.tabs.activity && <PillTab href="/portal/activity" icon={ListTodo} label="Activity" active={onActivity} labelled={labelFor(onActivity)} reduce={reduce} onTip={setTip} />}
          <PillTab href="/portal/profile" icon={User} label="Profile" active={onProfile} labelled={labelFor(onProfile)} reduce={reduce} onTip={setTip} tourTag="nav-profile" />
        </div>
        <span className="nav-divider w-px h-6 md:h-7 mx-0.5 md:mx-1 shrink-0" aria-hidden />
        {/* ORI search / ask — opens the scoped portal command surface (⌘K /
            Ctrl+Space also open it). Shown only when the person has the oriAsk
            capability. Sits right after the divider, before the create +. */}
        {canOri && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("cos:portal-ori"))}
            aria-label="ORI — search & ask"
            title="ORI — search & ask (Ctrl K)"
            className="group shrink-0 inline-flex items-center justify-center h-11 w-11 md:h-12 md:w-12 rounded-lg text-fg-muted hover:text-accent hover:bg-accent-soft/60 transition-colors"
          >
            <Sparkles size={19} className="transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] motion-safe:group-hover:scale-125" />
          </button>
        )}
        {/* The create + sits AFTER the divider, next to the theme toggle. Tasks
            carries its own contextual + FAB, so it steps aside there to avoid a
            duplicate. */}
        {canCreate && !onTasks && (
          <Link
            href="/portal/task/new"
            aria-label="New task"
            title="New task"
            className="shrink-0 inline-flex items-center justify-center h-11 w-11 md:h-12 md:w-12 rounded-full text-fg hover:bg-bg-muted/60 transition-colors"
          >
            <Plus size={19} />
          </Link>
        )}
        <div className="shrink-0 flex items-center px-1">
          <ThemeToggle />
        </div>
      </motion.div>
    </div>
    {/* When chat hides the pill on mobile, keep a way back. */}
    {onChat && (
      <Link
        href={showBoard ? "/portal/board" : "/portal"}
        aria-label="Home"
        title="Home"
        className="md:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] right-3 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full glass elevated shadow-pill text-fg-muted transition-transform active:scale-95"
      >
        <Home size={20} />
      </Link>
    )}
    </>
  );
}
