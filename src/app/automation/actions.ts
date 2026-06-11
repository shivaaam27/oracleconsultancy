"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getAllTasks } from "@/lib/queries";
import { listDocuments } from "@/lib/documents";
import {
  commitRenewalTaskFor,
  commitReminderDraftFor,
  createDocumentRenewalTasks,
  createOverdueReminderDrafts,
  previewMorningPlan,
  type MorningPlanItem,
} from "@/lib/automation-suggestions";

export async function getMorningPlanAction(): Promise<{ ok: true; items: MorningPlanItem[] } | { ok: false; error: string }> {
  try {
    const [rows, documents] = await Promise.all([getAllTasks(), listDocuments()]);
    const items = await previewMorningPlan(rows, documents);
    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not build the morning plan" };
  }
}

export async function approveReminderAction(
  personId: number,
): Promise<{ ok: true; created: boolean; reason?: string; link?: string | null; channel?: string; personName?: string } | { ok: false; error: string }> {
  try {
    const rows = await getAllTasks();
    const res = await commitReminderDraftFor(personId, rows);
    revalidatePath("/");
    revalidatePath("/outbox");
    updateTag("outbox");
    return { ok: true, ...res };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the reminder draft" };
  }
}

export async function approveRenewalAction(
  documentId: number,
): Promise<{ ok: true; created: boolean; reason?: string } | { ok: false; error: string }> {
  try {
    const documents = await listDocuments();
    const res = await commitRenewalTaskFor(documentId, documents);
    revalidatePath("/");
    revalidatePath("/documents");
    updateTag("tasks");
    return { ok: true, ...res };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the renewal task" };
  }
}

export async function createOverdueReminderDraftsAction(): Promise<{ ok: true; created: number; skipped: number } | { ok: false; error: string }> {
  try {
    const rows = await getAllTasks();
    const result = await createOverdueReminderDrafts(rows);
    revalidatePath("/");
    revalidatePath("/outbox");
    updateTag("outbox");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create reminder drafts" };
  }
}

export async function createDocumentRenewalTasksAction(): Promise<{ ok: true; created: number; skipped: number } | { ok: false; error: string }> {
  try {
    const documents = await listDocuments();
    const result = await createDocumentRenewalTasks(documents);
    revalidatePath("/");
    revalidatePath("/documents");
    updateTag("tasks");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create renewal tasks" };
  }
}
