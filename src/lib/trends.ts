import { sb } from "@/db/supabase";

/** A single metric's movement over the snapshot window, or null when there
 *  isn't enough history (fewer than two distinct snapshot days). */
export type MetricTrend = { delta: number; days: number } | null;

export type PortfolioTrends = {
  open: MetricTrend;
  overdue: MetricTrend;
  critical: MetricTrend;
  blocked: MetricTrend;
  dueSoon: MetricTrend;
};

const EMPTY: PortfolioTrends = { open: null, overdue: null, critical: null, blocked: null, dueSoon: null };

/**
 * Portfolio-wide task trends from `daily_snapshots`. Snapshots are per-company,
 * so we sum each day across companies and compare the latest day against a
 * baseline roughly a week earlier (falling back to the oldest day we have).
 * Real history only — returns nulls until at least two distinct days exist.
 */
export async function getPortfolioTrends(): Promise<PortfolioTrends> {
  const { data } = await sb
    .from("daily_snapshots")
    .select("snapshot_date,open,overdue,critical,blocked,due_soon")
    .order("snapshot_date", { ascending: false })
    .limit(400);
  if (!data || data.length === 0) return EMPTY;

  type Agg = { open: number; overdue: number; critical: number; blocked: number; dueSoon: number };
  const byDate = new Map<string, Agg>();
  for (const r of data) {
    const d = new Date(r.snapshot_date as string).toISOString().slice(0, 10);
    const a = byDate.get(d) ?? { open: 0, overdue: 0, critical: 0, blocked: 0, dueSoon: 0 };
    a.open += (r.open as number) ?? 0;
    a.overdue += (r.overdue as number) ?? 0;
    a.critical += (r.critical as number) ?? 0;
    a.blocked += (r.blocked as number) ?? 0;
    a.dueSoon += (r.due_soon as number) ?? 0;
    byDate.set(d, a);
  }

  const dates = [...byDate.keys()].sort().reverse(); // newest first
  const latest = dates[0];
  if (!latest || dates.length < 2) return EMPTY;
  const latestMs = new Date(latest).getTime();
  const baseline = dates.find((d) => latestMs - new Date(d).getTime() >= 6 * 86400000) ?? dates[dates.length - 1];
  if (baseline === latest) return EMPTY;

  const cur = byDate.get(latest)!;
  const prev = byDate.get(baseline)!;
  const days = Math.max(1, Math.round((latestMs - new Date(baseline).getTime()) / 86400000));
  const mk = (a: number, b: number): MetricTrend => ({ delta: a - b, days });
  return {
    open: mk(cur.open, prev.open),
    overdue: mk(cur.overdue, prev.overdue),
    critical: mk(cur.critical, prev.critical),
    blocked: mk(cur.blocked, prev.blocked),
    dueSoon: mk(cur.dueSoon, prev.dueSoon),
  };
}
