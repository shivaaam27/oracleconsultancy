"use server";

import { revalidatePath } from "next/cache";
import { createPipelineItem, setPipelineStage, archivePipelineItem, updatePipelineItem, linkPipelineDocument, type PipelineInput } from "@/lib/pipeline";
import { type PipelineStage } from "@/lib/pipeline-shared";

export async function createPipelineItemAction(input: PipelineInput): Promise<{ ok: boolean; error?: string }> {
  if (!input.subject?.trim()) return { ok: false, error: "Add a subject." };
  if (!input.type?.trim()) return { ok: false, error: "Add a type (e.g. Work Permit)." };
  const res = await createPipelineItem(input);
  if (!res.ok) return { ok: false, error: "Couldn't save the case. Please try again." };
  revalidatePath("/hrms/pipeline");
  return { ok: true };
}

export async function movePipelineStageAction(id: number, stage: PipelineStage): Promise<{ ok: boolean; error?: string }> {
  const res = await setPipelineStage(id, stage);
  if (!res.ok) return { ok: false, error: "Couldn't move the case. Please try again." };
  revalidatePath("/hrms/pipeline");
  return { ok: true };
}

export async function updatePipelineItemAction(id: number, patch: Partial<PipelineInput>): Promise<{ ok: boolean; error?: string }> {
  const res = await updatePipelineItem(id, patch);
  if (!res.ok) return { ok: false, error: "Couldn't save your changes. Please try again." };
  revalidatePath("/hrms/pipeline");
  return { ok: true };
}

export async function archivePipelineItemAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const res = await archivePipelineItem(id, true);
  if (!res.ok) return { ok: false, error: "Couldn't archive the case. Please try again." };
  revalidatePath("/hrms/pipeline");
  return { ok: true };
}

export async function linkPipelineDocumentAction(id: number, documentId: number | null): Promise<{ ok: boolean; error?: string }> {
  const res = await linkPipelineDocument(id, documentId);
  if (!res.ok) return { ok: false, error: "Couldn't link the document. Please try again." };
  revalidatePath("/hrms/pipeline");
  return { ok: true };
}
