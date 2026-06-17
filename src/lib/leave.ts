import { cache } from "react";
import { sb } from "@/db/supabase";
import type {
  LeaveType,
  LeaveRequestRow,
  Holiday,
  LeaveStatus,
  PersonLeaveBalance,
} from "@/lib/leave-shared";

/* ------------------------------------------------------------------ */
/* Working-day maths — Mon–Sat count, Sundays + public holidays free.  */
/* ------------------------------------------------------------------ */
export function workingDaysBetween(start: Date, end: Date, holidays: Set<string>): number {
  if (end < start) return 0;
  let n = 0;
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (d <= last) {
    const dow = d.getUTCDay(); // 0 = Sunday
    const key = d.toISOString().slice(0, 10);
    if (dow !== 0 && !holidays.has(key)) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/** Each YYYY-MM-DD in an inclusive [start,end] range (whole days, UTC). */
function eachDay(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const d = new Date(new Date(startISO).toISOString().slice(0, 10) + "T00:00:00Z");
  const last = new Date(new Date(endISO).toISOString().slice(0, 10) + "T00:00:00Z");
  while (d <= last) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

const holidaySet = cache(async (): Promise<Set<string>> => {
  const { data } = await sb.from("public_holidays").select("date");
  return new Set((data ?? []).map((h) => new Date(h.date as string).toISOString().slice(0, 10)));
});

/** Compute leave days for a date range (half-day forces 0.5 on a single day). */
export async function computeLeaveDays(startISO: string, endISO: string, halfDay: boolean): Promise<number> {
  const holidays = await holidaySet();
  if (halfDay) return 0.5;
  return workingDaysBetween(new Date(startISO), new Date(endISO), holidays);
}

/* ------------------------------------------------------------------ */
/* Leave types                                                         */
/* ------------------------------------------------------------------ */
export const listLeaveTypes = cache(async (includeInactive = false): Promise<LeaveType[]> => {
  let q = sb.from("leave_types").select("id,name,color,paid,default_days,cycle_months,half_pay_days,active").order("sort_order", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []).map((t) => ({
    id: t.id as number,
    name: t.name as string,
    color: (t.color as string | null) ?? null,
    paid: (t.paid as boolean | null) ?? true,
    defaultDays: (t.default_days as number | null) ?? 0,
    cycleMonths: (t.cycle_months as number | null) ?? 12,
    halfPayDays: (t.half_pay_days as number | null) ?? 0,
    active: (t.active as boolean | null) ?? true,
  }));
});

/* ------------------------------------------------------------------ */
/* Holidays                                                            */
/* ------------------------------------------------------------------ */
export async function listHolidays(): Promise<Holiday[]> {
  const [{ data }, { data: companies }] = await Promise.all([
    sb.from("public_holidays").select("id,date,name,company_id").order("date", { ascending: true }),
    sb.from("companies").select("id,name"),
  ]);
  const cMap = new Map((companies ?? []).map((c) => [c.id as number, c.name as string]));
  return (data ?? []).map((h) => ({
    id: h.id as number,
    date: h.date as string,
    name: h.name as string,
    companyId: (h.company_id as number | null) ?? null,
    companyName: h.company_id ? cMap.get(h.company_id as number) ?? null : null,
  }));
}

/* ------------------------------------------------------------------ */
/* Leave requests                                                      */
/* ------------------------------------------------------------------ */
type ReqRow = {
  id: number; person_id: number; leave_type_id: number;
  start_date: string; end_date: string; half_day: boolean; days: number;
  reason: string | null; status: string; decided_by: string | null; decided_at: string | null;
  people?: { name: string } | { name: string }[] | null;
  leave_types?: { name: string; color: string | null } | { name: string; color: string | null }[] | null;
};
function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? v[0] ?? null : v ?? null; }

const REQ_SELECT =
  "id,person_id,leave_type_id,start_date,end_date,half_day,days,reason,status,decided_by,decided_at, people(name), leave_types(name,color)";

function mapReq(r: ReqRow): LeaveRequestRow {
  const t = one(r.leave_types);
  return {
    id: r.id,
    personId: r.person_id,
    personName: one(r.people)?.name ?? null,
    leaveTypeId: r.leave_type_id,
    leaveTypeName: t?.name ?? null,
    leaveTypeColor: t?.color ?? null,
    startDate: r.start_date,
    endDate: r.end_date,
    halfDay: r.half_day,
    days: r.days,
    reason: r.reason,
    status: (r.status as LeaveStatus) ?? "Pending",
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
  };
}

export async function listLeaveRequests(opts?: { personId?: number; status?: LeaveStatus }): Promise<LeaveRequestRow[]> {
  let q = sb.from("leave_requests").select(REQ_SELECT).order("start_date", { ascending: false });
  if (opts?.personId) q = q.eq("person_id", opts.personId);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data } = await q;
  return ((data ?? []) as ReqRow[]).map(mapReq);
}

export type LeaveMetrics = { pending: number; onLeaveToday: number; approvedThisMonth: number };

/** Resolve the active person ids for a company (used to scope portfolio figures). */
async function activePersonIdsForCompany(companyId: number): Promise<number[]> {
  const { data } = await sb.from("people").select("id").eq("active", true).eq("company_id", companyId);
  return (data ?? []).map((p) => p.id as number);
}

/** Portfolio leave metrics, or scoped to one company when `companyId` is given. */
export async function leaveMetrics(companyId?: number | null): Promise<LeaveMetrics> {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(); monthStart.setUTCDate(1);
  let ids: number[] | null = null;
  if (companyId) {
    ids = await activePersonIdsForCompany(companyId);
    if (ids.length === 0) return { pending: 0, onLeaveToday: 0, approvedThisMonth: 0 };
  }
  let q = sb.from("leave_requests").select("person_id,status,start_date,end_date,decided_at");
  if (ids) q = q.in("person_id", ids);
  const { data } = await q;
  const rows = data ?? [];
  return {
    pending: rows.filter((r) => r.status === "Pending").length,
    onLeaveToday: rows.filter((r) => r.status === "Approved" && (r.start_date as string).slice(0, 10) <= today && (r.end_date as string).slice(0, 10) >= today).length,
    approvedThisMonth: rows.filter((r) => r.status === "Approved" && r.decided_at && new Date(r.decided_at as string) >= monthStart).length,
  };
}

/** Fixed leave-year boundary, anchored to 1 January — so an allowance resets once
 *  a year, not on a sliding window that quietly drips days back every single day
 *  (two staff with identical leave used to show different balances depending only
 *  on what day you looked). A 12-month cycle = the current calendar year; a
 *  36-month cycle = the last 3 calendar years; and so on. */
export function leaveCycleStart(cycleMonths: number, now: Date = new Date()): Date {
  const years = Math.max(1, Math.round((cycleMonths || 12) / 12));
  return new Date(Date.UTC(now.getUTCFullYear() - (years - 1), 0, 1));
}

/* ------------------------------------------------------------------ */
/* Balances — entitlement (per type) − approved days this leave year.  */
/* ------------------------------------------------------------------ */
export async function personLeaveBalances(personId: number): Promise<PersonLeaveBalance[]> {
  const [types, { data: reqs }] = await Promise.all([
    listLeaveTypes(),
    sb.from("leave_requests").select("leave_type_id,days,status,start_date").eq("person_id", personId),
  ]);
  const now = new Date();
  return types.map((t) => {
    // Count only requests within this type's fixed leave-year cycle.
    const cycleStart = leaveCycleStart(t.cycleMonths, now);
    const mine = (reqs ?? []).filter((r) => r.leave_type_id === t.id && new Date(r.start_date as string) >= cycleStart);
    const taken = mine.filter((r) => r.status === "Approved").reduce((s, r) => s + ((r.days as number) ?? 0), 0);
    const pending = mine.filter((r) => r.status === "Pending").reduce((s, r) => s + ((r.days as number) ?? 0), 0);
    return {
      typeId: t.id,
      typeName: t.name,
      color: t.color,
      entitlement: t.defaultDays,
      taken,
      pending,
      // Displayed remaining nets off PENDING requests too, so the staff member
      // sees what they can actually still book (the booking guard already blocks
      // approved + pending past entitlement). NOTE: this is deliberately stricter
      // than the accrual/liability calculation, which counts APPROVED days only —
      // do not "align" them: a pending request shouldn't yet cost the company.
      remaining: t.defaultDays > 0 ? t.defaultDays - taken - pending : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Attendance — this-month summary for one person (register-dependent).*/
/* Returns zeros (recorded 0) when the daily register hasn't been used.*/
/* ------------------------------------------------------------------ */
export type PersonAttendanceSummary = { recorded: number; present: number; absent: number; onLeave: number; other: number };

export async function personAttendanceThisMonth(personId: number): Promise<PersonAttendanceSummary> {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m0 = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(y, m0, 1)).toISOString();
  const monthEnd = new Date(Date.UTC(y, m0 + 1, 1)).toISOString();
  const monthDays = new Set<string>();
  for (let d = new Date(Date.UTC(y, m0, 1)); d.getUTCMonth() === m0; d.setUTCDate(d.getUTCDate() + 1)) {
    monthDays.add(d.toISOString().slice(0, 10));
  }

  // Same overlay the register + portal week strip derive: recorded status wins,
  // then approved leave, then a public holiday. Without this the drawer card
  // disagreed with the register (it counted only the attendance table).
  const [{ data: att }, { data: leaveRaw }, { data: hols }] = await Promise.all([
    sb.from("attendance").select("date,status").eq("person_id", personId).gte("date", monthStart).lt("date", monthEnd),
    sb.from("leave_requests").select("start_date,end_date,status").eq("person_id", personId).eq("status", "Approved").lt("start_date", monthEnd).gte("end_date", monthStart),
    sb.from("public_holidays").select("date"),
  ]);

  const recorded = new Map<string, string>();
  for (const r of att ?? []) recorded.set(new Date(r.date as string).toISOString().slice(0, 10), (r.status as string) ?? "");
  const leaveDays = new Set<string>();
  for (const lr of leaveRaw ?? []) for (const day of eachDay(lr.start_date as string, lr.end_date as string)) { if (monthDays.has(day)) leaveDays.add(day); }
  const holidayDays = new Set<string>();
  for (const h of hols ?? []) { const d = new Date(h.date as string).toISOString().slice(0, 10); if (monthDays.has(d)) holidayDays.add(d); }

  const sum: PersonAttendanceSummary = { recorded: recorded.size, present: 0, absent: 0, onLeave: 0, other: 0 };
  for (const day of monthDays) {
    const rec = recorded.get(day);
    if (rec) {
      if (rec === "Present" || rec === "Remote") sum.present++;
      else if (rec === "Absent") sum.absent++;
      else if (rec === "On leave" || rec === "Sick" || rec === "Half-day") sum.onLeave++;
      else sum.other++;
    } else if (leaveDays.has(day)) {
      sum.onLeave++; // derived approved-leave day
    } else if (holidayDays.has(day)) {
      sum.other++; // derived public holiday
    }
  }
  return sum;
}
