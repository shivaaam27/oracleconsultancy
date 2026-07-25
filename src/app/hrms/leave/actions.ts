"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";

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

/** Write one attendance row from the admin register: insert keeps the original
 *  created_at; an override updates only status/note/updated_at so the original
 *  insert timestamp survives, and the provenance note is stamped 'web-ui' so an
 *  admin correction can't masquerade as a staff self-report ('portal:<Name>'). */
async function writeAttendanceRow(personId: number, iso: string, status: string): Promise<{ error?: string }> {
  const now = new Date().toISOString();
  const { data: existing } = await sb
    .from("attendance")
    .select("id")
    .eq("person_id", personId)
    .eq("date", iso)
    .maybeSingle();
  if (existing) {
    const { error } = await sb
      .from("attendance")
      .update({ status, note: "web-ui", updated_at: now })
      .eq("id", existing.id);
    return error ? { error: error.message } : {};
  }
  const { error } = await sb
    .from("attendance")
    .insert({ person_id: personId, date: iso, status, note: "web-ui", updated_at: now, created_at: now });
  return error ? { error: error.message } : {};
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
    const { error } = await writeAttendanceRow(personId, iso, status);
    if (error) return { ok: false, error };
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
  for (const personId of ids) {
    const { error } = await writeAttendanceRow(personId, iso, status);
    if (error) return { ok: false, error };
  }
  invalidate();
  return { ok: true };
}
