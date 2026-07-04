import Link from "next/link";
import { Sparkles, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/cn";
import type { IntakeMetrics } from "@/lib/intake-metrics";

/* ------------------------------------------------------------------ */
/* A calm Aurora readout of how the document brain is doing — so the   */
/* owner can SEE it getting smarter. Glass, hairlines, every-number-a- */
/* door, no hard boxes. Reduced-motion safe via Reveal. Server         */
/* component: pure render of the figures computeIntakeMetrics() found.  */
/* ------------------------------------------------------------------ */

function pct(n: number | null): string {
  return n == null ? "—" : `${n}%`;
}

/** The up/down trend chip comparing this period's rate with the last one. */
function Trend({ now, prev }: { now: number | null; prev: number | null }) {
  if (now == null || prev == null) return null;
  const delta = now - prev;
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-fg-subtle">
        <Minus size={11} /> flat
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-medium",
        up ? "text-success" : "text-warn",
      )}
      title={`${pct(prev)} the previous period`}
    >
      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {up ? "+" : ""}{delta} pts
    </span>
  );
}

/**
 * A tiny inline sparkline: just the two periods (previous → now) as a sloped
 * line, so the direction is glanceable without a charting library. Decorative
 * (aria-hidden); the numbers beside it carry the meaning.
 */
function MiniTrend({ prev, now }: { prev: number | null; now: number | null }) {
  if (prev == null || now == null) return null;
  const h = 18, w = 44, pad = 2;
  const y = (v: number) => pad + (1 - v / 100) * (h - pad * 2);
  const x1 = pad, x2 = w - pad;
  const rising = now >= prev;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 overflow-visible">
      <line
        x1={x1} y1={y(prev)} x2={x2} y2={y(now)}
        className={rising ? "stroke-success" : "stroke-warn"}
        strokeWidth={1.5} strokeLinecap="round" fill="none"
      />
      <circle cx={x1} cy={y(prev)} r={1.6} className="fill-fg-subtle" />
      <circle cx={x2} cy={y(now)} r={2.2} className={rising ? "fill-success" : "fill-warn"} />
    </svg>
  );
}

/** One small "number is a door" stat. Links somewhere relevant when given. */
function Stat({
  value, label, href, tone = "fg",
}: {
  value: number | string;
  label: string;
  href?: string;
  tone?: "fg" | "accent" | "warn" | "success" | "subtle";
}) {
  const toneCls =
    tone === "accent" ? "text-accent" :
    tone === "warn" ? "text-warn" :
    tone === "success" ? "text-success" :
    tone === "subtle" ? "text-fg-muted" : "text-fg";
  const inner = (
    <>
      <span className={cn("block text-lg font-semibold leading-none tabular-nums", toneCls)}>{value}</span>
      <span className="mt-1 block text-[11px] text-fg-subtle leading-tight">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="group rounded-xl px-2 py-1.5 -mx-1 transition-colors hover:bg-bg-muted/50 focus-visible:bg-bg-muted/50 outline-none"
      >
        {inner}
      </Link>
    );
  }
  return <span className="px-2 py-1.5">{inner}</span>;
}

/**
 * Intake-accuracy card. Shows, for the last `metrics.days` days:
 *   "94% auto-filed · 6 needed you · learned 3 corrections · 2 discrepancies"
 * with a small trend vs the period before. AI-off / empty degrades to a calm
 * "nothing yet" line rather than a wall of zeros.
 */
export function IntakeAccuracy({ metrics }: { metrics: IntakeMetrics }) {
  const { now, days, autoFileRate, prevAutoFileRate, cleanFiled, neededYou } = metrics;
  const nothingYet = now.documents === 0 && now.reads === 0 && now.corrections === 0;

  // The plain-language headline the owner reads at a glance.
  const headline = autoFileRate == null
    ? "Drop documents in and this fills up as the system reads them."
    : [
        `${autoFileRate}% auto-filed`,
        `${neededYou} needed you`,
        now.corrections > 0 ? `learned ${now.corrections} correction${now.corrections === 1 ? "" : "s"}` : null,
        now.discrepancies > 0 ? `${now.discrepancies} discrepanc${now.discrepancies === 1 ? "y" : "ies"} flagged` : null,
      ].filter(Boolean).join(" · ");

  return (
    <Reveal>
      {/* Slim one-line readout — informative without eating the page. */}
      <div className="glass flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl px-3.5 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-fg">
          <Sparkles size={13} className="text-accent" /> Intake accuracy
          <span className="font-normal text-[11px] text-fg-subtle">· last {days}d</span>
        </span>
        {nothingYet ? (
          <span className="text-fg-subtle">Fills up as documents come in.</span>
        ) : (
          <>
            <span className="text-fg-muted"><b className="tabular-nums text-success">{pct(autoFileRate)}</b> auto-filed</span>
            <span className="text-fg-muted"><b className="tabular-nums">{neededYou}</b> needed you</span>
            <span className="text-fg-muted"><b className={cn("tabular-nums", now.corrections > 0 && "text-accent")}>{now.corrections}</b> learned</span>
            <span className="text-fg-muted"><b className={cn("tabular-nums", now.discrepancies > 0 && "text-warn")}>{now.discrepancies}</b> flagged</span>
            {autoFileRate != null && <span className="ml-auto"><Trend now={autoFileRate} prev={prevAutoFileRate} /></span>}
          </>
        )}
      </div>
    </Reveal>
  );
}
