"use client";

/**
 * The left-hand summary card on the Studio Tasks page: three views you step
 * through with ‹ › — Overview, By company, By person. Every number is a door:
 * it is a link to the same filter the rest of the page uses.
 *
 * All figures are computed on the server from the rows already loaded (see
 * TasksSection); this component only draws them.
 */
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CardHead, Dot, StudioPill } from "@/components/studio/kit";
import { cn } from "@/lib/cn";

export type InsightsData = {
  open: number;
  onTrackPct: number;
  bar: { late: number; soon: number; onSchedule: number; noDate: number };
  hrefs: { late: string; soon: string; noDate: string };
  tiles: { n: number; label: string; href: string }[];
  companies: { name: string; open: number; late: number; href: string }[];
  people: { name: string; open: number; late: number; href: string }[];
};

const TITLES = ["Overview", "By company · open, and how many are late", "By person · who is carrying the most"];

export function InsightsCard({ data }: { data: InsightsData }) {
  // A view with nothing in it is left out (a member of staff has no "by
  // person"); with only the Overview left there is nothing to step through.
  const pages = [0, ...(data.companies.length ? [1] : []), ...(data.people.length ? [2] : [])];
  const [k, setK] = useState(0);
  const i = pages[k % pages.length];
  const step = (d: number) => setK((n) => (n + d + pages.length) % pages.length);
  const total = Math.max(1, data.bar.late + data.bar.soon + data.bar.onSchedule + data.bar.noDate);
  const pct = (n: number) => `${(n / total) * 100}%`;
  const maxCo = Math.max(1, ...data.companies.map((c) => c.open));
  const maxP = Math.max(1, ...data.people.map((p) => p.open));

  return (
    <div data-st-dark="" className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] bg-[var(--st-card)] px-[18px] py-4 text-[var(--st-on-card)] sm:px-6 sm:py-5">
      <CardHead
        label={TITLES[i]}
        right={pages.length < 2 ? undefined :
          <>
            {pages.map((p) => (
              <span key={p} aria-hidden className="h-1.5 rounded-full transition-all" style={{ width: p === i ? 16 : 6, background: p === i ? "var(--st-on-card)" : "#3A3D42" }} />
            ))}
            <button type="button" aria-label="Previous view" onClick={() => step(-1)} className="ml-1 flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-[var(--st-card-line)] text-[#C9CBCF] hover:bg-[var(--st-card-2)]"><ChevronLeft size={12} /></button>
            <button type="button" aria-label="Next view" onClick={() => step(1)} className="flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-[var(--st-card-line)] text-[#C9CBCF] hover:bg-[var(--st-card-2)]"><ChevronRight size={12} /></button>
          </>
        }
      />

      {i === 0 && (
        <div key="o" className="st-pop mt-3 grid flex-1 grid-cols-1 items-end gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-7">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="text-[60px] leading-[0.85] tracking-[-0.045em] tabular-nums lg:text-[76px]">{data.open}</span>
              <span className="text-lg text-[var(--st-muted)]">open {data.open === 1 ? "task" : "tasks"}</span>
              <StudioPill onCard dot="var(--st-ok)" className="self-end bg-[#1D2A23] text-[#5BE0A5]">{data.onTrackPct}% on track</StudioPill>
            </div>
            <div>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]" aria-hidden>
                <span style={{ width: pct(data.bar.late), background: "var(--st-late)" }} />
                <span style={{ width: pct(data.bar.soon), background: "var(--st-soon)" }} />
                <span style={{ width: pct(data.bar.onSchedule), background: "var(--st-ok)" }} />
                <span style={{ flexGrow: 1, background: "#3A3D42" }} />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#C9CBCF]">
                <Link href={data.hrefs.late} scroll={false} className="flex items-center gap-1.5 hover:text-white"><Dot color="var(--st-late)" />{data.bar.late} late</Link>
                <Link href={data.hrefs.soon} scroll={false} className="flex items-center gap-1.5 hover:text-white"><Dot color="var(--st-soon)" />{data.bar.soon} due soon</Link>
                <span className="flex items-center gap-1.5"><Dot color="var(--st-ok)" />{data.bar.onSchedule} on schedule</span>
                <Link href={data.hrefs.noDate} scroll={false} className="flex items-center gap-1.5 hover:text-white"><Dot color="#5B5E63" />{data.bar.noDate} no date</Link>
              </div>
            </div>
          </div>
          <div className="hidden grid-cols-4 gap-1.5 sm:grid lg:grid-cols-2 lg:gap-2">
            {data.tiles.map((t) => (
              <Link key={t.label} href={t.href} scroll={false} className="min-w-0 rounded-xl border border-[#2A2C30] bg-[var(--st-card-2)] px-2 py-2 transition-colors hover:border-[#3A3D42] lg:px-3 lg:py-2.5">
                <div className="text-xl leading-tight tracking-[-0.02em] tabular-nums">{t.n}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-[var(--st-muted)]">{t.label}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {i === 1 && (
        <div key="c" className="st-pop mt-3 grid flex-1 grid-cols-2 content-end gap-x-6 gap-y-3.5 sm:grid-cols-3">
          {data.companies.length === 0 && <div className="text-[13px] text-[var(--st-muted)]">No open tasks.</div>}
          {data.companies.map((c) => (
            <Link key={c.name} href={c.href} scroll={false} className="min-w-0 hover:opacity-90">
              <div className="flex justify-between gap-2 text-xs">
                <span className="truncate">{c.name}</span>
                <span className="st-mono whitespace-nowrap text-[var(--st-on-card-muted)]">{c.open}{c.late > 0 && <span className="text-[#F07BBE]"> · {c.late} late</span>}</span>
              </div>
              <div className="mt-1.5 flex h-[5px] overflow-hidden rounded-[3px] bg-[var(--st-card-line)]">
                <span style={{ width: `${((c.open - c.late) / maxCo) * 100}%`, background: "var(--st-ok)" }} />
                <span style={{ width: `${(c.late / maxCo) * 100}%`, background: "var(--st-late)" }} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {i === 2 && (
        <div key="p" className="st-pop mt-3 grid flex-1 grid-cols-2 items-end gap-5 sm:grid-cols-4">
          {data.people.length === 0 && <div className="text-[13px] text-[var(--st-muted)]">Nobody has open work assigned.</div>}
          {data.people.map((p) => (
            <Link key={p.name} href={p.href} scroll={false} className="min-w-0 hover:opacity-90">
              <div className="flex items-baseline gap-1.5"><span className="text-[40px] leading-none tracking-[-0.03em] tabular-nums">{p.open}</span><span className="text-xs text-[var(--st-muted)]">open</span></div>
              <div className="mt-2.5 flex h-[5px] overflow-hidden rounded-[3px] bg-[var(--st-card-line)]">
                <span style={{ width: `${((p.open - p.late) / maxP) * 100}%`, background: "var(--st-ok)" }} />
                <span style={{ width: `${(p.late / maxP) * 100}%`, background: "var(--st-late)" }} />
              </div>
              <div className="mt-2.5 truncate text-[13px]">{p.name}</div>
              <div className={cn("text-[11px]", p.late ? "text-[#F07BBE]" : "text-[var(--st-muted)]")}>{p.late ? `${p.late} late` : "none late"}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
