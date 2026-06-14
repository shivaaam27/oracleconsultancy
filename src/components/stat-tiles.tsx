import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { TONE, type Tone } from "@/components/surface-kit";

/* Living "widget" stat tiles — the Apple-style glanceable cards: a small
 * title top-left, one dominant metric, a tiny inline visualization, and a
 * status line, each on a tone-tinted glowing glass surface. Optionally a
 * Link so a tile doubles as a quick filter.
 *
 * NOTE: these were the big gauge tiles on the Tasks header. They duplicated
 * the ChipRail counts and made the header too tall, so the Tasks tab was
 * decluttered onto the compact shared `PageHeader`. As a result these
 * exports (StatTile/BigStat/StackBar/MiniRing) are currently UNUSED. Kept
 * for possible reuse; the per-company `StatTile` in companies/[id] is a
 * separate, locally-defined component (different props) — not this one. */

export function StatTile({
  title,
  tone = "muted",
  href,
  active = false,
  children,
  footer,
}: {
  title: string;
  tone?: Tone;
  href?: string;
  active?: boolean;
  children: ReactNode; // the dominant metric / gauge
  footer?: ReactNode; // tiny viz or status line
}) {
  const t = TONE[tone];
  const body = (
    <div
      className={cn(
        "group relative h-full overflow-hidden rounded-2xl ring-1 p-3 transition-all",
        "bg-bg-elev/70 backdrop-blur-sm",
        active ? `${t.ring} ring-2` : "ring-border/60",
        href && "hover:ring-2 hover:ring-accent/40 hover:-translate-y-0.5"
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl opacity-70"
        style={{ background: `radial-gradient(circle, ${t.stroke.replace(")", " / 0.18)")}, transparent 70%)` }}
      />
      <div className="relative flex h-full flex-col">
        <span className={cn("text-[11px] font-medium uppercase tracking-[0.06em]", t.text)}>{title}</span>
        <div className="mt-1 flex flex-1 items-center">{children}</div>
        {footer && <div className="mt-1.5">{footer}</div>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">{body}</Link>
  ) : (
    body
  );
}

/** A big metric number with a small unit/word beside it. */
export function BigStat({ value, unit, tone }: { value: ReactNode; unit?: string; tone?: Tone }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn("text-3xl font-semibold leading-none tabular", tone && TONE[tone].text)}>{value}</span>
      {unit && <span className="text-xs text-fg-muted">{unit}</span>}
    </div>
  );
}

/** A thin rounded stacked bar — a glanceable status/priority mix. */
export function StackBar({ segments }: { segments: Array<{ value: number; color: string; label?: string }> }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
      {segments.map((s, i) =>
        s.value > 0 ? (
          <span
            key={i}
            title={s.label}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ) : null
      )}
    </div>
  );
}

/** A small full-circle progress ring (static — no animation). */
export function MiniRing({ percent, color, size = 34, stroke = 4 }: { percent: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeOpacity={0.5} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
