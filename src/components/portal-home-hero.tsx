"use client";

import { useEffect, useState } from "react";
import { ListTodo } from "lucide-react";

/* Staff home hero — the SAME aurora-washed shell as the manager/director board
 * hero (BoardHero), so the welcome section is uniform across the whole portal.
 * The four figures (open · overdue · due this week · done) are compacted into one
 * slim pill instead of four big tiles, so it's far shorter on mobile. */

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <b className={`text-[15px] font-semibold tabular ${tone}`}>{n}</b>
      <span className="text-[12px]">{label}</span>
    </span>
  );
}

export function PortalHomeHero({
  firstName, initials, subtitle, open, overdue, dueSoon, done,
}: {
  firstName: string;
  initials: string;
  subtitle: string;
  open: number;
  overdue: number;
  dueSoon: number;
  done: number;
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
      <div className="relative mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-bg-elev/55 px-3.5 py-2.5 text-fg-muted ring-1 ring-border">
        <ListTodo size={14} className="shrink-0 text-accent" />
        <Stat n={open} label="open" tone="text-fg" />
        <span className="text-border" aria-hidden>·</span>
        <Stat n={overdue} label="overdue" tone={overdue > 0 ? "text-danger" : "text-fg"} />
        <span className="text-border" aria-hidden>·</span>
        <Stat n={dueSoon} label="due this week" tone={dueSoon > 0 ? "text-warn" : "text-fg"} />
        <span className="text-border" aria-hidden>·</span>
        <Stat n={done} label="done" tone={done > 0 ? "text-success" : "text-fg"} />
      </div>
    </section>
  );
}
