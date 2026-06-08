"use server";

import { revalidatePath } from "next/cache";
import {
  markRequirementRequested,
  linkRequirementDocument,
  unlinkRequirementDocument,
  verifyRequirement,
  unverifyRequirement,
  waiveRequirement,
  unwaiveRequirement,
  addPersonRequirement,
  editPersonRequirement,
  removePersonRequirement,
} from "@/lib/requirements";

type ReqInput = { label: string; category: string | null; mandatory: boolean };

type Res = { ok: true } | { ok: false; error: string };

async function wrap(fn: () => Promise<void>): Promise<Res> {
  try {
    await fn();
    revalidatePath("/people");
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function reqMarkRequested(id: number) {
  return wrap(() => markRequirementRequested(id));
}
export async function reqLinkDocument(id: number, documentId: number) {
  return wrap(() => linkRequirementDocument(id, documentId));
}
export async function reqUnlinkDocument(id: number) {
  return wrap(() => unlinkRequirementDocument(id));
}
export async function reqVerify(id: number) {
  return wrap(() => verifyRequirement(id));
}
export async function reqUnverify(id: number) {
  return wrap(() => unverifyRequirement(id));
}
export async function reqWaive(id: number, reason: string | null) {
  return wrap(() => waiveRequirement(id, reason));
}
export async function reqUnwaive(id: number) {
  return wrap(() => unwaiveRequirement(id));
}
export async function reqAdd(personId: number, input: ReqInput) {
  return wrap(() => addPersonRequirement(personId, input));
}
export async function reqEdit(id: number, input: ReqInput) {
  return wrap(() => editPersonRequirement(id, input));
}
export async function reqRemove(id: number) {
  return wrap(() => removePersonRequirement(id));
}
