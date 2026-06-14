"use server";

import { revalidatePath } from "next/cache";
import { createPipelineItem, setPipelineStage, archivePipelineItem, updatePipelineItem, type PipelineInput } from "@/lib/pipeline";
import { type PipelineStage } from "@/lib/pipeline-shared";

export async function createPipelineItemAction(input: PipelineInput): Promise<{ ok: boolean; error?: string }> {
  if (!input.subject?.trim()) return { ok: false, error: "Add a subject." };
  if (!input.type?.trim()) return { ok: false, error: "Add a type (e.g. Work Permit)." };
  const id = await createPipelineItem(input);
  if (!id) return { ok: false, error: "Couldn't save. Try again." };
  revalidatePath("/hrms/pipeline");
  return { ok: true };
}

export async function movePipelineStageAction(id: number, stage: PipelineStage): Promise<{ ok: boolean }> {
  await setPipelineStage(id, stage);
  revalidatePath("/hrms/pipeline");
  return { ok: true };
}

export async function updatePipelineItemAction(id: number, patch: Partial<PipelineInput>): Promise<{ ok: boolean }> {
  await updatePipelineItem(id, patch);
  revalidatePath("/hrms/pipeline");
  return { ok: true };
}

export async function archivePipelineItemAction(id: number): Promise<{ ok: boolean }> {
  await archivePipelineItem(id, true);
  revalidatePath("/hrms/pipeline");
  return { ok: true };
}
