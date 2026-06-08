"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { startJourney, clearJourney, type JourneyKind } from "@/lib/onboarding";

type Result = { ok: true; created?: number } | { ok: false; error: string };

function invalidate() {
  revalidatePath("/people");
  revalidatePath("/workbook");
}

export async function startJourneyAction(personId: number, kind: JourneyKind): Promise<Result> {
  try {
    const res = await startJourney(personId, kind);
    invalidate();
    return { ok: true, created: res.created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start the checklist." };
  }
}

export async function clearJourneyAction(personId: number, kind: JourneyKind): Promise<Result> {
  try {
    await clearJourney(personId, kind);
    invalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not clear the checklist." };
  }
}

/** Tick / untick a single journey step (a tagged to-do). */
export async function toggleJourneyStepAction(id: number, done: boolean): Promise<Result> {
  const { error } = await sb
    .from("todos")
    .update({ done, completed_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true };
}
