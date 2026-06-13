"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { computeLeaveDays } from "@/lib/leave";
import type { LeaveStatus } from "@/lib/leave-shared";

type Result = { ok: true; id?: number } | { ok: false; error: string };

function str(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v || null;
}
function numOrNull(fd: FormData, key: string): number | null {
  const v = (fd.get(key) ?? "").toString().trim();
  if (!v) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function dateIso(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function invalidate() {
  revalidatePath("/hrms");
  revalidatePath("/hrms/leave");
  revalidatePath("/people");
}

/* ---- Leave requests ---- */
export async function createLeaveRequestAction(fd: FormData): Promise<Result> {
  const personId = numOrNull(fd, "personId");
  const leaveTypeId = numOrNull(fd, "leaveTypeId");
  const start = dateIso(fd, "startDate");
  const end = dateIso(fd, "endDate");
  const halfDay = fd.get("halfDay") === "1" || fd.get("halfDay") === "on";
  if (!personId) return { ok: false, error: "Choose a person." };
  if (!leaveTypeId) return { ok: false, error: "Choose a leave type." };
  if (!start || !end) return { ok: false, error: "Pick start and end dates." };
  if (end < start) return { ok: false, error: "End date can't be before the start date." };

  const days = await computeLeaveDays(start, halfDay ? start : end, halfDay);
  if (days <= 0) return { ok: false, error: "That range has no working days (Sundays/holidays only)." };

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("leave_requests")
    .insert({
      person_id: personId,
      leave_type_id: leaveTypeId,
      start_date: start,
      end_date: halfDay ? start : end,
      half_day: halfDay,
      days,
      reason: str(fd, "reason"),
      status: "Pending",
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true, id: data.id as number };
}

export async function decideLeaveRequestAction(id: number, status: LeaveStatus, notes?: string | null): Promise<Result> {
  const { error } = await sb
    .from("leave_requests")
    .update({ status, decided_by: "web-ui", decided_at: new Date().toISOString(), notes: notes ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true, id };
}

export async function deleteLeaveRequestAction(id: number): Promise<Result> {
  // Never silently destroy an APPROVED leave record — that quietly changes the
  // person's remaining balance and the calendar/attendance auto-fill. Cancel it
  // instead (keeps the record for audit, drops it from balances because only
  // "Approved" days are counted). Drafts/declined requests can be removed outright.
  const { data: existing } = await sb.from("leave_requests").select("status").eq("id", id).maybeSingle();
  if (existing && existing.status === "Approved") {
    const { error } = await sb
      .from("leave_requests")
      .update({ status: "Cancelled", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    invalidate();
    return { ok: true, id };
  }
  const { error } = await sb.from("leave_requests").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true, id };
}

/* ---- Leave types ---- */
export async function saveLeaveTypeAction(fd: FormData, id?: number): Promise<Result> {
  const name = str(fd, "name");
  if (!name) return { ok: false, error: "Name is required." };
  const payload = {
    name,
    color: str(fd, "color"),
    paid: fd.get("paid") === "1" || fd.get("paid") === "on",
    default_days: numOrNull(fd, "defaultDays") ?? 0,
    cycle_months: numOrNull(fd, "cycleMonths") ?? 12,
    half_pay_days: numOrNull(fd, "halfPayDays") ?? 0,
  };
  if (id) {
    const { error } = await sb.from("leave_types").update(payload).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await sb.from("leave_types").insert({ ...payload, active: true, sort_order: 99, created_at: new Date().toISOString() });
    if (error) return { ok: false, error: error.message };
  }
  invalidate();
  return { ok: true };
}

export async function archiveLeaveTypeAction(id: number): Promise<Result> {
  const { error } = await sb.from("leave_types").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true };
}

/* ---- Holidays ---- */
export async function addHolidayAction(fd: FormData): Promise<Result> {
  const date = dateIso(fd, "date");
  const name = str(fd, "name");
  if (!date) return { ok: false, error: "Pick a date." };
  if (!name) return { ok: false, error: "Name the holiday." };
  const { error } = await sb.from("public_holidays").insert({
    date, name, company_id: numOrNull(fd, "companyId"), created_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true };
}

export async function deleteHolidayAction(id: number): Promise<Result> {
  const { error } = await sb.from("public_holidays").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true };
}

/* ---- Attendance register ---- */
function dayMidnightISO(dateStr: string): string | null {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Record (or clear, when status is null) one person's status for one day. */
export async function recordAttendanceAction(personId: number, dateStr: string, status: string | null): Promise<Result> {
  if (!personId) return { ok: false, error: "No person." };
  const iso = dayMidnightISO(dateStr);
  if (!iso) return { ok: false, error: "Bad date." };
  if (!status) {
    const { error } = await sb.from("attendance").delete().eq("person_id", personId).eq("date", iso);
    if (error) return { ok: false, error: error.message };
  } else {
    const now = new Date().toISOString();
    const { error } = await sb.from("attendance").upsert(
      { person_id: personId, date: iso, status, updated_at: now, created_at: now },
      { onConflict: "person_id,date" }
    );
    if (error) return { ok: false, error: error.message };
  }
  invalidate();
  return { ok: true };
}

/** Set the same status for several people on one day (e.g. "mark team Present today"). */
export async function bulkRecordAttendanceAction(personIds: number[], dateStr: string, status: string): Promise<Result> {
  const ids = [...new Set(personIds)].filter((n) => Number.isFinite(n));
  if (!ids.length) return { ok: false, error: "No people." };
  const iso = dayMidnightISO(dateStr);
  if (!iso) return { ok: false, error: "Bad date." };
  const now = new Date().toISOString();
  const rows = ids.map((person_id) => ({ person_id, date: iso, status, updated_at: now, created_at: now }));
  const { error } = await sb.from("attendance").upsert(rows, { onConflict: "person_id,date" });
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true };
}
