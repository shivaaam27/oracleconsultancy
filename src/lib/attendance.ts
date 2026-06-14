import { sb } from "@/db/supabase";
import type { AttendanceStatus } from "@/lib/leave-shared";

/** YYYY-MM-DD for a Date or ISO string (UTC day). */
function isoDay(v: string | Date): string {
  return new Date(v).toISOString().slice(0, 10);
}
function utcMidnight(y: number, m0: number, d: number): string {
  return new Date(Date.UTC(y, m0, d)).toISOString();
}

export type AttendancePerson = { id: number; name: string; companyId: number | null };
export type AttendanceMonth = {
  year: number;
  month: number; // 1-12
  days: string[]; // YYYY-MM-DD for every day of the month
  people: AttendancePerson[];
  /** Recorded status, keyed `${personId}:${YYYY-MM-DD}`. */
  recorded: Record<string, AttendanceStatus>;
  /** Provenance note for recorded cells, keyed `${personId}:${YYYY-MM-DD}`. A
   *  `portal:<Name>` value marks a staff self-check-in (badged in the register);
   *  admin writes are stamped `web-ui`. */
  notes: Record<string, string>;
  /** Approved-leave overlay (derived), keyed `${personId}:${YYYY-MM-DD}` → type name. */
  leave: Record<string, string>;
  /** Public holidays for the month, keyed YYYY-MM-DD → holiday name. */
  holidays: Record<string, string>;
};

/** One person's days within an approved leave request range (whole-day only). */
function eachDay(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const d = new Date(isoDay(startISO) + "T00:00:00Z");
  const last = new Date(isoDay(endISO) + "T00:00:00Z");
  while (d <= last) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

/** Whole-month register data for the admin grid. */
export async function getAttendanceMonth(year: number, month: number): Promise<AttendanceMonth> {
  const startISO = utcMidnight(year, month - 1, 1);
  const endISO = utcMidnight(year, month, 1);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => isoDay(utcMidnight(year, month - 1, i + 1)));
  const monthDays = new Set(days);

  const [{ data: peopleRaw }, { data: att }, { data: leaveRaw }, { data: hols }] = await Promise.all([
    sb.from("people").select("id,name,company_id").eq("active", true).order("name"),
    sb.from("attendance").select("person_id,date,status,note").gte("date", startISO).lt("date", endISO),
    sb.from("leave_requests").select("person_id,start_date,end_date,status, leave_types(name)").eq("status", "Approved").lt("start_date", endISO).gte("end_date", startISO),
    sb.from("public_holidays").select("date,name"),
  ]);

  const recorded: Record<string, AttendanceStatus> = {};
  const notes: Record<string, string> = {};
  for (const r of att ?? []) {
    const key = `${r.person_id}:${isoDay(r.date as string)}`;
    recorded[key] = r.status as AttendanceStatus;
    const note = r.note as string | null;
    if (note) notes[key] = note;
  }

  const leave: Record<string, string> = {};
  for (const lr of leaveRaw ?? []) {
    const lt = lr.leave_types as { name: string } | { name: string }[] | null;
    const typeName = Array.isArray(lt) ? lt[0]?.name : lt?.name;
    for (const day of eachDay(lr.start_date as string, lr.end_date as string)) {
      if (monthDays.has(day)) leave[`${lr.person_id}:${day}`] = typeName ?? "Leave";
    }
  }

  const holidays: Record<string, string> = {};
  for (const h of hols ?? []) { const d = isoDay(h.date as string); if (monthDays.has(d)) holidays[d] = h.name as string; }

  return {
    year, month, days,
    people: (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string, companyId: (p.company_id as number | null) ?? null })),
    recorded, notes, leave, holidays,
  };
}

