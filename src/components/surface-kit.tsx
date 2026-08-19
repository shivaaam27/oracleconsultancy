import type { ReactNode } from "react";
import Link from "next/link";
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

/**
 * The page header — title, subtitle, actions, and an optional body (a metric
 * rail, usually).
 *
 * This WAS a 3xl title inside an aurora-lit glass slab, which cost ~190px before
 * a single row of content and was the loudest thing on every page it appeared on.
 * It is now the same compact header the command centre uses (`PageHeader` in
 * ui.tsx — same markup, same `data-page-header` hook), because the portal pass
 * has one goal: the two sides look like one product.
 *
 * The PROPS are unchanged on purpose. Eleven portal pages and the admin home
 * render this, and none of them needed editing — the shape changed underneath
 * them all at once.
 *
 * `accentTone` is now accepted and ignored: the header no longer tints, and
 * removing it would have meant touching every caller for no gain.
 */
/**
 * The portal page header is a CARD — a real edge around the title, the figures
 * and whatever else the hero carries.
 *
 * The command centre keeps its hairline: there the title sits above a dense
 * list and a box round it would compete. In the portal everything BELOW the
 * header is a card, so a bare line of text at the top read as unfinished — the
 * board especially, where the greeting, the date and the figures had nothing
 * holding them together.
 *
 * ⚠️ INLINE, deliberately. `section[data-page-header]` in globals.css forces
 * background:none / border:0 / radius:0 and beats any Tailwind class on
 * specificity, and a scoped override added to globals.css is silently dropped
 * by Tailwind v4’s Lightning CSS (verified — the rule never reached the
 * browser). Inline beats both. Shared by all three portal headers so they
 * cannot drift apart.
 */
export const PORTAL_HEADER_CARD: React.CSSProperties = {
  background: "hsl(var(--bg-elev))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  padding: "14px 16px",
};

export function Hero({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** @deprecated The flat header does not tint. Kept so callers still compile. */
  accentTone?: Tone;
  children?: ReactNode;
}) {
  return (
    <section data-page-header style={PORTAL_HEADER_CARD}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-0.5 text-xs text-fg-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}

/**
 * The figures line under a page title — the glance a hero exists for.
 *
 * Outbox had this shape (big tabular number, small label beneath it) and it is
 * the one that reads at arm’s length; Tasks and Insights each had a different,
 * weaker line of their own — an icon and a sentence. One component now, so every
 * portal page opens the same way and a number is always a number, not prose.
 *
 * `href` makes a figure a door: tap "12 overdue" and land on the overdue list.
 */
export function HeroMetrics({ items }: { items: { label: string; value: ReactNode; tone?: Tone; href?: string }[] }) {
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
      {items.map((m) => {
        const inner = (
          <>
            <span className={cn("text-xl font-semibold leading-none tabular", m.tone ? TONE[m.tone].text : "text-fg")}>{m.value}</span>
            <span className="text-[11px] text-fg-muted">{m.label}</span>
          </>
        );
        return m.href ? (
          <Link key={m.label} href={m.href} className="flex items-baseline gap-1.5 rounded-md transition-opacity hover:opacity-70">{inner}</Link>
        ) : (
          <span key={m.label} className="flex items-baseline gap-1.5">{inner}</span>
        );
      })}
    </div>
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
