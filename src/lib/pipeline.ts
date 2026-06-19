import { sb } from "@/db/supabase";
import { normalizeStage, type PipelineItem, type PipelineStage } from "@/lib/pipeline-shared";

// Server reads/writes for the in-flight bureaucracy pipeline.

export type { PipelineItem } from "@/lib/pipeline-shared";

// Mirror the assets.ts/stock.ts pattern: a write either succeeds or reports the
// DB error, so a failed write can never be mistaken for success (ACTHRMS-05).
export type WriteResult = { ok: true } | { ok: false; error: string };

const COLS = "id,subject,subject_type,company_id,person_id,type,stage,control_no,amount,last_update,deadline,next_action,owner,notes,document_id,task_id,tasks(code)";

function mapRow(r: Record<string, unknown>, nameById: Map<number, string>): PipelineItem {
  const companyId = (r.company_id as number | null) ?? null;
  const taskRel = (r as { tasks?: { code?: string } | { code?: string }[] }).tasks;
  const taskCode = (Array.isArray(taskRel) ? taskRel[0]?.code : taskRel?.code) ?? null;
  return {
    id: r.id as number,
    subject: r.subject as string,
    subjectType: (r.subject_type as string | null) ?? null,
    companyId,
    companyName: companyId ? nameById.get(companyId) ?? null : null,
    personId: (r.person_id as number | null) ?? null,
    type: r.type as string,
    stage: normalizeStage(r.stage as string | null),
    controlNo: (r.control_no as string | null) ?? null,
    amount: (r.amount as string | null) ?? null,
    lastUpdate: (r.last_update as string | null) ?? null,
    deadline: (r.deadline as string | null) ?? null,
    nextAction: (r.next_action as string | null) ?? null,
    owner: (r.owner as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    documentId: (r.document_id as number | null) ?? null,
    taskId: (r.task_id as number | null) ?? null,
    taskCode,
  };
}

/** Link (or unlink) a supporting document to a pipeline case. */
export async function linkPipelineDocument(id: number, documentId: number | null): Promise<WriteResult> {
  const { error } = await sb.from("pipeline").update({ document_id: documentId, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Link (or unlink) the task that drives this case. */
export async function linkPipelineTask(id: number, taskId: number | null): Promise<WriteResult> {
  const { error } = await sb.from("pipeline").update({ task_id: taskId, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** The pipeline case (id + current stage) driven by a given task, if any —
 *  for the "complete task → advance stage" cascade. Open cases only. */
export async function pipelineForTask(taskId: number): Promise<{ id: number; stage: string; type: string; companyId: number | null; personId: number | null } | null> {
  const { data } = await sb
    .from("pipeline")
    .select("id,stage,type,company_id,person_id")
    .eq("task_id", taskId)
    .eq("archived", false)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as number, stage: data.stage as string, type: data.type as string, companyId: (data.company_id as number | null) ?? null, personId: (data.person_id as number | null) ?? null };
}

/** All open pipeline items (not archived), newest update first. */
export async function listPipeline(): Promise<PipelineItem[]> {
  const [{ data }, { data: companies }] = await Promise.all([
    sb.from("pipeline").select(COLS).eq("archived", false).order("last_update", { ascending: false, nullsFirst: false }),
    sb.from("companies").select("id,name"),
  ]);
  const nameById = new Map((companies ?? []).map((c) => [c.id as number, c.name as string]));
  return (data ?? []).map((r) => mapRow(r, nameById));
}

export type PipelineInput = {
  subject: string;
  subjectType?: string | null;
  companyId?: number | null;
  personId?: number | null;
  type: string;
  stage?: string | null;
  controlNo?: string | null;
  amount?: string | null;
  deadline?: Date | string | null;
  nextAction?: string | null;
  owner?: string | null;
  notes?: string | null;
};

const toIso = (v: Date | string | null | undefined) => (v == null || v === "" ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString());

export async function createPipelineItem(
  input: PipelineInput,
  createdBy = "web-ui",
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await sb.from("pipeline").insert({
    subject: input.subject,
    subject_type: input.subjectType ?? null,
    company_id: input.companyId ?? null,
    person_id: input.personId ?? null,
    type: input.type,
    stage: normalizeStage(input.stage),
    control_no: input.controlNo ?? null,
    amount: input.amount ?? null,
    deadline: toIso(input.deadline),
    next_action: input.nextAction ?? null,
    owner: input.owner ?? null,
    notes: input.notes ?? null,
    last_update: now,
    created_at: now,
    updated_at: now,
    created_by: createdBy,
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Insert returned no row." };
  return { ok: true, id: data.id as number };
}

/** Move an item to a new stage (stamps last_update). */
export async function setPipelineStage(id: number, stage: PipelineStage): Promise<WriteResult> {
  const now = new Date().toISOString();
  const { error } = await sb.from("pipeline").update({ stage, last_update: now, updated_at: now }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updatePipelineItem(id: number, patch: Partial<PipelineInput>): Promise<WriteResult> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString(), last_update: new Date().toISOString() };
  if (patch.subject !== undefined) payload.subject = patch.subject;
  if (patch.companyId !== undefined) payload.company_id = patch.companyId;
  if (patch.type !== undefined) payload.type = patch.type;
  if (patch.stage !== undefined) payload.stage = normalizeStage(patch.stage);
  if (patch.controlNo !== undefined) payload.control_no = patch.controlNo;
  if (patch.amount !== undefined) payload.amount = patch.amount;
  if (patch.deadline !== undefined) payload.deadline = toIso(patch.deadline);
  if (patch.nextAction !== undefined) payload.next_action = patch.nextAction;
  if (patch.owner !== undefined) payload.owner = patch.owner;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  const { error } = await sb.from("pipeline").update(payload).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function archivePipelineItem(id: number, archived = true): Promise<WriteResult> {
  const { error } = await sb.from("pipeline").update({ archived, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