/** Today's attendance state for one person — drives the portal check-in prompt. */
export async function personAttendanceToday(personId: number): Promise<{ status: AttendanceStatus | null; editable: boolean; lockReason: string | null }> {
  const now = new Date();
  const iso = utcMidnight(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const nextIso = utcMidnight(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const [{ data: att }, { data: leave }, { data: hol }] = await Promise.all([
    sb.from("attendance").select("status").eq("person_id", personId).gte("date", iso).lt("date", nextIso).maybeSingle(),
    sb.from("leave_requests").select("id").eq("person_id", personId).eq("status", "Approved").lte("start_date", nextIso).gte("end_date", iso).limit(1),
    sb.from("public_holidays").select("name").gte("date", iso).lt("date", nextIso).limit(1),
  ]);
  const status = (att?.status as AttendanceStatus | undefined) ?? null;
  const onLeave = (leave?.length ?? 0) > 0;
  const holiday = (hol?.[0]?.name as string | undefined) ?? null;
  const editable = !onLeave && !holiday;
  const lockReason = onLeave ? "You're on approved leave today." : holiday ? `Today is a holiday (${holiday}).` : null;
  return { status, editable, lockReason };
}

/** Today's attendance for a set of people (a manager's team) — derived overlays included. */
export async function teamAttendanceToday(personIds: number[]): Promise<Array<{ id: number; name: string; status: AttendanceStatus | null }>> {
  if (!personIds.length) return [];
  const now = new Date();
  const iso = utcMidnight(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const nextIso = utcMidnight(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const [{ data: people }, { data: att }, { data: leave }, { data: hol }] = await Promise.all([
    sb.from("people").select("id,name").in("id", personIds).eq("active", true).order("name"),
    sb.from("attendance").select("person_id,status").in("person_id", personIds).gte("date", iso).lt("date", nextIso),
    sb.from("leave_requests").select("person_id").in("person_id", personIds).eq("status", "Approved").lte("start_date", nextIso).gte("end_date", iso),
    sb.from("public_holidays").select("name").gte("date", iso).lt("date", nextIso).limit(1),
  ]);
  const recorded = new Map<number, AttendanceStatus>();
  for (const r of att ?? []) recorded.set(r.person_id as number, r.status as AttendanceStatus);
  const onLeave = new Set<number>();
  for (const r of leave ?? []) onLeave.add(r.person_id as number);
  const isHoliday = (hol?.length ?? 0) > 0;
  return (people ?? []).map((p) => {
    let status: AttendanceStatus | null = recorded.get(p.id as number) ?? null;
    if (!status && onLeave.has(p.id as number)) status = "On leave";
    else if (!status && isHoliday) status = "Holiday";
    return { id: p.id as number, name: p.name as string, status };
  });
}

export type PortalAttendanceDay = {
  date: string; // YYYY-MM-DD
  dow: number; // 0 = Sun
  status: AttendanceStatus | null; // recorded, or derived On leave / Holiday
  derived: boolean; // true when On leave / Holiday / Sunday (not self-settable)
  isToday: boolean;
};

/** This week's (Mon–Sat) attendance for one person, for the portal self-check-in. */
export async function personAttendanceWeek(personId: number): Promise<{ days: PortalAttendanceDay[]; todayEditable: boolean; lockReason: string | null }> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayKey = today.toISOString().slice(0, 10);
  // Monday of the current week.
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today); monday.setUTCDate(today.getUTCDate() - mondayOffset);
  const weekDays = Array.from({ length: 6 }, (_, i) => { const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  const rangeStart = weekDays[0] + "T00:00:00Z";
  const rangeEnd = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6)).toISOString();

  const [{ data: att }, { data: leaveRaw }, { data: hols }] = await Promise.all([
    sb.from("attendance").select("date,status").eq("person_id", personId).gte("date", rangeStart).lt("date", rangeEnd),
    sb.from("leave_requests").select("start_date,end_date,status").eq("person_id", personId).eq("status", "Approved").lt("start_date", rangeEnd).gte("end_date", rangeStart),
    sb.from("public_holidays").select("date,name"),
  ]);
  const recorded = new Map<string, AttendanceStatus>();
  for (const r of att ?? []) recorded.set(isoDay(r.date as string), r.status as AttendanceStatus);
  const leaveDays = new Set<string>();
  for (const lr of leaveRaw ?? []) for (const d of eachDay(lr.start_date as string, lr.end_date as string)) leaveDays.add(d);
  const holidayDays = new Map<string, string>();
  for (const h of hols ?? []) holidayDays.set(isoDay(h.date as string), h.name as string);

  const days: PortalAttendanceDay[] = weekDays.map((date) => {
    const dow = new Date(date + "T00:00:00Z").getUTCDay();
    let status: AttendanceStatus | null = recorded.get(date) ?? null;
    let derived = false;
    if (!status && leaveDays.has(date)) { status = "On leave"; derived = true; }
    else if (!status && holidayDays.has(date)) { status = "Holiday"; derived = true; }
    else if (leaveDays.has(date) || holidayDays.has(date)) derived = true;
    return { date, dow, status, derived, isToday: date === todayKey };
  });

  const todayLeave = leaveDays.has(todayKey);
  const todayHoliday = holidayDays.get(todayKey);
  const todayEditable = !todayLeave && !todayHoliday;
  const lockReason = todayLeave ? "You're on approved leave today." : todayHoliday ? `Today is a holiday (${todayHoliday}).` : null;
  return { days, todayEditable, lockReason };
}
