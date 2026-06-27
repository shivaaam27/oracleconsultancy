"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { getPortalPerson, personCanSeePerson } from "@/lib/portal-auth";

type Result = { ok: true } | { ok: false; error: string };

/** Statuses a manager / HR / director may set on a team member's day. The two
 *  DERIVED states ("On leave"/"Holiday") are filled automatically from approved
 *  leave and the public-holiday calendar, so they must never be set by hand. */
const MANUAL_STATUSES = ["Present", "Absent", "Remote", "Half-day", "Sick"] as const;

/** UTC-midnight ISO for a yyyy-mm-dd day string, or null when malformed. The
 *  attendance table stores one row per person/day at UTC midnight. */
function dayMidnightISO(dateStr: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr ?? "").trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // Reject a date that isn't real (e.g. 2026-02-31 rolls over) by round-tripping.
  if (d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
  return d.toISOString();
}

/** Short provenance tag for the note column — distinguishes a management
 *  correction from a staff self-report ("portal:<Name>") or an admin write
 *  ("web-ui") in the register. */
function roleTag(role: string): string {
  if (role === "director") return "dir";
  if (role === "hr") return "hr";
  return "mgr";
}

/**
 * A manager / HR / director corrects ONE team member's attendance for ONE day.
 * status null clears the row (reverts to the derived state). Permission is
 * re-checked server-side: management role required, and the target must be in
 * the caller's scope (manager → own team; director/HR → any active person) — a
 * staff member can never reach this, and a manager can never touch someone
 * outside their team, regardless of what the client sends.
 */
export async function portalCorrectAttendance(
  personId: number,
  dateStr: string,
  status: string | null,
): Promise<Result> {
  const me = await getPortalPerson();
  if (!me) return { ok: false, error: "Please sign in again." };
  // Management only — staff have no business editing anyone's attendance.
  if (me.portalRole === "staff") return { ok: false, error: "You don't have permission." };

  // Scope gate: the caller must be allowed to see this person at all.
  if (!Number.isFinite(personId) || !(await personCanSeePerson(me, personId))) {
    return { ok: false, error: "That person isn't on your team." };
  }

  // Validate the status: one of the five manual statuses, or null to clear.
  // The derived states are rejected outright (they aren't manually settable).
  if (status !== null && !(MANUAL_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "That status can't be set by hand." };
  }

  const iso = dayMidnightISO(dateStr);
  if (!iso) return { ok: false, error: "That isn't a valid date." };
  // Never record attendance for a day that hasn't happened yet, judged in the
  // operator's zone (Dar es Salaam, UTC+3) so a correction for the current local
  // day is never wrongly rejected in the hours after UTC midnight.
  const localToday = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  const todayIso = `${localToday}T00:00:00.000Z`;
  if (iso > todayIso) return { ok: false, error: "You can't set attendance for a future day." };

  const now = new Date().toISOString();
  const note = `portal-${roleTag(me.portalRole)}:${me.name}`;

  if (status === null) {
    // Clear the recorded row — the day reverts to its derived state (or blank).
    const { error } = await sb.from("attendance").delete().eq("person_id", personId).eq("date", iso);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/portal/team");
    return { ok: true };
  }

  // Mirror the admin register's write shape: an existing row keeps its original
  // created_at (only status/note/updated_at change); a fresh row is inserted.
  const { data: existing } = await sb
    .from("attendance")
    .select("id")
    .eq("person_id", personId)
    .eq("date", iso)
    .maybeSingle();
  if (existing) {
    const { error } = await sb
      .from("attendance")
      .update({ status, note, updated_at: now })
      .eq("id", existing.id as number);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await sb
      .from("attendance")
      .insert({ person_id: personId, date: iso, status, note, updated_at: now, created_at: now });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/portal/team");
  return { ok: true };
}
