import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TONE, type Tone } from "@/components/surface-kit";

/* ------------------------------------------------------------------ *
 * WidgetCard / WidgetHeader — a glass "modern widget" shell (aurora glow,
 * header + body zones). NOTE: this was an experiment that ended up being
 * the oversized outlier — its tall, glowing header pushed page content
 * below the fold. The Tasks tab (its only adopter) was moved to the
 * compact shared `PageHeader` (src/components/ui.tsx) to match /people and
 * /documents, so `WidgetCard` and `WidgetHeader` are now UNUSED. Only
 * `ChipRail` below is still in use (by the Tasks tab). Prefer `PageHeader`
 * for page headers — do not reintroduce this shell as a page header.
 * Pure presentational — works in server OR client trees.
 * ------------------------------------------------------------------ */

export function WidgetCard({
  glow = true,
  accentTone = "accent",
  className,
  children,
}: {
  glow?: boolean;
  accentTone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("relative w-full overflow-hidden rounded-3xl glass elevated", className)}>
      {glow && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="aurora-a absolute -right-24 -top-28 h-72 w-72 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.22), transparent 70%)" }}
          />
          <div
            className="aurora-b absolute -bottom-28 -left-24 h-64 w-64 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(var(--info) / 0.18), transparent 72%)" }}
          />
          <div
            className="aurora-a absolute left-1/3 top-8 h-48 w-48 rounded-full blur-3xl"
            style={{ background: `radial-gradient(circle, ${TONE[accentTone].stroke.replace(")", " / 0.12)")}, transparent 72%)` }}
          />
        </div>
      )}
      <div className="relative p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Header zone: a title block (left), an optional info/pulse slot (centre,
 *  hidden on small screens), and actions (right). */
export function WidgetHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight leading-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** A horizontal-scrolling rail (chips, stats) with a soft fade at the right
 *  edge — the universal "there's more →" cue. No wrapping pile-ups. */
export function ChipRail({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "[mask-image:linear-gradient(to_right,#000_94%,transparent)] sm:[mask-image:none]",
        className
      )}
    >
      {children}
    </div>
  );
}

/** A small status pill (e.g. "2 need you now"). */
export function StatusPill({ tone = "accent", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1", TONE[tone].bg, TONE[tone].text, TONE[tone].ring)}>
      {icon}
      {children}
    </span>
  );
}
