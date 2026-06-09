"use server";

import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { computeNextDue, type ObligationFrequency } from "@/lib/command-centre";

type Result = { ok: true; code?: string } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/hrms/command-centre");
  revalidatePath("/");
}

/** Tick a daily/weekly habit done — stamps last_done to now. */
export async function tickHabitAction(id: number): Promise<Result> {
  try {
    const now = new Date();
    const { error } = await sb
      .from("recurring_obligations")
      .update({ last_done: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the duty." };
  }
}

/**
 * Promote a dated obligation to a real task (suggest-confirm). Reuses the task
 * engine so the obligation inherits code/audit/reminders/Brief. Stamps next_due
 * so the cadence rolls forward. createdBy "recurring" preserves provenance.
 */
export async function createTaskFromObligationAction(id: number): Promise<Result> {
  try {
    const { data: ob, error } = await sb
      .from("recurring_obligations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ob) return { ok: false, error: "Obligation not found." };

    const frequency = ob.frequency as ObligationFrequency;
    const now = new Date();
    const dueDate = ob.next_due
      ? new Date(ob.next_due as string)
      : computeNextDue({ frequency, dueDay: ob.due_day as number | null, dueRule: ob.due_rule as string | null }, now);

    // Portfolio-wide obligations (company_id null) need a home company for the
    // task code. Fall back to the first active company.
    let companyId = ob.company_id as number | null;
    if (!companyId) {
      const { data: firstCo } = await sb.from("companies").select("id").eq("active", true).order("id").limit(1).maybeSingle();
      companyId = (firstCo?.id as number | null) ?? null;
    }
    if (!companyId) return { ok: false, error: "No company available to host the task." };

    const { data: company } = await sb.from("companies").select("code").eq("id", companyId).maybeSingle();

    const task = await insertTaskWithUniqueCodeSb(companyId, (company?.code as string) || "", {
      actionItem: ob.label as string,
      status: "Not Started",
      priority: "High",
      category: (ob.category as string) || "Admin",
      comments: (ob.why as string | null) ?? null,
      deadline: dueDate,
      createdDate: now,
      lastUpdatedAt: now,
      archived: false,
    });

    await sb.from("audit_log").insert({
      task_id: task.id,
      task_code: task.code,
      company_id: companyId,
      entry_type: "CREATE",
      field: "Task",
      old_value: null,
      new_value: ob.label as string,
      change_reason: "Created from a recurring obligation",
      created_at: now.toISOString(),
      created_by: "recurring",
    });

    // Roll the cadence forward: stamp last_done now, cache the next occurrence.
    const nextAfter = computeNextDue(
      { frequency, dueDay: ob.due_day as number | null, dueRule: ob.due_rule as string | null },
      new Date((dueDate ?? now).getTime() + 24 * 60 * 60 * 1000),
    );
    await sb
      .from("recurring_obligations")
      .update({ last_done: now.toISOString(), next_due: nextAfter ? nextAfter.toISOString() : null, updated_at: now.toISOString() })
      .eq("id", id);

    revalidate();
    updateTag("tasks");
    return { ok: true, code: task.code };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the task." };
  }
}
