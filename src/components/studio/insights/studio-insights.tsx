/**
 * Insights in Studio (26 Sept 2026, mockup board Insights) — how the work is
 * spread: who finished most this month (a podium), how heavy everyone's load
 * is (a gauge), open work by company and by person, and the status and
 * priority mix. Every number is a door into the task list it counts.
 * Pure render: the page works everything out.
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, Arc } from "@/components/studio/kit";
import { PersonFace } from "@/components/studio/face";

export type InsightsBar = { key: string; label: string; open: number; late: number; href: string };
export type InsightsSlice = { label: string; n: number; color: string; href?: string };
export type StudioInsightsData = {
  monthLabel: string;
  prevHref: string;
  nextHref: string | null;
  finished: { id: number; name: string; n: number; href: string }[];
  finishedTotal: number;
  openTotal: number;
  average: number;
  heaviest: { name: string; open: number; late: number; href: string } | null;
  aboveAverage: number;
  mostLate: { name: string; late: number; open: number } | null;
  byCompany: InsightsBar[];
  byPerson: InsightsBar[];
  status: InsightsSlice[];
  priority: InsightsSlice[];
};

const shortName = (n: string) => n.replace(/^(Mr|Mrs|Ms|Miss|Dr|Chef)\.?\s+/i, "");

function Bars({ rows, empty }: { rows: InsightsBar[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.open));
  if (rows.length === 0) return <p className="py-6 text-center text-[13px] text-[var(--st-muted)]">{empty}</p>;
  return (
    <div className="mt-2 flex flex-col">
      {rows.map((r) => (
        <Link key={r.key} href={r.href} className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_56px_26px] items-center gap-x-2.5 rounded-lg px-1 py-[5px] text-xs transition-colors hover:bg-[var(--st-page)]">
          <span className="truncate">{r.label}</span>
          <span className="flex h-2 overflow-hidden rounded-[4px] bg-[var(--st-line-soft)]">
            <span style={{ width: `${((r.open - r.late) / max) * 100}%`, background: "var(--st-ink)" }} />
            <span style={{ width: `${(r.late / max) * 100}%`, background: "var(--st-late)" }} />
          </span>
          <span className="text-[11px] text-[var(--st-late-text)]">{r.late ? `${r.late} late` : ""}</span>
          <span className="text-right font-medium tabular-nums">{r.open}</span>
        </Link>
      ))}
    </div>
  );
}

function Donut({ parts, size = 132, stroke = 18 }: { parts: InsightsSlice[]; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.n, 0) || 1;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--st-line-soft)" strokeWidth={stroke} />
      {parts.filter((p) => p.n > 0).map((p) => {
        const L = (c * p.n) / total;
        const el = <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={`${Math.max(L - 2, 0.5)} ${c}`} strokeDashoffset={-off} />;
        off += L;
        return el;
      })}
    </svg>
  );
}
function Legend({ parts }: { parts: InsightsSlice[] }) {
  return (
    <div className="flex w-full flex-col gap-1.5 text-xs">
      {parts.map((p) => {
        const inner = <><span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.color }} /><span className="flex-1">{p.label}</span><b className="font-medium tabular-nums">{p.n}</b></>;
        return p.href
          ? <Link key={p.label} href={p.href} className="flex items-center gap-2 rounded-md px-1 hover:bg-[var(--st-page)]">{inner}</Link>
          : <span key={p.label} className="flex items-center gap-2 px-1">{inner}</span>;
      })}
    </div>
  );
}

export function StudioInsights({ d }: { d: StudioInsightsData }) {
  const podium = d.finished.slice(0, 3);
  const rest = d.finished.slice(3, 8);
  const top = Math.max(1, ...podium.map((p) => p.n));
  const H = [128, 96, 72]; // fits the one card height (250px)
  const fill = d.heaviest ? Math.min(100, (d.average / Math.max(d.heaviest.open, 1)) * 100) : 0;

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader
        title="Insights"
        left={
          <div className="flex h-9 items-center gap-1 rounded-[11px] border border-[var(--st-line)] bg-[var(--st-surface)] px-1">
            <Link href={d.prevHref} scroll={false} aria-label="Previous month" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--st-page)]"><ChevronLeft size={14} /></Link>
            <span className="px-1.5 text-[13px] font-medium">{d.monthLabel}</span>
            {d.nextHref
              ? <Link href={d.nextHref} scroll={false} aria-label="Next month" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--st-page)]"><ChevronRight size={14} /></Link>
              : <span className="grid h-7 w-7 place-items-center text-[var(--st-line)]"><ChevronRight size={14} /></span>}
          </div>
        }
        right={<Link href="/?report=1" className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3.5 text-[13px] hover:bg-[var(--st-page)]"><FileText size={14} />Report</Link>}
      />

      <StudioCardRow>
        <StudioCard className="min-h-[220px]">
          <CardHead label={`Finished in ${d.monthLabel}`} right={<span>{d.finishedTotal} tasks completed · directors excluded</span>} />
          {podium.length === 0 ? (
            <div className="mt-auto pt-4 text-[15px] text-[var(--st-on-card-muted)]">Nothing finished yet this month.</div>
          ) : (
            <div className="mt-auto flex items-end gap-4 pt-4">
              {podium.map((p, k) => (
                <Link key={p.id} href={p.href} className="flex min-w-0 flex-1 flex-col gap-2 hover:opacity-90">
                  <span className="flex min-w-0 items-center gap-2"><PersonFace name={p.name} size={26} /><span className="truncate text-[13px]">{shortName(p.name)}</span></span>
                  <span className="st-rise flex items-start rounded-[10px] px-3 py-2.5"
                    style={{ height: Math.max(56, (H[k] * p.n) / top), background: k === 0 ? "#F2F2F0" : k === 1 ? "#3A3D42" : "#2A2C30", color: k === 0 ? "#111214" : "#F2F2F0", animationDelay: `${k * 90}ms` }}>
                    <span className="text-[28px] leading-none tracking-[-0.03em] tabular-nums">{p.n}</span>
                  </span>
                </Link>
              ))}
              {rest.length > 0 && (
                <div className="hidden w-[150px] shrink-0 pb-1 text-xs leading-relaxed text-[var(--st-on-card-muted)] xl:block">
                  Then {rest.map((p) => `${shortName(p.name).split(" ")[0]} ${p.n}`).join(", ")}{d.finished.length > 8 ? "…" : ""}. Tap anyone to see their tasks.
                </div>
              )}
            </div>
          )}
        </StudioCard>
        <StudioCard texture="rings" className="min-h-[220px]">
          <CardHead label="Workload" right={<span>open tasks per person</span>} />
          <div className="mt-auto grid grid-cols-1 items-end gap-5 pt-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
            <div className="relative mx-auto w-full max-w-[260px]">
              <Arc value={fill} width={260} stroke={20} color="#F5A524" track="#2A2C30" />
              <div className="absolute inset-x-0 bottom-0 text-center">
                <div className="text-[40px] leading-none tracking-[-0.04em] tabular-nums">{d.average % 1 === 0 ? d.average : d.average.toFixed(1)}</div>
                <div className="text-xs text-[var(--st-on-card-muted)]">open each, on average</div>
              </div>
            </div>
            <div className="flex flex-col gap-2 pb-1">
              {d.heaviest ? (
                <Link href={d.heaviest.href} className="text-[14px] leading-snug hover:underline">{shortName(d.heaviest.name)} carries <b className="font-semibold">{d.heaviest.open}</b>{d.heaviest.open > d.average * 1.5 ? " — well above the average." : "."}</Link>
              ) : <div className="text-[14px]">Nobody has open work.</div>}
              <div className="text-[13px] text-[var(--st-on-card-muted)]">
                {d.aboveAverage} {d.aboveAverage === 1 ? "person is" : "people are"} above average.{d.mostLate && d.mostLate.late > 0 ? ` ${shortName(d.mostLate.name)} has ${d.mostLate.late} of ${d.mostLate.open} late.` : ""}
              </div>
              <div className="text-xs text-[var(--st-on-card-muted)]">{d.openTotal} open tasks in all</div>
            </div>
          </div>
        </StudioCard>
      </StudioCardRow>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-[20px] bg-[var(--st-surface)] p-5">
          <div className="flex items-baseline justify-between"><h2 className="m-0 text-[15px] font-semibold">Open by company</h2><span className="text-xs text-[var(--st-muted)]">late in pink</span></div>
          <Bars rows={d.byCompany} empty="No open work anywhere." />
        </section>
        <section className="rounded-[20px] bg-[var(--st-surface)] p-5">
          <div className="flex items-baseline justify-between"><h2 className="m-0 text-[15px] font-semibold">Open per person</h2><span className="text-xs text-[var(--st-muted)]">average {d.average % 1 === 0 ? d.average : d.average.toFixed(1)}</span></div>
          <Bars rows={d.byPerson} empty="Nobody has open work." />
        </section>
        <section className="rounded-[20px] bg-[var(--st-surface)] p-5 lg:col-span-2 xl:col-span-1">
          <h2 className="m-0 text-[15px] font-semibold">Status and priority</h2>
          <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col items-center gap-3"><Donut parts={d.status} /><span className="text-[11px] text-[var(--st-muted)]">Every task, by status</span><Legend parts={d.status} /></div>
            <div className="flex flex-col items-center gap-3"><Donut parts={d.priority} /><span className="text-[11px] text-[var(--st-muted)]">Open tasks, by priority</span><Legend parts={d.priority} /></div>
          </div>
        </section>
      </div>
    </StudioScope>
  );
}
