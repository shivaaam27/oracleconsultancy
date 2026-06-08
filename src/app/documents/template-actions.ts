"use server";

import { revalidatePath } from "next/cache";
import {
  addRequirementItem,
  editRequirementItem,
  deleteRequirementItem,
} from "@/lib/requirements";

type Res = { ok: true } | { ok: false; error: string };
type ItemInput = { label: string; category: string | null; mandatory: boolean };

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
