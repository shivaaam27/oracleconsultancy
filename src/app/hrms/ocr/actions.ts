"use server";

import { revalidatePath } from "next/cache";
import { setCheck, updateDay, signDay } from "@/lib/cleaning";

type Result = { ok: true } | { ok: false; error: string };

function revalidateOcr() {
  revalidatePath("/hrms/ocr");
  revalidatePath("/hrms");
}

export async function toggleCheckAction(dayId: number, areaId: number, done: boolean): Promise<Result> {
  try {
    await setCheck(dayId, areaId, { done });
    revalidateOcr();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the tick." };
  }
}

export async function setCheckCommentAction(dayId: number, areaId: number, comment: string): Promise<Result> {
  try {
    await setCheck(dayId, areaId, { comment: comment.trim() || null });
    revalidateOcr();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the comment." };
  }
}

export async function setAttendanceAction(dayId: number, personId: number | null): Promise<Result> {
  try {
    await updateDay(dayId, { attendancePersonId: personId });
    revalidateOcr();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not set attendance." };
  }
}

export async function setNoteAction(dayId: number, note: string): Promise<Result> {
  try {
    await updateDay(dayId, { note: note.trim() || null });
    revalidateOcr();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the note." };
  }
}

export async function signDayAction(
  dayId: number,
  signed: boolean,
  name: string | null,
  personId: number | null
): Promise<Result> {
  try {
    if (signed && !(name && name.trim())) return { ok: false, error: "Choose who is signing off." };
    await signDay(dayId, signed, name?.trim() ?? null, personId);
    revalidateOcr();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not sign off the day." };
  }
}
