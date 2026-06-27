"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ClipboardList, Contact, Home, Inbox, LayoutDashboard, ListTodo, MessageCircle, Plus, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
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

function PillTab({ href, icon: Icon, label, active, labelled: showLabel, reduce, tourTag }: { href: string; icon: LucideIcon; label: string; active: boolean; labelled: boolean; reduce: boolean; tourTag?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      data-tour={tourTag}
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 h-11 md:h-12 rounded-full shrink-0 transition-colors outline-none",
        active ? "text-accent px-3 md:px-3.5" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60",
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
      <Icon size={18} strokeWidth={active ? 2.4 : 2} className="relative shrink-0" />
      {showLabel && <span className="relative whitespace-nowrap text-[13px] font-medium">{label}</span>}
    </Link>
  );
}

export function PortalPill({ canCreate = false, role }: { canCreate?: boolean; role?: string }) {
  const pathname = usePathname() || "/portal";
  const isDirector = role === "director";
  // Managers, HR and directors get a dedicated filterable Tasks list (group-wide
  // for HR/directors, company-wide for managers). Staff manage few — the Home
  // page lists those — so they don't need the tab.
  const showTasks = role === "manager" || role === "hr" || role === "director";
  const onBoard = pathname.startsWith("/portal/board");
  const onTasks = pathname.startsWith("/portal/tasks");
  const onDirectory = pathname.startsWith("/portal/directory");
  const onHome = pathname === "/portal" || pathname.startsWith("/portal/task/");
  const onActivity = pathname.startsWith("/portal/activity");
  const onRequests = pathname.startsWith("/portal/requests");
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
  const md = useMediaQuery("(min-width: 768px)");
  const compact = useCondenseOnScroll(!lg && !reduce);
  const showAllLabels = lg || (md && !compact);
  const showActiveLabel = lg || !compact;
  const labelFor = (active: boolean) => (active ? showActiveLabel : showAllLabels);

  return (
    <>
    {/* On mobile, chat is a full-screen app of its own — the pill steps aside. */}
    <div className={cn(
      "fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-5 z-40 justify-center px-2 pointer-events-none",
      onChat ? "hidden md:flex" : "flex"
    )}>
      <motion.div
        layout={!reduce}
        data-nav-pill
        initial={reduce ? false : { y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
        className="pointer-events-auto max-w-[calc(100vw-1.5rem)] glass elevated rounded-full shadow-pill flex items-center gap-0 md:gap-1 px-1 md:px-2.5 h-[3.25rem] md:h-[4.25rem] md:[&_svg]:w-[22px] md:[&_svg]:h-[22px]"
      >
        {/* Tabs scroll horizontally only if they truly can't fit; the controls
            below stay anchored so the bell + theme are always reachable. */}
        <div className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {isDirector && <PillTab href="/portal/board" icon={LayoutDashboard} label="Board" active={onBoard} labelled={labelFor(onBoard)} reduce={reduce} />}
          {/* Directors are board-first (/portal redirects them to /portal/board),
              so a Home tab is redundant for them — show it for everyone else. */}
          {!isDirector && <PillTab href="/portal" icon={Home} label="Home" active={onHome} labelled={labelFor(onHome)} reduce={reduce} tourTag="nav-home" />}
          {showTasks && <PillTab href="/portal/tasks" icon={ClipboardList} label="Tasks" active={onTasks} labelled={labelFor(onTasks)} reduce={reduce} />}
          {/* Directors get a read-only group-wide contact book / company list. */}
          {isDirector && <PillTab href="/portal/directory" icon={Contact} label="Directory" active={onDirectory} labelled={labelFor(onDirectory)} reduce={reduce} />}
          <PillTab href="/portal/requests" icon={Inbox} label="Requests" active={onRequests} labelled={labelFor(onRequests)} reduce={reduce} tourTag="nav-requests" />
          <PillTab href="/portal/activity" icon={ListTodo} label="Activity" active={onActivity} labelled={labelFor(onActivity)} reduce={reduce} />
          <PillTab href="/portal/chat" icon={MessageCircle} label="Chat" active={onChat} labelled={labelFor(onChat)} reduce={reduce} tourTag="nav-chat" />
          <PillTab href="/portal/profile" icon={User} label="Profile" active={onProfile} labelled={labelFor(onProfile)} reduce={reduce} tourTag="nav-profile" />
        </div>
        {/* Tasks + Requests carry their own contextual + FAB (quick add / raise
            a request), so the pill's create button steps aside there to avoid a
            duplicate +. */}
        {canCreate && !onTasks && !onRequests && (
          <Link
            href="/portal/task/new"
            aria-label="New task"
            title="New task"
            className="shrink-0 inline-flex items-center justify-center h-11 w-11 md:h-12 md:w-12 rounded-full text-fg hover:bg-bg-muted/60 transition-colors"
          >
            <Plus size={19} />
          </Link>
        )}
        <span className="w-px h-6 md:h-7 bg-border mx-0.5 md:mx-1 shrink-0" aria-hidden />
        <div className="shrink-0 flex items-center px-1">
          <ThemeToggle />
        </div>
      </motion.div>
    </div>
    {/* When chat hides the pill on mobile, keep a way back. */}
    {onChat && (
      <Link
        href={isDirector ? "/portal/board" : "/portal"}
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
