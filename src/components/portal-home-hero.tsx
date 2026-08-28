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

  /* ⚠️ THE TWIN OF THE BOARD'S HERO — keep the two in step, as this file's
   * header has always said. Both were compressed too hard in the August portal
   * pass: an 18-20px greeting with the figures buried in an 11px sentence under
   * it, so the first thing on the page was the smallest thing on it. The
   * greeting is `text-2xl` now and the figures are real figures on the right.
   * See `BoardHero` in `director-board-client.tsx` for the full note. */
  return (
    <section data-page-header style={PORTAL_HEADER_CARD}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-md bg-accent-soft text-sm font-semibold text-accent sm:grid">{initials}</span>
          <span className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">My work</p>
            <h1 className="truncate text-2xl font-semibold leading-tight tracking-tight">{greeting}, {firstName}</h1>
            {subtitle && <p className="mt-0.5 truncate text-sm text-fg-muted">{subtitle}</p>}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-6">
          <span className="flex flex-col">
            <span className="inline-flex items-baseline gap-1.5">
              <ListTodo size={13} className="text-accent" />
              <b className="tabular text-2xl font-semibold leading-none text-fg">{open}</b>
            </span>
            <span className="mt-1 text-xs text-fg-muted">open</span>
          </span>
          <span className="flex flex-col">
            <b className={`tabular text-2xl font-semibold leading-none ${overdue > 0 ? "text-danger" : "text-fg"}`}>{overdue}</b>
            <span className="mt-1 text-xs text-fg-muted">overdue</span>
          </span>
        </div>
      </div>
    </section>
  );
}
