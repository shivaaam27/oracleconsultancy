"use server";

import { revalidatePath } from "next/cache";
import { createCommitment, updateCommitment, archiveCommitment, type CommitmentInput } from "@/lib/commitments";

export async function createCommitmentAction(input: CommitmentInput): Promise<{ ok: boolean; error?: string }> {
  if (!input.title?.trim()) return { ok: false, error: "Add a title." };
  const id = await createCommitment(input);
  if (!id) return { ok: false, error: "Couldn't save. Try again." };
  revalidatePath("/hrms/registers");
  return { ok: true };
}

export async function updateCommitmentAction(id: number, patch: Partial<CommitmentInput>): Promise<{ ok: boolean }> {
  await updateCommitment(id, patch);
  revalidatePath("/hrms/registers");
  return { ok: true };
}

export async function archiveCommitmentAction(id: number): Promise<{ ok: boolean }> {
  await archiveCommitment(id, true);
  revalidatePath("/hrms/registers");
  return { ok: true };
}
