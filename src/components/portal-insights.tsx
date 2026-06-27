"use client";

import { useEffect, useRef, useState } from "react";
import { TONE, type Tone } from "@/components/surface-kit";

/* ------------------------------------------------------------------ *
 * Portal Insights — presentational charts for the management
 * Insights page (manager / HR / director). CLIENT-ONLY: no server
 * imports (never @/lib/portal-auth or @/db/supabase). All numbers are
 * computed server-side and handed in as plain props; this file only
 * draws CSS bars + a calm count-up on the headline metrics.
 *
 * Reduced-motion safe BOTH ways: it honours the OS
 * prefers-reduced-motion AND the portal's own manual toggle
 * (data-motion="reduced" on <html>), matching the parity rule. When
 * motion is reduced, every number snaps and bars fill instantly.
 * ------------------------------------------------------------------ */

export type Segment = { label: string; count: number; tone: Tone };
export type CompanyOpen = { id: number; name: string; open: number; overdue: number };

export type PortalInsightsProps = {
  openTotal: number;
  overdueTotal: number;
  statuses: Segment[];
  priorities: Segment[];
  companies: CompanyOpen[];
};

/** True when motion should be suppressed — OS setting OR the portal's manual
 *  data-motion="reduced" attribute. Re-checked on mount (client only). */
function useReduced(): boolean {
  const [reduced, setReduced] = useState(true); // assume reduced until mounted → no SSR flash
  useEffect(() => {
    const os = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const manual = document.documentElement.getAttribute("data-motion") === "reduced";
    setReduced(os || manual);
  }, []);
  return reduced;
}

/** Calm cubic ease-out count-up; finishes instantly when motion is reduced. */
function useCountUp(target: number, reduced: boolean, duration = 900): number {
  const [value, setValue] = useState(reduced ? target : 0);
  const ref = useRef(0);
  useEffect(() => {
    if (reduced || target === 0) {
      setValue(target);
      ref.current = target;
      return;
    }
    const from = ref.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      setValue(next);
      ref.current = next;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, duration]);
  return value;
}

/** A single headline metric tile. */
function MetricTile({ label, value, tone, reduced }: { label: string; value: number; tone: Tone; reduced: boolean }) {
  const v = useCountUp(value, reduced);
  return (
    <div className="rounded-2xl bg-bg-elev ring-1 ring-border elevated p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular ${TONE[tone].text}`}>{v}</p>
    </div>
  );
}

/** One horizontal CSS bar; grows from 0 unless motion is reduced. */
function Bar({ value, max, tone, reduced }: { value: number; max: number; tone: Tone; reduced: boolean }) {
  const pct = max <= 0 ? 0 : Math.round((value / max) * 100);
  const [w, setW] = useState(reduced ? pct : 0);
  useEffect(() => {
    if (reduced) { setW(pct); return; }
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct, reduced]);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-bg-muted rounded-full h-2 overflow-hidden">
        <div
          className={`${TONE[tone].bar} h-full rounded-full ${reduced ? "" : "transition-[width] duration-700 ease-out"}`}
          style={{ width: `${w}%` }}
        />
      </div>
      <div className="w-8 text-right text-xs text-fg-muted tabular">{value}</div>
    </div>
  );
}

/** A labelled bar list inside a glass panel (status / priority). */
function BarList({ segments, reduced }: { segments: Segment[]; reduced: boolean }) {
  const max = Math.max(...segments.map((s) => s.count), 1);
  return (
    <div className="glass elevated rounded-2xl p-4 space-y-2.5">
      {segments.map((s) => (
        <div key={s.label} className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
          <div className="text-fg-muted truncate">{s.label}</div>
          <Bar value={s.count} max={max} tone={s.tone} reduced={reduced} />
        </div>
      ))}
    </div>
  );
}

export function PortalInsights({ openTotal, overdueTotal, statuses, priorities, companies }: PortalInsightsProps) {
  const reduced = useReduced();
  const maxCompanyOpen = Math.max(...companies.map((c) => c.open), 1);

  return (
    <div className="flex flex-col gap-5">
      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
        <MetricTile label="Open tasks" value={openTotal} tone="accent" reduced={reduced} />
        <MetricTile label="Overdue" value={overdueTotal} tone={overdueTotal > 0 ? "danger" : "success"} reduced={reduced} />
      </div>

      {/* Open by company */}
      <section className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted px-1">Open by company</p>
        <div className="glass elevated rounded-2xl p-4 space-y-2.5">
          {companies.length === 0 ? (
            <p className="py-2 text-sm text-fg-muted">No open tasks — all clear.</p>
          ) : (
            companies.map((c) => (
              <div key={c.id} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-sm">
                <div className="truncate text-fg">{c.name}</div>
                <Bar value={c.open} max={maxCompanyOpen} tone="accent" reduced={reduced} />
                {c.overdue > 0 ? (
                  <span className="shrink-0 inline-flex items-center rounded-full bg-danger-soft/60 px-2 py-0.5 text-[11px] font-medium text-danger ring-1 ring-danger/25">
                    {c.overdue} overdue
                  </span>
                ) : (
                  <span className="shrink-0 w-[1px]" aria-hidden />
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Status + priority */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted px-1">Status distribution</p>
          <BarList segments={statuses} reduced={reduced} />
        </section>
        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted px-1">Priority breakdown</p>
          <BarList segments={priorities} reduced={reduced} />
        </section>
      </div>
    </div>
  );
}
