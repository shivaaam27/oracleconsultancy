"use client";

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

  return (
    <section className="relative w-full overflow-hidden rounded-3xl glass elevated p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aurora-a absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.30), transparent 70%)" }} />
        <div className="aurora-b absolute -bottom-28 -left-20 h-64 w-64 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--success) / 0.16), transparent 72%)" }} />
      </div>
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-subtle">My work</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting}, {firstName}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent ring-1 ring-accent/25">{initials}</span>
      </div>
      <div className="relative mt-4 flex items-center gap-2 rounded-2xl bg-bg-elev/55 px-3.5 py-2.5 text-sm text-fg-muted ring-1 ring-border">
        <ListTodo size={14} className="shrink-0 text-accent" />
        <p>
          <b className="font-semibold text-fg">{open}</b> open ·{" "}
          <b className={`font-semibold ${overdue > 0 ? "text-danger" : "text-fg"}`}>{overdue}</b> overdue
        </p>
      </div>
    </section>
  );
}
