"use server";

import { revalidatePath } from "next/cache";
import { createPipelineItem, setPipelineStage, archivePipelineItem, updatePipelineItem, linkPipelineDocument, linkPipelineTask, type PipelineInput } from "@/lib/pipeline";
import { type PipelineStage } from "@/lib/pipeline-shared";
import { sb } from "@/db/supabase";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";

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

/** Create a "driving task" for this case and link it — completing that task then
 *  auto-advances the case a stage (the automation cascade). One task per case. */
export async function createPipelineTaskAction(id: number): Promise<{ ok: boolean; code?: string; error?: string }> {
  const { data: p } = await sb.from("pipeline").select("subject,type,company_id,deadline,next_action").eq("id", id).maybeSingle();
  if (!p) return { ok: false, error: "Case not found." };
  const companyId = p.company_id as number | null;
  if (!companyId) return { ok: false, error: "Add a company to this case first." };
  const { data: comp } = await sb.from("companies").select("code,code_prefix").eq("id", companyId).maybeSingle();
  const prefix = (comp?.code_prefix as string | null) || (comp?.code as string | null) || "";
  const next = (p.next_action as string | null)?.trim();
  const title = `${p.type}${p.subject ? ` — ${p.subject}` : ""}${next ? ` (${next})` : ""}`.slice(0, 200);
  const now = new Date();
  try {
    const task = await insertTaskWithUniqueCodeSb(companyId, prefix, {
      actionItem: title, status: "Not Started", priority: "High", category: "Admin",
      deadline: p.deadline ? new Date(p.deadline as string) : null, createdDate: now, lastUpdatedAt: now, archived: false,
    });
    await sb.from("audit_log").insert({
      task_id: task.id, task_code: task.code, company_id: companyId, entry_type: "CREATE", field: "Task",
      old_value: null, new_value: title, change_reason: "Driving task for a pipeline case", created_at: now.toISOString(), created_by: "web-ui",
    });
    const res = await linkPipelineTask(id, task.id);
    if (!res.ok) return { ok: false, error: "Created the task but couldn't link it." };
    revalidatePath("/hrms/pipeline");
    revalidatePath("/");
    return { ok: true, code: task.code };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't create the task." };
  }
}

/** Detach the driving task from this case (the task itself is kept). */
export async function unlinkPipelineTaskAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const res = await linkPipelineTask(id, null);
  if (!res.ok) return { ok: false, error: "Couldn't unlink the task." };
  revalidatePath("/hrms/pipeline");
  return { ok: true };
}
