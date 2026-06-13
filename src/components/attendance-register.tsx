"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Eraser, CalendarCheck } from "lucide-react";
import { Button } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { recordAttendanceAction, bulkRecordAttendanceAction } from "@/app/hrms/leave/actions";
import { ATTENDANCE_STATUSES, ATTENDANCE_ABBR, ATTENDANCE_CELL, type AttendanceStatus } from "@/lib/leave-shared";
import type { AttendanceMonth } from "@/lib/attendance";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type Brush = AttendanceStatus | "Clear";
const BRUSHES: Brush[] = ["Present", "Absent", "Remote", "Half-day", "Sick", "Clear"];

export function AttendanceRegister({ month, companies, basePath = "/hrms/leave" }: {
  month: AttendanceMonth;
  companies: Array<{ id: number; name: string }>;
  basePath?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [brush, setBrush] = useState<Brush>("Present");
  const [companyFilter, setCompanyFilter] = useState<number | "all">("all");
  const todayKey = new Date().toISOString().slice(0, 10);

  const people = useMemo(
    () => (companyFilter === "all" ? month.people : month.people.filter((p) => p.companyId === companyFilter)),
    [month.people, companyFilter]
  );

  const ymHref = (y: number, m: number) => `${basePath}?view=attendance&ym=${y}-${String(m).padStart(2, "0")}`;
  const prev = month.month === 1 ? { y: month.year - 1, m: 12 } : { y: month.year, m: month.month - 1 };
  const next = month.month === 12 ? { y: month.year + 1, m: 1 } : { y: month.year, m: month.month + 1 };

  // Status shown in a cell: recorded > derived leave > holiday. Editable only the recorded layer.
  function cellFor(personId: number, day: string): { status: AttendanceStatus | null; derived: boolean } {
    const rec = month.recorded[`${personId}:${day}`];
    if (rec) return { status: rec, derived: false };
    if (month.leave[`${personId}:${day}`]) return { status: "On leave", derived: true };
    if (month.holidays[day]) return { status: "Holiday", derived: true };
    return { status: null, derived: false };
  }

  function paint(personId: number, day: string, derived: boolean) {
    if (derived) { toast("That day is set by leave or a holiday.", { tone: "warn" }); return; }
    start(async () => {
      const res = await recordAttendanceAction(personId, day, brush === "Clear" ? null : brush);
      if (!res.ok) toast(res.error || "Couldn't save", { tone: "warn" });
      else router.refresh();
    });
  }

  function markAllToday() {
    if (brush === "Clear") return;
    const ids = people.map((p) => p.id);
    start(async () => {
      const res = await bulkRecordAttendanceAction(ids, todayKey, brush);
      toast(res.ok ? `Marked ${ids.length} ${brush} today` : (res.error || "Couldn't save"), { tone: res.ok ? "success" : "warn" });
      if (res.ok) router.refresh();
    });
  }

  const isToday = month.days.includes(todayKey);

  return (
    <div className="space-y-3">
      {/* Toolbar: month nav + company filter */}
      <div className="flex flex-wrap items-center gap-2">
        <a href={ymHref(prev.y, prev.m)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-bg-subtle ring-1 ring-border text-fg-muted hover:text-fg"><ChevronLeft size={15} /></a>
        <span className="text-sm font-semibold tabular min-w-[8.5rem] text-center">{MONTH_NAMES[month.month - 1]} {month.year}</span>
        <a href={ymHref(next.y, next.m)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-bg-subtle ring-1 ring-border text-fg-muted hover:text-fg"><ChevronRight size={15} /></a>
        <select value={companyFilter === "all" ? "all" : String(companyFilter)} onChange={(e) => setCompanyFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="h-8 rounded-lg bg-bg-subtle text-xs text-fg ring-1 ring-border px-2 focus:outline-none focus:ring-2 focus:ring-accent/40">
          <option value="all">All companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {isToday && brush !== "Clear" && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={markAllToday}><CalendarCheck size={14} /> Mark all {brush} today</Button>
        )}
      </div>

      {/* Brush palette */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-fg-subtle">Paint:</span>
        {BRUSHES.map((b) => {
          const active = brush === b;
          return (
            <button key={b} type="button" onClick={() => setBrush(b)}
              className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors",
                active ? "bg-accent text-accent-fg ring-accent" : b === "Clear" ? "bg-bg-subtle ring-border text-fg-muted hover:text-fg" : cn(ATTENDANCE_CELL[b as AttendanceStatus], "ring-transparent opacity-90 hover:opacity-100"))}>
              {b === "Clear" ? <Eraser size={12} /> : <span className="font-bold">{ATTENDANCE_ABBR[b as AttendanceStatus]}</span>} {b}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {people.length === 0 ? (
        <div className="glass elevated rounded-2xl text-center py-10 text-fg-muted text-sm">No people for this company.</div>
      ) : (
        <div className="glass elevated rounded-2xl overflow-auto">
          <table className="border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-bg-elev text-left font-medium text-fg-muted px-3 py-2 min-w-[9rem]">Person</th>
                {month.days.map((day) => {
                  const dow = new Date(day + "T00:00:00Z").getUTCDay();
                  const dnum = day.slice(8);
                  const hol = month.holidays[day];
                  return (
                    <th key={day} title={hol || undefined} className={cn("px-0 py-1 text-center font-medium w-7", dow === 0 && "bg-bg-muted/40 text-fg-subtle", day === todayKey && "bg-accent-soft text-accent", hol && "text-info")}>
                      <div className="leading-none">{dnum}</div>
                      <div className="text-[8px] text-fg-subtle">{["S", "M", "T", "W", "T", "F", "S"][dow]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-t border-border/40">
                  <td className="sticky left-0 z-10 bg-bg-elev px-3 py-1 font-medium text-fg truncate max-w-[12rem]">{p.name}</td>
                  {month.days.map((day) => {
                    const { status, derived } = cellFor(p.id, day);
                    const dow = new Date(day + "T00:00:00Z").getUTCDay();
                    return (
                      <td key={day} className={cn("p-0.5 text-center", dow === 0 && "bg-bg-muted/20")}>
                        <button type="button" disabled={pending} onClick={() => paint(p.id, day, derived)}
                          title={status ? `${p.name} · ${day} · ${status}${derived ? " (auto)" : ""}` : `${p.name} · ${day}`}
                          className={cn("h-6 w-6 rounded-md inline-flex items-center justify-center text-[10px] font-bold transition-colors",
                            status ? ATTENDANCE_CELL[status] : "bg-bg-muted/30 text-fg-subtle hover:bg-bg-muted/60",
                            derived && "opacity-60 cursor-not-allowed", day === todayKey && "ring-1 ring-accent/50")}>
                          {status ? ATTENDANCE_ABBR[status] : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-fg-subtle px-1">
        {ATTENDANCE_STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1"><span className={cn("h-3 w-3 rounded-sm inline-flex items-center justify-center font-bold text-[8px]", ATTENDANCE_CELL[s])}>{ATTENDANCE_ABBR[s]}</span>{s}</span>
        ))}
        <span className="text-fg-subtle/80">· On leave &amp; Holiday fill automatically.</span>
      </div>
    </div>
  );
}
