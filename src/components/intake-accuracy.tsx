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
      <div className="glass elevated rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Sparkles size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">Intake accuracy</p>
            <p className="text-[11px] text-fg-subtle">Last {days} days · watch the system get smarter.</p>
          </div>
          {autoFileRate != null && (
            <div className="flex items-center gap-1.5 shrink-0">
              <MiniTrend prev={prevAutoFileRate} now={autoFileRate} />
              <Trend now={autoFileRate} prev={prevAutoFileRate} />
            </div>
          )}
        </div>

        <p className="text-[12px] text-fg-muted leading-snug pl-0.5">{headline}</p>

        {!nothingYet && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4 border-t border-border/50 pt-3">
            <Stat
              value={pct(autoFileRate)}
              label="auto-filed cleanly"
              tone="success"
              href="/documents"
            />
            <Stat
              value={neededYou}
              label="needed you"
              tone={neededYou > 0 ? "warn" : "subtle"}
              href="#verify"
            />
            <Stat
              value={now.corrections}
              label="corrections learned"
              tone={now.corrections > 0 ? "accent" : "subtle"}
              href="#automations"
            />
            <Stat
              value={now.discrepancies}
              label="discrepancies flagged"
              tone={now.discrepancies > 0 ? "warn" : "subtle"}
              href="#verify"
            />
          </div>
        )}

        {!nothingYet && (
          <p className="text-[10.5px] text-fg-subtle leading-snug pl-0.5">
            {cleanFiled} filed without a touch · {now.autoMoves} follow-on move{now.autoMoves === 1 ? "" : "s"} made on its own
            {now.reads > 0 && ` · ${now.readsClean}/${now.reads} reads came back clean`}.
          </p>
        )}
      </div>
    </Reveal>
  );
}
