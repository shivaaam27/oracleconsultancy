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

async function holidaySet(): Promise<Set<string>> {
  const { data } = await sb.from("public_holidays").select("date");
  return new Set((data ?? []).map((h) => new Date(h.date as string).toISOString().slice(0, 10)));
}

/** Compute leave days for a date range (half-day forces 0.5 on a single day). */
export async function computeLeaveDays(startISO: string, endISO: string, halfDay: boolean): Promise<number> {
  const holidays = await holidaySet();
  if (halfDay) return 0.5;
  return workingDaysBetween(new Date(startISO), new Date(endISO), holidays);
}

/* ------------------------------------------------------------------ */
/* Leave types                                                         */
/* ------------------------------------------------------------------ */
export async function listLeaveTypes(includeInactive = false): Promise<LeaveType[]> {
  let q = sb.from("leave_types").select("id,name,color,paid,default_days,active").order("sort_order", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []).map((t) => ({
    id: t.id as number,
    name: t.name as string,
    color: (t.color as string | null) ?? null,
    paid: (t.paid as boolean | null) ?? true,
    defaultDays: (t.default_days as number | null) ?? 0,
    active: (t.active as boolean | null) ?? true,
  }));
}

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

export async function leaveMetrics(): Promise<LeaveMetrics> {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(); monthStart.setUTCDate(1);
  const { data } = await sb.from("leave_requests").select("status,start_date,end_date,decided_at");
  const rows = data ?? [];
  return {
    pending: rows.filter((r) => r.status === "Pending").length,
    onLeaveToday: rows.filter((r) => r.status === "Approved" && (r.start_date as string).slice(0, 10) <= today && (r.end_date as string).slice(0, 10) >= today).length,
    approvedThisMonth: rows.filter((r) => r.status === "Approved" && r.decided_at && new Date(r.decided_at as string) >= monthStart).length,
  };
}

/* ------------------------------------------------------------------ */
/* Balances — entitlement (per type) − approved days this year.        */
/* ------------------------------------------------------------------ */
export async function personLeaveBalances(personId: number): Promise<PersonLeaveBalance[]> {
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)).toISOString();
  const [types, { data: reqs }] = await Promise.all([
    listLeaveTypes(),
    sb.from("leave_requests").select("leave_type_id,days,status").eq("person_id", personId).gte("start_date", yearStart),
  ]);
  return types.map((t) => {
    const mine = (reqs ?? []).filter((r) => r.leave_type_id === t.id);
    const taken = mine.filter((r) => r.status === "Approved").reduce((s, r) => s + ((r.days as number) ?? 0), 0);
    const pending = mine.filter((r) => r.status === "Pending").reduce((s, r) => s + ((r.days as number) ?? 0), 0);
    return {
      typeId: t.id,
      typeName: t.name,
      color: t.color,
      entitlement: t.defaultDays,
      taken,
      pending,
      remaining: t.defaultDays > 0 ? t.defaultDays - taken : null,
    };
  });
}
