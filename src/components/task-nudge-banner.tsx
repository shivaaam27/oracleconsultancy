"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, ChevronRight, X } from "lucide-react";
import type { PortalNudge } from "@/lib/portal-nudge";

/* A calm, dismissible nudge shown above every portal hero (home + board).
 * Surfaces tasks that need a look — not-started work (all roles) and stale
 * tasks the person raised (management). Tapping a line opens the matching
 * filter on the Tasks tab. The × dismisses it for the day, but it returns
 * the next day or as soon as either count rises above what was dismissed —
 * so it never nags on every navigation yet never hides a growing pile. */

const KEY = "cos.taskNudge";
const today = () => new Date().toISOString().slice(0, 10);

export function TaskNudgeBanner({
  nudge,
  scrollToId,
}: {
  nudge: PortalNudge;
  /** When set (staff on Home, whose tasks live inline — they have no separate
   *  Tasks page), clicking a line SCROLLS to that element instead of navigating. */
  scrollToId?: string;
}) {
  const { notStarted, noUpdate } = nudge;
  // Hidden until we've read localStorage, so a dismissed banner never flashes.
  const [hidden, setHidden] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null") as
        | { date: string; ns: number; nu: number }
        | null;
      const stillDismissed =
        !!raw && raw.date === today() && raw.ns >= notStarted && raw.nu >= noUpdate;
      setHidden(stillDismissed);
    } catch {
      setHidden(false);
    }
    setReady(true);
  }, [notStarted, noUpdate]);

  if (!ready || hidden) return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, JSON.stringify({ date: today(), ns: notStarted, nu: noUpdate }));
    } catch {
      /* ignore */
    }
  };

  const lines: { key: string; n: number; msg: string; href: string }[] = [];
  if (notStarted > 0) lines.push({ key: "ns", n: notStarted, msg: nudge.notStartedMsg, href: nudge.notStartedHref });
  if (noUpdate > 0) lines.push({ key: "nu", n: noUpdate, msg: nudge.noUpdateMsg, href: nudge.noUpdateHref });
  if (lines.length === 0) return null;

  const scrollToTasks = () => {
    const el = scrollToId ? document.getElementById(scrollToId) : null;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const inner = (l: { n: number; msg: string }) => (
    <>
      <span className="min-w-0">
        <span className="font-semibold text-warn">{l.n}</span>{" "}
        <span className="font-medium">{l.n === 1 ? "task" : "tasks"}</span>{" "}
        <span className="text-fg-muted">{l.msg}</span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
    </>
  );
  const rowCls = "group flex w-full items-center gap-1.5 text-left text-[13px] leading-snug text-fg";

  return (
    <div className="print-hidden flex items-center gap-3 rounded-2xl border border-warn/25 bg-gradient-to-r from-warn-soft/70 to-bg-elev px-3.5 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warn/15 text-warn">
        <ClipboardList size={15} />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        {lines.map((l) =>
          scrollToId ? (
            <button key={l.key} type="button" onClick={scrollToTasks} className={rowCls}>
              {inner(l)}
            </button>
          ) : (
            <Link key={l.key} href={l.href} className={rowCls}>
              {inner(l)}
            </Link>
          ),
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={close}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
      >
        <X size={15} />
      </button>
    </div>
  );
}
