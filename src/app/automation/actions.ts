"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getAllTasks } from "@/lib/queries";
import { listDocuments } from "@/lib/documents";
import { createDocumentRenewalTasks, createOverdueReminderDrafts } from "@/lib/automation-suggestions";

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
