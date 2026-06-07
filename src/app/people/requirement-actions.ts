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
} from "@/lib/requirements";

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
