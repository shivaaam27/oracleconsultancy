"use server";

import { revalidatePath } from "next/cache";
import { getPortalPerson } from "@/lib/portal-auth";
import { setCheck, updateDay, signDay } from "@/lib/cleaning";

/**
 * Portal cleaning actions — the receptionist's data-entry writes for the Office
 * Cleaning Registry. UNLIKE the admin `/hrms/cleaning` actions (which have no internal
 * auth and rely on the admin edge gate), every action here re-verifies the caller
 * with getPortalPerson() + the `cleaningLog` capability, because portal routes are
 * NOT admin-gated. It then reuses the same pure DB helpers from lib/cleaning.
 *
 * Two ties to "she is the cleaner": every write stamps `attendance_person_id = me.id`
 * (so the register shows who cleaned), and signing off the day marks her Present for
 * the day (her cleaning submission doubles as her attendance).
 */

type Result = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/portal/cleaning");
  revalidatePath("/hrms/cleaning"); // the Administrator reflects her work immediately
}

async function requireCleaner() {
  const me = await getPortalPerson();
  if (!me || !me.caps.cleaningLog) return null;
  return me;
}

export async function portalCleaningToggle(dayId: number, areaId: number, done: boolean): Promise<Result> {
  const me = await requireCleaner();
  if (!me) return { ok: false, error: "You don’t have access to the cleaning log." };
  try {
    await setCheck(dayId, areaId, { done });
    await updateDay(dayId, { attendancePersonId: me.id });
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the tick." };
  }
}

export async function portalCleaningComment(dayId: number, areaId: number, comment: string): Promise<Result> {
  const me = await requireCleaner();
  if (!me) return { ok: false, error: "You don’t have access to the cleaning log." };
  try {
    await setCheck(dayId, areaId, { comment: comment.trim() || null });
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the comment." };
  }
}

export async function portalCleaningNote(dayId: number, note: string): Promise<Result> {
  const me = await requireCleaner();
  if (!me) return { ok: false, error: "You don’t have access to the cleaning log." };
  try {
    await updateDay(dayId, { note: note.trim() || null });
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the note." };
  }
}

export async function portalCleaningSign(dayId: number): Promise<Result> {
  const me = await requireCleaner();
  if (!me) return { ok: false, error: "You don’t have access to the cleaning log." };
  try {
    await updateDay(dayId, { attendancePersonId: me.id });
    await signDay(dayId, true, me.name, me.id);
    // Her cleaning submission counts as her attendance for the day.
    try {
      const { portalMarkAttendance } = await import("@/app/portal/actions");
      await portalMarkAttendance("Present");
    } catch { /* attendance is best-effort — never block the sign-off */ }
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not submit the day." };
  }
}

export async function portalCleaningUnlock(dayId: number): Promise<Result> {
  const me = await requireCleaner();
  if (!me) return { ok: false, error: "You don’t have access to the cleaning log." };
  try {
    await signDay(dayId, false, null, null);
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reopen the day." };
  }
}
