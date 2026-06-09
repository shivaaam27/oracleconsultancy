import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Surface kit — the shared page-level design language ("design lock").
 * Pure presentational, no client hooks, so it works in server OR client
 * components. Pages adopt Hero + Panel + SectionLabel to feel identical.
 * ------------------------------------------------------------------ */

export type Tone = "danger" | "warn" | "accent" | "success" | "muted" | "info";

export const TONE: Record<Tone, { text: string; bg: string; ring: string; bar: string; stroke: string }> = {
  danger: { text: "text-danger", bg: "bg-danger-soft/60", ring: "ring-danger/20", bar: "bg-danger", stroke: "hsl(var(--danger))" },
  warn: { text: "text-warn", bg: "bg-warn-soft/60", ring: "ring-warn/20", bar: "bg-warn", stroke: "hsl(var(--warn))" },
  accent: { text: "text-accent", bg: "bg-accent-soft/70", ring: "ring-accent/20", bar: "bg-accent", stroke: "hsl(var(--accent))" },
  success: { text: "text-success", bg: "bg-success-soft/70", ring: "ring-success/20", bar: "bg-success", stroke: "hsl(var(--success))" },
  info: { text: "text-info", bg: "bg-info-soft/70", ring: "ring-info/20", bar: "bg-info", stroke: "hsl(var(--info))" },
  muted: { text: "text-fg-muted", bg: "bg-bg-subtle/70", ring: "ring-border/60", bar: "bg-fg-subtle", stroke: "hsl(var(--fg-subtle))" },
};

/** A small uppercase section label with an optional leading icon + trailing action. */
export function SectionLabel({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
        {icon}
        {children}
      </div>
      {action}
    </div>
  );
}

/** The standard content panel. `glass` for the lifted top-of-page tier. */
export function Panel({
  glass = false,
  className,
  children,
}: {
  glass?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl elevated",
        glass ? "glass" : "bg-bg-elev ring-1 ring-border",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Aurora-lit page hero — title, subtitle, actions, and an optional body
 *  (e.g. a metric rail). The atmospheric glows are reduced-motion safe via the
 *  global media rule. Reuse on other pages for a consistent header. */
export function Hero({
  title,
  subtitle,
  actions,
  accentTone = "accent",
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  accentTone?: Tone;
  children?: ReactNode;
}) {
  return (
    <section className="relative w-full overflow-hidden rounded-3xl glass elevated p-4 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="aurora-a absolute -right-24 -top-28 h-80 w-80 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.28), transparent 70%)" }}
        />
        <div
          className="aurora-b absolute -bottom-32 -left-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--info) / 0.22), transparent 72%)" }}
        />
        <div
          className="aurora-a absolute left-1/3 top-10 h-56 w-56 rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle, ${TONE[accentTone].stroke.replace(")", " / 0.14)")}, transparent 72%)` }}
        />
      </div>
      <div className="relative flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

/** A tiny ▲/▼ delta pill. `goodWhenDown` flips the colour logic (e.g. overdue
 *  falling is good). Renders nothing when delta is 0 — no noise. */
export function TrendChip({
  delta,
  goodWhenDown = false,
  suffix = "",
  className,
}: {
  delta: number;
  goodWhenDown?: boolean;
  suffix?: string;
  className?: string;
}) {
  if (delta === 0) return null;
  const up = delta > 0;
  const good = goodWhenDown ? !up : up;
  const tone: Tone = good ? "success" : "danger";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold tabular leading-none", TONE[tone].text, className)}>
      <Icon size={11} />
      {Math.abs(delta)}
      {suffix}
    </span>
  );
}
