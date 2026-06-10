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

/** Upsert a single obligation_company row, patching the given fields. */
async function upsertOc(obligationId: number, companyId: number, fields: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { error } = await sb
    .from("obligation_company")
    .upsert(
      { obligation_id: obligationId, company_id: companyId, updated_at: now, created_at: now, ...fields },
      { onConflict: "obligation_id,company_id" },
    );
  if (error) throw new Error(error.message);
}

/** Tick a daily/weekly routine done — operator-level (not per company). */
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

/** Tick (or untick) one company's completion of an obligation for this period. */
export async function toggleObligationCompanyAction(
  obligationId: number,
  companyId: number,
  done: boolean,
): Promise<Result> {
  try {
    await upsertOc(obligationId, companyId, { last_done: done ? new Date().toISOString() : null });
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update." };
  }
}

/** Mark an obligation applicable / not applicable for one company (opt-out). */
export async function setObligationApplicableAction(
  obligationId: number,
  companyId: number,
  applicable: boolean,
): Promise<Result> {
  try {
    await upsertOc(obligationId, companyId, { applicable });
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update." };
  }
}

/**
 * Optional: promote one company's obligation to a real task (for items you want
 * to assign and chase). Reuses the task engine; ticks that company done for the
 * period. Does NOT touch other companies — the per-company tick grid is primary.
 */
export async function createTaskFromObligationAction(obligationId: number, companyId: number): Promise<Result> {
  try {
    const { data: ob, error } = await sb.from("recurring_obligations").select("*").eq("id", obligationId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!ob) return { ok: false, error: "Obligation not found." };
    if (!companyId) return { ok: false, error: "Pick a company for the task." };

    const frequency = ob.frequency as ObligationFrequency;
    const now = new Date();
    const dueDate = computeNextDue(
      { frequency, dueDay: ob.due_day as number | null, dueRule: ob.due_rule as string | null },
      now,
    );

    const { data: company } = await sb.from("companies").select("code,name").eq("id", companyId).maybeSingle();

    const task = await insertTaskWithUniqueCodeSb(companyId, (company?.code as string) || "", {
      actionItem: `${ob.label as string}${company?.name ? ` — ${company.name}` : ""}`,
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

    // Tick this company done for the period (the task now carries the work).
    await upsertOc(obligationId, companyId, { last_done: now.toISOString() });

    revalidate();
    updateTag("tasks");
    return { ok: true, code: task.code };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the task." };
  }
}
