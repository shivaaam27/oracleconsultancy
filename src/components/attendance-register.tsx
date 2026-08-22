"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Eraser, CalendarCheck } from "lucide-react";
import { Button, Select } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { recordAttendanceAction, bulkRecordAttendanceAction } from "@/app/hrms/leave/actions";
import { ATTENDANCE_STATUSES, ATTENDANCE_ABBR, ATTENDANCE_CELL, type AttendanceStatus } from "@/lib/leave-shared";
import type { AttendanceMonth } from "@/lib/attendance";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type Brush = AttendanceStatus | "Clear";
// "On leave" is painted by hand now that the Leave module is retired (it used to
// be derived from an approved leave request). "Holiday" stays derived-only — it
// comes from the public-holidays list on the Holidays tab.
const BRUSHES: Brush[] = ["Present", "Absent", "On leave", "Remote", "Half-day", "Sick", "Clear"];

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

  // ----- Mobile condensed mode (one person, one week at a time) -----
  // Group the month into Mon–Sun weeks (only days that fall within the month).
  const weeks = useMemo(() => {
    const out: string[][] = [];
    let cur: string[] = [];
    for (const day of month.days) {
      const dow = new Date(day + "T00:00:00Z").getUTCDay();
      // Monday starts a fresh week; the first day always opens one.
      if (dow === 1 && cur.length) { out.push(cur); cur = []; }
      cur.push(day);
    }
    if (cur.length) out.push(cur);
    return out;
  }, [month.days]);

  // Default the mobile week to the one containing today (else the first week).
  const [weekIdx, setWeekIdx] = useState<number>(() => {
    const i = weeks.findIndex((w) => w.includes(todayKey));
    return i >= 0 ? i : 0;
  });
  const safeWeekIdx = Math.min(weekIdx, Math.max(0, weeks.length - 1));
  const currentWeek = weeks[safeWeekIdx] ?? [];

  // The person picked for the mobile day-list. Falls back to the first in the
  // (company-filtered) list if the previous pick has filtered out.
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const selectedPerson = useMemo(
    () => people.find((p) => p.id === selectedPersonId) ?? people[0] ?? null,
    [people, selectedPersonId]
  );

  const ymHref = (y: number, m: number) => `${basePath}?view=attendance&ym=${y}-${String(m).padStart(2, "0")}`;
  const prev = month.month === 1 ? { y: month.year - 1, m: 12 } : { y: month.year, m: month.month - 1 };
  const next = month.month === 12 ? { y: month.year + 1, m: 1 } : { y: month.year, m: month.month + 1 };

  // Status shown in a cell: recorded > derived leave > holiday. Editable only the recorded layer.
  // `selfBy` is the staff name when the cell was a portal self-check-in (note "portal:<Name>").
  function cellFor(personId: number, day: string): { status: AttendanceStatus | null; derived: boolean; selfBy: string | null } {
    const rec = month.recorded[`${personId}:${day}`];
    if (rec) {
      const note = month.notes[`${personId}:${day}`] ?? "";
      const selfBy = note.startsWith("portal:") ? note.slice("portal:".length) : null;
      return { status: rec, derived: false, selfBy };
    }
    if (month.leave[`${personId}:${day}`]) return { status: "On leave", derived: true, selfBy: null };
    if (month.holidays[day]) return { status: "Holiday", derived: true, selfBy: null };
    return { status: null, derived: false, selfBy: null };
  }

  function paint(personId: number, day: string, derived: boolean) {
    if (derived) { toast("That day fills in automatically — it's a public holiday.", { tone: "warn" }); return; }
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
      {/* Toolbar: month nav + company filter. Controls are a comfortable 44px
          on phones (h-11) and tighten to h-8 from sm up. */}
      <div className="flex flex-wrap items-center gap-2">
        <a href={ymHref(prev.y, prev.m)} className="h-11 w-11 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-lg bg-bg-subtle ring-1 ring-border text-fg-muted hover:text-fg"><ChevronLeft size={18} className="sm:hidden" /><ChevronLeft size={15} className="hidden sm:block" /></a>
        <span className="text-sm font-semibold tabular min-w-[8.5rem] text-center">{MONTH_NAMES[month.month - 1]} {month.year}</span>
        <a href={ymHref(next.y, next.m)} className="h-11 w-11 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-lg bg-bg-subtle ring-1 ring-border text-fg-muted hover:text-fg"><ChevronRight size={18} className="sm:hidden" /><ChevronRight size={15} className="hidden sm:block" /></a>
        <Select value={companyFilter === "all" ? "all" : String(companyFilter)} onChange={(e) => setCompanyFilter(e.target.value === "all" ? "all" : Number(e.target.value))}>
          <option value="all">All companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {isToday && brush !== "Clear" && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={markAllToday} className="h-11 sm:h-8"><CalendarCheck size={14} /> Mark all {brush} today</Button>
        )}
      </div>

      {/* Brush palette — shared by both modes; chips sit at a 44px target on
          phones (py-2.5) and tighten to py-1 from sm up. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-fg-subtle">Paint:</span>
        {BRUSHES.map((b) => {
          const active = brush === b;
          return (
            <button key={b} type="button" onClick={() => setBrush(b)}
              className={cn("inline-flex items-center gap-1 rounded-full px-3 sm:px-2.5 py-2.5 sm:py-1 text-xs sm:text-xs font-medium ring-1 transition-colors",
                active ? "bg-accent text-accent-fg ring-accent" : b === "Clear" ? "bg-bg-subtle ring-border text-fg-muted hover:text-fg" : cn(ATTENDANCE_CELL[b as AttendanceStatus], "ring-transparent opacity-90 hover:opacity-100"))}>
              {b === "Clear" ? <Eraser size={13} /> : <span className="font-bold">{ATTENDANCE_ABBR[b as AttendanceStatus]}</span>} {b}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {people.length === 0 ? (
        <div className="glass elevated rounded-2xl text-center py-10 text-fg-muted text-sm">No people for this company.</div>
      ) : (
        <>
          {/* Desktop / tablet — the full month grid (brush-paint, self-check-in
              badge). Hidden on phones, where the 31-column grid forces a long
              horizontal scroll and only 4–5 days are ever in view. */}
          <div className="hidden sm:block glass elevated rounded-2xl overflow-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-bg-elev text-left font-medium text-fg-muted px-3 py-2 min-w-[7.5rem]">Person</th>
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
                    <td className="sticky left-0 z-10 bg-bg-elev px-3 py-1 font-medium text-fg truncate max-w-[10rem]">{p.name}</td>
                    {month.days.map((day) => {
                      const { status, derived, selfBy } = cellFor(p.id, day);
                      const dow = new Date(day + "T00:00:00Z").getUTCDay();
                      const title = status
                        ? `${p.name} · ${day} · ${status}${derived ? " (auto)" : selfBy ? ` (self check-in by ${selfBy})` : ""}`
                        : `${p.name} · ${day}`;
                      return (
                        <td key={day} className={cn("p-0.5 text-center", dow === 0 && "bg-bg-muted/20")}>
                          <button type="button" disabled={pending} onClick={() => paint(p.id, day, derived)}
                            title={title}
                            className={cn("relative h-6 w-6 rounded-md inline-flex items-center justify-center text-xs font-bold transition-colors",
                              status ? ATTENDANCE_CELL[status] : "bg-bg-muted/30 text-fg-subtle hover:bg-bg-muted/60",
                              derived && "opacity-60 cursor-not-allowed", day === todayKey && "ring-1 ring-accent/50")}>
                            {status ? ATTENDANCE_ABBR[status] : ""}
                            {selfBy && <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones — condensed mode: pick a person, step through their weeks,
              tap a day to paint it with the current brush. Large tap targets,
              no horizontal scroll. */}
          <div className="sm:hidden space-y-3">
            {/* Person picker */}
            <Select wrapperClassName="w-full"
              value={selectedPerson ? String(selectedPerson.id) : ""}
              onChange={(e) => setSelectedPersonId(Number(e.target.value))}
              className="text-fg"
            >
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>

            {/* Week stepper */}
            <div className="flex items-center gap-2">
              <button type="button" disabled={safeWeekIdx <= 0} onClick={() => setWeekIdx(safeWeekIdx - 1)}
                aria-label="Previous week"
                className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-bg-subtle ring-1 ring-border text-fg-muted hover:text-fg disabled:opacity-40">
                <ChevronLeft size={18} />
              </button>
              <span className="flex-1 text-center text-sm font-medium tabular">
                {currentWeek.length > 0
                  ? `${new Date(currentWeek[0] + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(currentWeek[currentWeek.length - 1] + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`
                  : "—"}
              </span>
              <button type="button" disabled={safeWeekIdx >= weeks.length - 1} onClick={() => setWeekIdx(safeWeekIdx + 1)}
                aria-label="Next week"
                className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-bg-subtle ring-1 ring-border text-fg-muted hover:text-fg disabled:opacity-40">
                <ChevronRight size={18} />
              </button>
            </div>

            {/* This person's days for the chosen week — each a large tap target. */}
            {selectedPerson && (
              <div className="glass elevated rounded-2xl divide-y divide-border/40 overflow-hidden">
                {currentWeek.map((day) => {
                  const { status, derived, selfBy } = cellFor(selectedPerson.id, day);
                  const hol = month.holidays[day];
                  const weekday = new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
                  const dnum = day.slice(8);
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={pending}
                      onClick={() => paint(selectedPerson.id, day, derived)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors min-h-[3.5rem]",
                        day === todayKey ? "bg-accent-soft/40" : "hover:bg-bg-muted/40",
                        derived && "opacity-70"
                      )}
                    >
                      {/* Date block */}
                      <span className="shrink-0 w-12 text-center">
                        <span className="block text-xs uppercase tracking-wider text-fg-subtle">{weekday}</span>
                        <span className={cn("block text-base font-semibold tabular", day === todayKey && "text-accent")}>{dnum}</span>
                      </span>
                      {/* Status pill */}
                      <span className="flex-1 min-w-0">
                        {status ? (
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", ATTENDANCE_CELL[status])}>
                            <span className="font-bold">{ATTENDANCE_ABBR[status]}</span>
                            {status}
                            {derived && <span className="text-xs opacity-70">(auto)</span>}
                            {selfBy && <span className="text-xs opacity-70">· self check-in</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-fg-subtle">Not recorded</span>
                        )}
                        {hol && <span className="block text-xs text-info mt-0.5 truncate">{hol}</span>}
                      </span>
                      {/* What a tap will do (the active brush) */}
                      {!derived && (
                        <span className="shrink-0 text-xs text-fg-subtle">
                          Tap → <span className="font-medium text-fg">{brush}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-subtle px-1">
        {ATTENDANCE_STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1"><span className={cn("h-3 w-3 rounded-sm inline-flex items-center justify-center font-bold text-[8px]", ATTENDANCE_CELL[s])}>{ATTENDANCE_ABBR[s]}</span>{s}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="relative h-3 w-3 rounded-sm bg-bg-muted inline-flex"><span className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-fg-muted opacity-70" /></span>Staff self check-in</span>
        <span className="text-fg-subtle/80">· Holidays fill in automatically — manage them on the Holidays tab.</span>
      </div>
    </div>
  );
}
