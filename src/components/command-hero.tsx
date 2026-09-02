import { Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/cn";
import { CockpitLive } from "@/components/cockpit-live";

/* Administrator hero strip — the owner-grade twin of the portal BoardHero
 * (aurora glass, live dot, avatar, slim one-line stats pill + ORI's read).
 * Deliberately clean: the engine actions (Run · Brief · Approvals) live in the
 * bottom HomeControlBar and portfolio health lives in the Company-health header,
 * so the hero stays calm. Part of the Administrator unification —
 * memory/command_centre_unification.md. */

export function CommandHero({
  greeting,
  name,
  subtitle,
  initials,
  open,
  overdue,
  dueToday,
  oriLine,
}: {
  greeting: string;
  name: string;
  subtitle: string;
  initials: string;
  open: number;
  overdue: number;
  dueToday: number;
  oriLine: string;
}) {
  return (
    <section className="relative w-full overflow-hidden rounded-3xl glass elevated p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aurora-a absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.30), transparent 70%)" }} />
        <div className="aurora-b absolute -bottom-28 -left-20 h-64 w-64 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--success) / 0.16), transparent 72%)" }} />
      </div>

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-fg-subtle">Administrator</p>
            <CockpitLive />
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting}, {name}
          </h1>
          <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent ring-1 ring-accent/25">
          {initials}
        </span>
      </div>

      {/* Slim stats pill + ORI's one-line read of the day. */}
      <div className="relative mt-4 rounded-2xl bg-bg-elev/55 px-3.5 py-2.5 ring-1 ring-border">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Target size={14} className="shrink-0 text-accent" />
          <p className="min-w-0">
            <b className="font-semibold text-fg tabular">{open}</b> open ·{" "}
            <b className={cn("font-semibold tabular", overdue > 0 ? "text-danger" : "text-fg")}>{overdue}</b> overdue ·{" "}
            <b className={cn("font-semibold tabular", dueToday > 0 ? "text-warn" : "text-fg")}>{dueToday}</b> due today
          </p>
        </div>
        <p className="mt-1.5 flex items-start gap-1.5 border-t border-border/60 pt-2 text-base leading-relaxed text-accent">
          <Sparkles size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0">{oriLine}</span>
        </p>
      </div>
    </section>
  );
}
