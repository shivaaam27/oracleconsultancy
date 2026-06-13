"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Home, LayoutDashboard, ListTodo, MessageCircle, Plus, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";

/* The staff portal's own bottom-floating pill. Same liquid-glass language
 * as the admin pill (top-pill.tsx) but a deliberately tiny, fixed menu —
 * only safe destinations exist here, so staff can never reach admin pages. */

function PillTab({ href, icon: Icon, label, active, reduce }: { href: string; icon: LucideIcon; label: string; active: boolean; reduce: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex flex-col items-center justify-center h-12 w-16 rounded-2xl shrink-0 transition-colors",
        active ? "text-accent" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
      )}
    >
      {active && (
        reduce ? (
          <span className="absolute inset-0 rounded-2xl bg-accent-soft" />
        ) : (
          <motion.span
            layoutId="portalpill"
            className="absolute inset-0 rounded-2xl bg-accent-soft"
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
          />
        )
      )}
      <Icon size={19} strokeWidth={active ? 2.4 : 2} className="relative" />
      <span className="relative mt-0.5 text-[10px] font-medium">{label}</span>
    </Link>
  );
}

export function PortalPill({ canCreate = false, role }: { canCreate?: boolean; role?: string }) {
  const pathname = usePathname() || "/portal";
  const isDirector = role === "director";
  const onBoard = pathname.startsWith("/portal/board");
  const onHome = pathname === "/portal" || pathname.startsWith("/portal/task");
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

  return (
    // On mobile, chat is a full-screen app of its own — the pill steps aside.
    <div className={cn(
      "fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-5 z-40 justify-center px-2 pointer-events-none",
      onChat ? "hidden md:flex" : "flex"
    )}>
      <motion.div
        initial={reduce ? false : { y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
        className="pointer-events-auto glass elevated rounded-full shadow-pill flex items-center gap-0.5 px-2 h-16"
      >
        {isDirector && <PillTab href="/portal/board" icon={LayoutDashboard} label="Board" active={onBoard} reduce={reduce} />}
        <PillTab href="/portal" icon={Home} label="Home" active={onHome} reduce={reduce} />
        <PillTab href="/portal/activity" icon={ListTodo} label="Activity" active={onActivity} reduce={reduce} />
        <PillTab href="/portal/chat" icon={MessageCircle} label="Chat" active={onChat} reduce={reduce} />
        <PillTab href="/portal/profile" icon={User} label="Profile" active={onProfile} reduce={reduce} />
        {canCreate && (
          <Link
            href="/portal/task/new"
            aria-label="New task"
            title="New task"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-fg shrink-0 hover:opacity-90 transition-opacity mx-0.5"
          >
            <Plus size={20} strokeWidth={2.4} />
          </Link>
        )}
        <span className="mx-1 h-7 w-px bg-border" />
        <div className="px-0.5">
          <NotificationBell to="/portal/task" />
        </div>
        <div className="px-1">
          <ThemeToggle />
        </div>
      </motion.div>
    </div>
  );
}
