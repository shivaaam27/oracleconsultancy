"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getAllTasks } from "@/lib/queries";
import { createOverdueReminderDrafts } from "@/lib/automation-suggestions";

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
