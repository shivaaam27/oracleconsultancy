"use server";

import { revalidatePath } from "next/cache";
import {
  markCompanyRequirementRequested,
  linkCompanyRequirementDocument,
  unlinkCompanyRequirementDocument,
  verifyCompanyRequirement,
  unverifyCompanyRequirement,
  waiveCompanyRequirement,
  unwaiveCompanyRequirement,
  addCompanyRequirement,
  editCompanyRequirement,
  removeCompanyRequirement,
  setCompanyRequirementReviewDate,
} from "@/lib/company-requirements";

type ReqInput = { label: string; category: string | null; mandatory: boolean };
type Res = { ok: true } | { ok: false; error: string };

async function wrap(fn: () => Promise<void>): Promise<Res> {
  try {
    await fn();
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function creqMarkRequested(id: number) {
  return wrap(() => markCompanyRequirementRequested(id));
}
export async function creqLinkDocument(id: number, documentId: number) {
  return wrap(() => linkCompanyRequirementDocument(id, documentId));
}
export async function creqUnlinkDocument(id: number) {
  return wrap(() => unlinkCompanyRequirementDocument(id));
}
export async function creqVerify(id: number) {
  return wrap(() => verifyCompanyRequirement(id));
}
export async function creqUnverify(id: number) {
  return wrap(() => unverifyCompanyRequirement(id));
}
export async function creqWaive(id: number, reason: string | null) {
  return wrap(() => waiveCompanyRequirement(id, reason));
}
export async function creqUnwaive(id: number) {
  return wrap(() => unwaiveCompanyRequirement(id));
}
export async function creqAdd(companyId: number, input: ReqInput) {
  return wrap(() => addCompanyRequirement(companyId, input));
}
export async function creqEdit(id: number, input: ReqInput) {
  return wrap(() => editCompanyRequirement(id, input));
}
export async function creqRemove(id: number) {
  return wrap(() => removeCompanyRequirement(id));
}
export async function creqSetReviewDate(id: number, reviewDate: string | null) {
  return wrap(() => setCompanyRequirementReviewDate(id, reviewDate));
}
