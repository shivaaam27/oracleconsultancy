"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ClipboardList, Home, Inbox, LayoutDashboard, ListTodo, MessageCircle, Plus, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";

/* The staff portal's own bottom-floating pill. Same liquid-glass language
 * as the admin pill (top-pill.tsx) but a deliberately tiny, fixed menu —
 * only safe destinations exist here, so staff can never reach admin pages. */

/* Morphing tab: only the ACTIVE tab carries its label (inside a sliding
 * accent-soft glass lens); every other tab is icon-only. The lens slides
 * between tabs via a shared layoutId, and the active tab grows to fit its
 * label via a `layout` animation — so six destinations fit a phone without
 * the old crowded stack of tiny labels. Reduced-motion: no slide/grow. */
function PillTab({ href, icon: Icon, label, active, reduce }: { href: string; icon: LucideIcon; label: string; active: boolean; reduce: boolean }) {
  return (
    <Link href={href} aria-label={label} title={label} className="relative shrink-0 outline-none">
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
      <motion.span
        layout={!reduce}
        transition={{ type: "spring", stiffness: 500, damping: 36 }}
        className={cn(
          "relative inline-flex h-10 items-center justify-center gap-1.5 rounded-full transition-colors",
          active ? "px-3.5 text-accent" : "w-10 text-fg-muted hover:text-fg hover:bg-bg-muted/60"
        )}
      >
        <Icon size={18} strokeWidth={active ? 2.4 : 2} className="relative shrink-0" />
        {active && <span className="relative whitespace-nowrap text-[13px] font-medium">{label}</span>}
      </motion.span>
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

  return (
    <>
    {/* On mobile, chat is a full-screen app of its own — the pill steps aside. */}
    <div className={cn(
      "fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-5 z-40 justify-center px-2 pointer-events-none",
      onChat ? "hidden md:flex" : "flex"
    )}>
      <motion.div
        initial={reduce ? false : { y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
        className="pointer-events-auto max-w-[calc(100vw-1.5rem)] glass elevated rounded-full shadow-pill flex items-center gap-0 px-1 sm:px-2 h-14"
      >
        {/* Tabs scroll horizontally if they can't all fit (5 tabs for a
            director on a ~320px phone); the controls below stay anchored so
            the bell + theme are always reachable. */}
        <div className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {isDirector && <PillTab href="/portal/board" icon={LayoutDashboard} label="Board" active={onBoard} reduce={reduce} />}
          {/* Directors are board-first (/portal redirects them to /portal/board),
              so a Home tab is redundant for them — show it for everyone else. */}
          {!isDirector && <PillTab href="/portal" icon={Home} label="Home" active={onHome} reduce={reduce} />}
          {showTasks && <PillTab href="/portal/tasks" icon={ClipboardList} label="Tasks" active={onTasks} reduce={reduce} />}
          <PillTab href="/portal/requests" icon={Inbox} label="Requests" active={onRequests} reduce={reduce} />
          <PillTab href="/portal/activity" icon={ListTodo} label="Activity" active={onActivity} reduce={reduce} />
          <PillTab href="/portal/chat" icon={MessageCircle} label="Chat" active={onChat} reduce={reduce} />
          <PillTab href="/portal/profile" icon={User} label="Profile" active={onProfile} reduce={reduce} />
        </div>
        {canCreate && (
          <Link
            href="/portal/task/new"
            aria-label="New task"
            title="New task"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-fg shrink-0 hover:opacity-90 transition-opacity mx-0.5"
          >
            <Plus size={19} strokeWidth={2.4} />
          </Link>
        )}
        <span className="mx-1 h-7 w-px bg-border shrink-0" />
        <div className="px-0.5 shrink-0">
          <NotificationBell to="/portal/task" />
        </div>
        <div className="px-1 shrink-0">
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
