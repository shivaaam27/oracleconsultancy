"use server";

import { revalidatePath } from "next/cache";
import { createCommitment, updateCommitment, archiveCommitment, linkCommitmentDocument, type CommitmentInput } from "@/lib/commitments";

export async function createCommitmentAction(input: CommitmentInput): Promise<{ ok: boolean; error?: string }> {
  if (!input.title?.trim()) return { ok: false, error: "Add a title." };
  const res = await createCommitment(input);
  if (!res.ok) return { ok: false, error: "Couldn't save the commitment. Please try again." };
  revalidatePath("/hrms/commitments");
  return { ok: true };
}

export async function updateCommitmentAction(id: number, patch: Partial<CommitmentInput>): Promise<{ ok: boolean; error?: string }> {
  const res = await updateCommitment(id, patch);
  if (!res.ok) return { ok: false, error: "Couldn't save your changes. Please try again." };
  revalidatePath("/hrms/commitments");
  return { ok: true };
}

export async function archiveCommitmentAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const res = await archiveCommitment(id, true);
  if (!res.ok) return { ok: false, error: "Couldn't archive the commitment. Please try again." };
  revalidatePath("/hrms/commitments");
  return { ok: true };
}

export async function linkCommitmentDocumentAction(id: number, documentId: number | null): Promise<{ ok: boolean; error?: string }> {
  const res = await linkCommitmentDocument(id, documentId);
  if (!res.ok) return { ok: false, error: "Couldn't link the document. Please try again." };
  revalidatePath("/hrms/commitments");
  return { ok: true };
}
