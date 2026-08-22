"use client";
import { PORTAL_HEADER_CARD } from "@/components/surface-kit";

import { useEffect, useState } from "react";
import { ListTodo } from "lucide-react";

/* Staff home hero — the SAME aurora-washed shell AND stats pill as the
 * manager/director board hero (BoardHero), so the welcome card is uniform across
 * the whole portal. The pill shows two figures on a single line that never wraps
 * (open · overdue), matching the manager's "needs you · due today" — previously
 * four figures wrapped to two rows and made the staff card noticeably taller. */

export function PortalHomeHero({
  firstName, initials, subtitle, open, overdue,
}: {
  firstName: string;
  initials: string;
  subtitle: string;
  open: number;
  overdue: number;
  /** Still accepted (caller passes them) but no longer shown, to match the
   *  manager hero's two-figure pill. */
  dueSoon?: number;
  done?: number;
}) {
  // Time-of-day greeting resolved on the client (avoids a server/client mismatch).
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  /* Compact page header — the twin of the board's (portal pass, Aug 2026). Same
   * greeting, same figures, ~190px less of them. Staff see this one; keep the two
   * in step, as the file header has always said. */
  return (
    <section data-page-header style={PORTAL_HEADER_CARD}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">My work</p>
          <h1 className="text-xl font-semibold tracking-tight">{greeting}, {firstName}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
            {subtitle && <><span>{subtitle}</span><span className="text-fg-subtle">·</span></>}
            <span className="inline-flex items-center gap-1">
              <ListTodo size={12} className="shrink-0 text-accent" />
              <b className="font-semibold text-fg tabular">{open}</b> open
              <span className="text-fg-subtle">·</span>
              <b className={`font-semibold tabular ${overdue > 0 ? "text-danger" : "text-fg"}`}>{overdue}</b> overdue
            </span>
          </div>
        </div>
        <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-soft text-xs font-semibold text-accent sm:grid">{initials}</span>
      </div>
    </section>
  );
}
