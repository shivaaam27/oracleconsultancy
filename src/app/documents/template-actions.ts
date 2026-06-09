"use server";

import { revalidatePath } from "next/cache";
import {
  addRequirementItem,
  editRequirementItem,
  deleteRequirementItem,
  syncAllPersonRequirements,
} from "@/lib/requirements";
import {
  addJourneyTemplateStep,
  editJourneyTemplateStep,
  deleteJourneyTemplateStep,
  syncAllJourneys,
  type JourneyKind,
} from "@/lib/onboarding";
import type { PersonType } from "@/lib/person-types";

type Res = { ok: true } | { ok: false; error: string };
type ItemInput = { label: string; category: string | null; mandatory: boolean };
type StepInput = { label: string; offsetDays: number };

async function wrap(fn: () => Promise<void>): Promise<Res> {
  try {
    await fn();
    // Adds propagate to people on their next checklist sync.
    revalidatePath("/documents");
    revalidatePath("/people");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function tmplAddItem(profileId: number, input: ItemInput) {
  return wrap(() => addRequirementItem(profileId, input));
}
export async function tmplEditItem(id: number, input: ItemInput) {
  return wrap(() => editRequirementItem(id, input));
}
export async function tmplDeleteItem(id: number) {
  return wrap(() => deleteRequirementItem(id));
}

export async function journeyTmplAddStep(kind: JourneyKind, type: PersonType, input: StepInput) {
  return wrap(() => addJourneyTemplateStep(kind, type, input));
}
export async function journeyTmplEditStep(id: number, input: StepInput) {
  return wrap(() => editJourneyTemplateStep(id, input));
}
export async function journeyTmplDeleteStep(id: number) {
  return wrap(() => deleteJourneyTemplateStep(id));
}

/** Apply requirement-template edits to every person's checklist + compliance. */
export async function tmplSyncEveryone(): Promise<{ ok: true; people: number } | { ok: false; error: string }> {
  try {
    const res = await syncAllPersonRequirements();
    revalidatePath("/documents");
    revalidatePath("/people");
    return { ok: true, people: res.people };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Apply onboarding/offboarding template edits to everyone with a journey. */
export async function journeyTmplSyncEveryone(): Promise<{ ok: true; journeys: number; added: number } | { ok: false; error: string }> {
  try {
    const res = await syncAllJourneys();
    revalidatePath("/documents");
    revalidatePath("/people");
    return { ok: true, journeys: res.journeys, added: res.added };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
