"use client";
// Live per-model AI usage dashboard — the "AI usage" Settings card + the target
// of the ⌘K "AI today" card. Fetches /api/ai-usage/models (admin-gated) and
// renders §13-style budget bars (calls/quota, green→amber→red), a per-tier
// rollup, week total, a 7-day sparkline, and a "resets in Xh (midnight Pacific)"
// countdown. Pure client — imports only the client-safe ai-models.ts (no @/db).

import { useEffect, useState } from "react";
import { Gauge, RefreshCw } from "lucide-react";

type ModelRow = {
  model: string;
  tier: "fast" | "smart" | "vision";
  calls: number;
  tokens: number;
  quota: number | null;
  remaining: number | null;
  pct: number | null;
};
type Usage = {
  models: ModelRow[];
  tiers: { tier: "fast" | "smart" | "vision"; calls: number; tokens: number }[];
  totals: { today: { calls: number; tokens: number }; week: { calls: number; tokens: number } };
  trend: { date: string; calls: number; tokens: number }[];
  resetsAt: string;
  fallbacksTracked: boolean;
};

const TIER_LABEL: Record<string, string> = { fast: "Fast", smart: "Smart", vision: "Vision" };

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(n);
}

/** Bar colour by how much of the quota is spent. */
function barTone(pct: number | null): string {
  if (pct == null) return "bg-fg-subtle/40";
  if (pct >= 90) return "bg-danger";
  if (pct >= 65) return "bg-warn";
  return "bg-success";
}

/** "resets in Xh Ym" from an ISO instant. */
function untilReset(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function AiUsageDashboard() {
  const [data, setData] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [, tick] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/ai-usage/models", { cache: "no-store" });
      const d = r.ok ? ((await r.json()) as Usage) : null;
      if (d) { setData(d); setError(false); } else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  // Re-tick the countdown every minute (cheap; no re-fetch).
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (loading && !data) return <p className="text-[13px] text-fg-muted">Loading usage…</p>;
  if (error && !data) return <p className="text-[13px] text-fg-muted">Usage unavailable right now.</p>;
  if (!data) return null;

  const maxTrend = Math.max(1, ...data.trend.map((d) => d.calls));
  const hasToday = data.totals.today.calls > 0;

  return (
    <div className="space-y-4 tabular-nums">
      {/* Header row: today total · reset countdown · refresh */}
      <div className="flex items-center gap-2.5 text-sm">
        <span className="grid place-items-center w-7 h-7 rounded-lg border border-border text-fg-subtle shrink-0">
          <Gauge size={13} />
        </span>
        <div className="flex-1 min-w-0">
          <span className="block text-[13px] text-fg">
            {data.totals.today.calls} call{data.totals.today.calls !== 1 ? "s" : ""} today
            {data.totals.today.tokens > 0 ? ` · ${fmtTokens(data.totals.today.tokens)} tokens` : ""}
          </span>
          <span className="block text-[11px] text-fg-subtle">
            resets in {untilReset(data.resetsAt)} (midnight Pacific)
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh"
          className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Per-model budget bars */}
      {hasToday ? (
        <div className="space-y-2.5">
          {data.models.map((m) => (
            <div key={m.model} className="space-y-1">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="truncate text-fg">{m.model}</span>
                <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-subtle">
                  {TIER_LABEL[m.tier]}
                </span>
                <span className="ml-auto shrink-0 text-fg-muted">
                  {m.quota != null
                    ? `${m.calls}/${m.quota} today`
                    : `${m.calls} call${m.calls !== 1 ? "s" : ""}`}
                  {m.tokens > 0 ? ` · ${fmtTokens(m.tokens)} tok` : ""}
                </span>
              </div>
              {m.quota != null && (
                <div className="h-1.5 rounded-full bg-bg-muted/70 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barTone(m.pct)} transition-all`}
                    style={{ width: `${Math.max(2, m.pct ?? 0)}%` }}
                  />
                </div>
              )}
              {m.quota != null && m.remaining != null && (
                <span className="block text-[11px] text-fg-subtle">{m.remaining} left today</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-fg-muted">No AI calls yet today.</p>
      )}

      {/* Per-tier rollup */}
      <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
        {data.tiers.map((t) => (
          <div key={t.tier} className="rounded-lg border border-border/60 px-2.5 py-2">
            <span className="block text-[10px] uppercase tracking-wider text-fg-subtle">{TIER_LABEL[t.tier]}</span>
            <span className="block text-sm text-fg">{t.calls}</span>
            <span className="block text-[11px] text-fg-subtle">{fmtTokens(t.tokens)} tok</span>
          </div>
        ))}
      </div>

      {/* Week total + 7-day sparkline */}
      <div className="border-t border-border/60 pt-3">
        <div className="flex items-center justify-between text-[13px] mb-2">
          <span className="text-fg-muted">Last 7 days</span>
          <span className="text-fg">
            {data.totals.week.calls} calls · {fmtTokens(data.totals.week.tokens)} tokens
          </span>
        </div>
        <div className="flex items-end gap-1 h-10" aria-hidden>
          {data.trend.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col justify-end" title={`${d.date}: ${d.calls} calls`}>
              <div
                className="w-full rounded-sm bg-accent/60"
                style={{ height: `${Math.max(4, Math.round((d.calls / maxTrend) * 100))}%` }}
              />
            </div>
          ))}
        </div>
      </div>

      {!data.fallbacksTracked && (
        <p className="text-[11px] text-fg-subtle border-t border-border/60 pt-3">
          Fallbacks/429s aren&apos;t tracked — the ledger records successful calls only. Quotas are
          Google&apos;s stated free-tier limits and may change.
        </p>
      )}
    </div>
  );
}
