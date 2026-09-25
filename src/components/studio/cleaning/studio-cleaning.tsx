/**
 * Cleaning — the oversight view, in Studio (26 Sept 2026). What a manager sees
 * of the office cleaning log the receptionist keeps: today's rooms, who cleaned,
 * whether the day was submitted, and the last fortnight. Read-only, like the
 * page it replaces (components/cleaning-overview.tsx); the receptionist's own
 * tick-list is unchanged. Pure render — a server component.
 */
import { Check, Clock, Lock, MessageSquare } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, Ring } from "@/components/studio/kit";
import { completion, dayStatus, type CleaningArea, type CleaningCheck, type CleaningDay, type DayStatus } from "@/lib/cleaning-shared";
import type { CleaningHistoryRow } from "@/components/cleaning-overview";
import { cn } from "@/lib/cn";

const TONE: Record<DayStatus, { dot: string; text: string; onCard: string }> = {
  "Signed": { dot: "var(--st-ok)", text: "var(--st-ok-text)", onCard: "#5BE0A5" },
  "Complete": { dot: "var(--st-ok)", text: "var(--st-ok-text)", onCard: "#5BE0A5" },
  "In progress": { dot: "var(--st-soon)", text: "var(--st-soon-text)", onCard: "#F5B94E" },
  "Not started": { dot: "#B9BBBF", text: "var(--st-muted)", onCard: "#C9CBCF" },
};
const EAT = "Africa/Nairobi";
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const time = (d: Date | null) => (d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: EAT }) : "");

export function StudioCleaningOverview({ dateIso, day, areas, checks, cleanerName, history }: {
  dateIso: string;
  day: CleaningDay;
  areas: CleaningArea[];
  checks: CleaningCheck[];
  cleanerName: string | null;
  history: CleaningHistoryRow[];
}) {
  const byArea = new Map(checks.map((c) => [c.areaId, c]));
  const doneN = areas.filter((a) => byArea.get(a.id)?.done).length;
  const comp = completion(doneN, areas.length);
  const status = dayStatus(day, doneN, areas.length);
  const past = [...history].reverse(); // oldest → newest, for the bars
  const complete = history.filter((h) => h.status === "Signed" || h.status === "Complete").length;

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader title="Cleaning" sub="The office cleaning log — the receptionist ticks each room; this is what was done, by whom and when." />
      <StudioCardRow>
        <StudioCard className="min-h-[190px]">
          <CardHead label={`Today · ${longDate(dateIso)}`} right={<span style={{ color: TONE[status].onCard }}>{status}</span>} />
          <div className="mt-auto flex items-end gap-5 pt-3">
            <Ring value={comp.pct} size={104} stroke={11} color={comp.pct >= 100 ? "var(--st-ok)" : "var(--st-soon)"} label={`${comp.done}/${comp.total}`} sub="rooms" />
            <div className="min-w-0 flex-1 space-y-1.5 pb-1 text-[13px]">
              <div>{cleanerName ? <>Cleaned by <b className="font-medium">{cleanerName}</b></> : <span className="text-[var(--st-on-card-muted)]">Nobody has started yet</span>}</div>
              {day.signedAt
                ? <div className="flex items-center gap-1.5 text-[#5BE0A5]"><Lock size={12} />Submitted at {time(day.signedAt)}</div>
                : <div className="text-[var(--st-on-card-muted)]">Not submitted yet</div>}
              {day.note && <div className="truncate text-[var(--st-on-card-muted)]">Note: {day.note}</div>}
            </div>
          </div>
        </StudioCard>
        <StudioCard texture="rings" className="min-h-[190px]">
          <CardHead label={`The last ${history.length} days logged`} right={<span>{complete} of {history.length} done</span>} />
          <div className="mt-auto flex h-[92px] items-end gap-1.5 pt-3" aria-label="Each bar is one day, filled by how much was cleaned">
            {past.map((h) => (
              <div key={h.date.toISOString()} title={`${shortDate(h.date)} · ${h.done}/${h.total} · ${h.status}`} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
                <div className="w-full rounded-[3px]" style={{ height: `${Math.max(6, h.total ? (h.done / h.total) * 100 : 0)}%`, background: TONE[h.status].dot }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-[var(--st-on-card-muted)]">
            <span>{past[0] ? shortDate(past[0].date) : ""}</span><span>Today</span>
          </div>
        </StudioCard>
      </StudioCardRow>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <section className="rounded-[20px] bg-[var(--st-surface)] p-5">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="m-0 text-[15px] font-semibold">Rooms today</h2><span className="text-xs text-[var(--st-muted)]">{comp.done} of {comp.total}</span></div>
          <div className="flex flex-col">
            {areas.map((a) => {
              const c = byArea.get(a.id);
              const done = !!c?.done;
              return (
                <div key={a.id} className="flex items-center gap-3 border-b border-[var(--st-line-soft)] py-2.5 last:border-0">
                  <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full", done ? "bg-[var(--st-ok)] text-white" : "border border-dashed border-[var(--st-line)] text-transparent")}><Check size={13} strokeWidth={3} /></span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-[13.5px]", done ? "font-medium" : "text-[var(--st-muted)]")}>{a.name}</div>
                    {c?.comment && <div className="flex items-center gap-1 truncate text-xs text-[var(--st-muted)]"><MessageSquare size={11} />{c.comment}</div>}
                  </div>
                  {done && c?.doneAt && <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--st-muted)]"><Clock size={11} />{time(c.doneAt)}</span>}
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-[20px] bg-[var(--st-surface)] p-5">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="m-0 text-[15px] font-semibold">Recent days</h2><span className="text-xs text-[var(--st-muted)]">newest first</span></div>
          <div className="flex flex-col">
            {history.length === 0 && <p className="py-6 text-center text-[13px] text-[var(--st-muted)]">No days logged yet.</p>}
            {history.map((h) => (
              <div key={h.date.toISOString()} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 border-b border-[var(--st-line-soft)] py-2.5 text-[13px] last:border-0">
                <span className="min-w-0 truncate">{shortDate(h.date)}<span className="text-[var(--st-muted)]">{h.cleanerName ? ` · ${h.cleanerName}` : ""}</span></span>
                <span className="tabular-nums text-xs text-[var(--st-muted)]">{h.done}/{h.total}</span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: TONE[h.status].text }}><span className="h-[7px] w-[7px] rounded-full" style={{ background: TONE[h.status].dot }} />{h.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </StudioScope>
  );
}
