// Supabase DB helpers for the OCR (Office Cleaning Registry). Mirrors the style
// of src/lib/stock.ts. Pure helpers/types live in cleaning-shared.ts.

import { sb } from "@/db/supabase";
import {
  DEFAULT_CLEANING_AREAS,
  type CleaningArea,
  type CleaningCheck,
  type CleaningDay,
} from "./cleaning-shared";

export * from "./cleaning-shared";

const d = (s: string | null): Date | null => (s ? new Date(s) : null);

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

/** "YYYY-MM-DD" → Date at UTC midnight (all-day, matching deadline convention). */
export function dayDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

/* ---------------------------------------------------------------------- */
/* Mappers                                                                */
/* ---------------------------------------------------------------------- */

type AreaDbRow = { id: number; name: string; sort_order: number; active: boolean; created_at: string };
type CheckDbRow = { id: number; day_id: number; area_id: number; done: boolean; done_at: string | null; comment: string | null };
type DayDbRow = {
  id: number; date: string; attendance_person_id: number | null; note: string | null;
  signed_by_person_id: number | null; signed_by_name: string | null; signed_at: string | null;
  created_at: string; updated_at: string;
};

const mapArea = (r: AreaDbRow): CleaningArea => ({
  id: r.id, name: r.name, sortOrder: r.sort_order, active: r.active, createdAt: new Date(r.created_at),
});
const mapCheck = (r: CheckDbRow): CleaningCheck => ({
  id: r.id, dayId: r.day_id, areaId: r.area_id, done: r.done, doneAt: d(r.done_at), comment: r.comment,
});
const mapDay = (r: DayDbRow): CleaningDay => ({
  id: r.id, date: new Date(r.date), attendancePersonId: r.attendance_person_id, note: r.note,
  signedByPersonId: r.signed_by_person_id, signedByName: r.signed_by_name, signedAt: d(r.signed_at),
  createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
});

/* ---------------------------------------------------------------------- */
/* Areas                                                                  */
/* ---------------------------------------------------------------------- */

export async function listAreas(opts?: { includeInactive?: boolean }): Promise<CleaningArea[]> {
  let q = sb.from("cleaning_areas").select("*");
  if (!opts?.includeInactive) q = q.eq("active", true);
  const { data, error } = await q.order("sort_order", { ascending: true }).order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as AreaDbRow[]).map(mapArea);
}

/**
 * Seed the default areas the first time the registry is opened, so areas exist
 * in any environment without a manual step. No-op once any area exists.
 */
export async function ensureDefaultAreas(): Promise<void> {
  const { count, error } = await sb.from("cleaning_areas").select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return;
  const now = new Date().toISOString();
  const rows = DEFAULT_CLEANING_AREAS.map((name, i) => ({ name, sort_order: i, active: true, created_at: now }));
  const { error: insErr } = await sb.from("cleaning_areas").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

export async function createArea(name: string, sortOrder?: number): Promise<number> {
  const { data, error } = await sb
    .from("cleaning_areas")
    .insert({ name, sort_order: sortOrder ?? 0, active: true, created_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

export async function updateArea(id: number, patch: { name?: string; sortOrder?: number; active?: boolean }): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.sortOrder !== undefined) payload.sort_order = patch.sortOrder;
  if (patch.active !== undefined) payload.active = patch.active;
  if (Object.keys(payload).length === 0) return;
  const { error } = await sb.from("cleaning_areas").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---------------------------------------------------------------------- */
/* Days + checks                                                          */
/* ---------------------------------------------------------------------- */

export async function getDay(dateIso: string): Promise<CleaningDay | null> {
  const { data, error } = await sb.from("cleaning_days").select("*").eq("date", dayDate(dateIso).toISOString()).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDay(data as DayDbRow) : null;
}

/** Get the day row for a date, creating it (with blank checks per active area) if absent. */
export async function ensureDay(dateIso: string): Promise<CleaningDay> {
  const existing = await getDay(dateIso);
  if (existing) return existing;

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("cleaning_days")
    .insert({ date: dayDate(dateIso).toISOString(), created_at: now, updated_at: now })
    .select("*")
    .single();
  if (error) {
    // Race: another request created it — fetch and return.
    const again = await getDay(dateIso);
    if (again) return again;
    throw new Error(error.message);
  }
  const day = mapDay(data as DayDbRow);

  const areas = await listAreas();
  if (areas.length) {
    const rows = areas.map((a) => ({ day_id: day.id, area_id: a.id, done: false }));
    await sb.from("cleaning_checks").upsert(rows, { onConflict: "day_id,area_id", ignoreDuplicates: true });
  }
  return day;
}

export async function listChecks(dayId: number): Promise<CleaningCheck[]> {
  const { data, error } = await sb.from("cleaning_checks").select("*").eq("day_id", dayId);
  if (error) throw new Error(error.message);
  return (data as CheckDbRow[]).map(mapCheck);
}

/** Toggle/patch a single area's tick for a day (creates the check if missing). */
export async function setCheck(
  dayId: number,
  areaId: number,
  patch: { done?: boolean; comment?: string | null }
): Promise<void> {
  const row: Record<string, unknown> = { day_id: dayId, area_id: areaId };
  if (patch.done !== undefined) {
    row.done = patch.done;
    row.done_at = patch.done ? new Date().toISOString() : null;
  }
  if (patch.comment !== undefined) row.comment = patch.comment;
  const { error } = await sb.from("cleaning_checks").upsert(row, { onConflict: "day_id,area_id" });
  if (error) throw new Error(error.message);
  await touchDay(dayId);
}

async function touchDay(dayId: number): Promise<void> {
  await sb.from("cleaning_days").update({ updated_at: new Date().toISOString() }).eq("id", dayId);
}

export async function updateDay(
  dayId: number,
  patch: { attendancePersonId?: number | null; note?: string | null }
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.attendancePersonId !== undefined) payload.attendance_person_id = patch.attendancePersonId;
  if (patch.note !== undefined) payload.note = patch.note;
  const { error } = await sb.from("cleaning_days").update(payload).eq("id", dayId);
  if (error) throw new Error(error.message);
}

/** Sign off (lock) a day, or clear the sign-off. */
export async function signDay(dayId: number, signed: boolean, name: string | null, personId: number | null): Promise<void> {
  const { error } = await sb
    .from("cleaning_days")
    .update({
      signed_at: signed ? new Date().toISOString() : null,
      signed_by_name: signed ? name : null,
      signed_by_person_id: signed ? personId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dayId);
  if (error) throw new Error(error.message);
}

export async function listDays(opts?: { limit?: number }): Promise<CleaningDay[]> {
  const { data, error } = await sb
    .from("cleaning_days")
    .select("*")
    .order("date", { ascending: false })
    .limit(opts?.limit ?? 60);
  if (error) throw new Error(error.message);
  return (data as DayDbRow[]).map(mapDay);
}

export { toIso };
