import { sb } from "@/db/supabase";
import { Activity, TrendingDown, TrendingUp, Minus } from "lucide-react";

type Snap = {
  snapshot_date: string;
  open: number;
  overdue: number;
  completed: number;
  closed: number;
  critical: number;
  risk_score: number;
};

/**
 * Reads the last 30 days of daily_snapshots for one company and renders three
 * compact trend tiles: open count, completion velocity, and risk score.
 * Empty state when the cron hasn't populated anything yet.
 */
export async function MomentumStrip({ companyId }: { companyId: number }) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate())).toISOString();

  const { data } = await sb
    .from("daily_snapshots")
    .select("snapshot_date,open,overdue,completed,closed,critical,risk_score")
    .eq("company_id", companyId)
    .gte("snapshot_date", sinceIso)
    .order("snapshot_date", { ascending: true });

  const snaps = (data ?? []) as Snap[];

  if (snaps.length === 0) {
    return (
      <div className="card p-4 border-dashed">
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <Activity size={12} />
          <span className="font-medium">Momentum</span>
        </div>
        <p className="text-xs text-fg-subtle mt-1.5 leading-relaxed">
          Trends will appear once the daily snapshot has run for at least one day.
          The cron writes one row per company per day at 00:05 UTC.
        </p>
      </div>
    );
  }

  // Compute deltas from snapshots
  const last = snaps[snaps.length - 1];
  const sevenDaysAgo = snaps.find((s) => daysAgo(s.snapshot_date) >= 7) ?? snaps[0];
  const thirtyDaysAgo = snaps[0];

  // Completion velocity = number of newly-completed tasks over the window
  // (delta in the running `completed` counter).
  const completed7d = Math.max(0, last.completed - sevenDaysAgo.completed);
  const completed30d = Math.max(0, last.completed - thirtyDaysAgo.completed);
  const closed7d = Math.max(0, last.closed - sevenDaysAgo.closed);

  const openSeries = snaps.map((s) => s.open);
  const riskSeries = snaps.map((s) => s.risk_score);
  const overdueSeries = snaps.map((s) => s.overdue);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Activity size={12} className="text-accent" />
        <span className="text-xs font-medium uppercase tracking-wider text-fg-muted">
          Momentum · last {snaps.length} day{snaps.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricTile
          label="Open tasks"
          value={last.open}
          delta={last.open - sevenDaysAgo.open}
          deltaLabel="vs 7d"
          series={openSeries}
          seriesLabel="overdue trend"
          subSeries={overdueSeries}
          tone="default"
          invertDelta // fewer open = better
        />
        <MetricTile
          label="Completion velocity"
          value={completed7d}
          valueSuffix="this wk"
          delta={completed7d - Math.max(0, completed30d - completed7d) / 3} // rough: weekly vs avg of prior 3 weeks
          deltaLabel="vs avg"
          series={pairwiseDelta(snaps.map((s) => s.completed))}
          seriesLabel="daily closes"
          subSeries={pairwiseDelta(snaps.map((s) => s.closed))}
          extraSuffix={closed7d > 0 ? `· ${closed7d} closed` : null}
          tone="success"
        />
        <MetricTile
          label="Risk score"
          value={Math.round(last.risk_score)}
          delta={last.risk_score - sevenDaysAgo.risk_score}
          deltaLabel="vs 7d"
          series={riskSeries}
          seriesLabel=""
          tone={last.risk_score > 50 ? "danger" : last.risk_score > 20 ? "warn" : "success"}
          invertDelta // lower risk = better
        />
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  valueSuffix,
  delta,
  deltaLabel,
  series,
  seriesLabel,
  subSeries,
  extraSuffix,
  tone,
  invertDelta,
}: {
  label: string;
  value: number;
  valueSuffix?: string;
  delta: number;
  deltaLabel: string;
  series: number[];
  seriesLabel: string;
  subSeries?: number[];
  extraSuffix?: string | null;
  tone: "default" | "success" | "warn" | "danger";
  invertDelta?: boolean;
}) {
  const rounded = Math.round(delta * 10) / 10;
  const improving = invertDelta ? rounded < 0 : rounded > 0;
  const worsening = invertDelta ? rounded > 0 : rounded < 0;
  const TrendIcon = rounded === 0 ? Minus : improving ? TrendingUp : TrendingDown;
  const deltaCls = rounded === 0
    ? "text-fg-subtle"
    : improving
      ? "text-success"
      : worsening
        ? "text-danger"
        : "text-fg-muted";
  const valueCls =
    tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "success" ? "text-success" : "text-fg";

  return (
    <div className="rounded-lg bg-bg-subtle p-3 space-y-1.5">
      <div className="text-xs uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className={`text-2xl font-semibold tabular ${valueCls}`}>{value}</div>
        {valueSuffix && <div className="text-xs text-fg-subtle">{valueSuffix}</div>}
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <TrendIcon size={11} className={deltaCls} />
        <span className={`tabular ${deltaCls}`}>
          {rounded > 0 ? "+" : ""}{rounded}
        </span>
        <span className="text-fg-subtle">{deltaLabel}</span>
        {extraSuffix && <span className="text-fg-subtle">· {extraSuffix}</span>}
      </div>
      {series.length >= 2 && (
        <Sparkline values={series} subValues={subSeries} tone={tone} ariaLabel={seriesLabel} />
      )}
    </div>
  );
}

function Sparkline({
  values,
  subValues,
  tone,
  ariaLabel,
}: {
  values: number[];
  subValues?: number[];
  tone: "default" | "success" | "warn" | "danger";
  ariaLabel: string;
}) {
  const w = 100;
  const h = 24;
  const stroke =
    tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : tone === "success" ? "var(--success)" : "var(--accent)";

  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const range = max - min || 1;
  const stepX = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values
    .map((v, i) => `${(i * stepX).toFixed(2)},${(h - ((v - min) / range) * h).toFixed(2)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6" role="img" aria-label={ariaLabel}>
      {subValues && subValues.length === values.length && (
        <Bars values={subValues} w={w} h={h} />
      )}
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
      <circle
        cx={(values.length - 1) * stepX}
        cy={h - ((values[values.length - 1] - min) / range) * h}
        r={1.6}
        fill={stroke}
      />
    </svg>
  );
}

function Bars({ values, w, h }: { values: number[]; w: number; h: number }) {
  const max = Math.max(...values, 1);
  const barW = (w / values.length) * 0.7;
  const gap = (w / values.length) * 0.3;
  return (
    <g opacity={0.18}>
      {values.map((v, i) => {
        const bh = (v / max) * h;
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={h - bh}
            width={barW}
            height={bh}
            fill="currentColor"
            className="text-fg-muted"
          />
        );
      })}
    </g>
  );
}

function pairwiseDelta(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) out.push(Math.max(0, values[i] - values[i - 1]));
  return out;
}

function daysAgo(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  return Math.round((now.getTime() - d.getTime()) / 86_400_000);
}
