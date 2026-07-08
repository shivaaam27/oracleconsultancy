import { Check, MessageSquare, Lock, Clock, User as UserIcon, SprayCan } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  completion, dayStatus, dayStatusColor,
  type CleaningArea, type CleaningCheck, type CleaningDay, type DayStatus,
} from "@/lib/cleaning-shared";

/**
 * Read-only cleaning OVERVIEW — reflects the receptionist's ticks, comments and
 * sign-off for oversight roles (managers/directors in the portal). No editing: it
 * shows WHAT was cleaned, WHO cleaned, WHEN, and the day history. Pure render (no
 * hooks) so it can be a server component.
 */

const fmtLongDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const fmtShortDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
const fmtTime = (d: Date | null) => (d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

function Ring({ pct, done, total }: { pct: number; done: number; total: number }) {
  const r = 28, c = 2 * Math.PI * r;
  const tone = pct >= 100 ? "var(--color-success)" : pct > 0 ? "var(--color-warn)" : "var(--color-border-strong)";
  return (
    <div className="relative h-[74px] w-[74px] shrink-0">
      <svg width="74" height="74" className="-rotate-90">
        <circle cx="37" cy="37" r={r} fill="none" stroke="var(--color-border)" strokeWidth="6" />
        <circle cx="37" cy="37" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-semibold tabular leading-none">{done}/{total}</span>
        <span className="text-[9px] text-fg-subtle">rooms</span>
      </div>
    </div>
  );
}

export type CleaningHistoryRow = { date: Date; status: DayStatus; cleanerName: string | null; done: number; total: number };

export function CleaningOverview({
  dateIso, day, areas, checks, cleanerName, history,
}: {
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

  return (
    <div className="flex flex-col gap-4">
      {/* Today summary */}
      <Card className="flex items-center gap-4 p-4">
        <Ring pct={comp.pct} done={comp.done} total={comp.total} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{fmtLongDate(dateIso)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-medium", dayStatusColor[status])}>{status}</span>
            {cleanerName && <span className="inline-flex items-center gap-1 text-fg-muted"><UserIcon size={11} /> {cleanerName}</span>}
            {day.signedAt && <span className="inline-flex items-center gap-1 text-success"><Lock size={11} /> submitted {fmtTime(day.signedAt)}</span>}
          </div>
          {day.note && <p className="mt-1.5 text-[11px] text-fg-subtle">Note: {day.note}</p>}
        </div>
      </Card>

      {/* Room-by-room (read-only) */}
      <Card className="divide-y divide-border/70">
        {areas.map((area) => {
          const c = byArea.get(area.id);
          const done = !!c?.done;
          return (
            <div key={area.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                done ? "border-success bg-success text-white" : "border-border text-transparent")}>
                <Check size={13} strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn("text-sm", done ? "font-medium" : "text-fg-muted")}>{area.name}</div>
                {c?.comment && <div className="flex items-center gap-1 truncate text-[11px] text-fg-muted"><MessageSquare size={10} />{c.comment}</div>}
              </div>
              {done && c?.doneAt && <span className="shrink-0 text-[11px] text-fg-subtle inline-flex items-center gap-1"><Clock size={10} />{fmtTime(c.doneAt)}</span>}
            </div>
          );
        })}
      </Card>

      {/* Recent history */}
      {history.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
            <SprayCan size={12} /> Recent days
          </div>
          <Card className="divide-y divide-border/60">
            {history.map((h) => (
              <div key={h.date.toISOString()} className="flex items-center gap-2.5 px-4 py-2">
                <span className="min-w-0 flex-1 truncate text-xs">{fmtShortDate(h.date)}</span>
                {h.cleanerName && <span className="truncate text-[11px] text-fg-subtle">{h.cleanerName}</span>}
                <span className="shrink-0 text-[11px] tabular text-fg-subtle">{h.done}/{h.total}</span>
                <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium", dayStatusColor[h.status])}>{h.status}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
