"use server";

import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import { parseCapture, type ParsedCapture } from "@/lib/smart-parse";
import { getOrCreatePersonSb, insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";

export async function parseRawCapture(raw: string): Promise<ParsedCapture> {
  const [{ data: cRows }, { data: pRows }] = await Promise.all([
    sb.from("companies").select("id,name,code"),
    sb.from("people").select("id,name"),
  ]);
  const companies = (cRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string, code: c.code as string }));
  const people = (pRows ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  return parseCapture(raw, companies, people);
}

/**
 * Create a task from a capture, returning its code. Unlike `createTask`, this
 * does NOT redirect — the Capture Wizard stays open to show a success screen.
 * `createdBy` is "capture" so these are distinguishable from web-ui entries.
 */
export async function createCaptureTask(input: {
  companyId: number;
  actionItem: string;
  priority?: string;
  status?: string;
  deadline?: string | null;
  assignees?: string;
  category?: string | null;
  escalation?: string;
  comments?: string | null;
  /** When created from a note/meeting, link it back via meeting_tasks. */
  sourceMeetingId?: number | null;
}): Promise<{ ok: boolean; code?: string; error?: string }> {
  const actionItem = input.actionItem.trim();
  if (!input.companyId || !actionItem) {
    return { ok: false, error: "Company and action item are required." };
  }
  try {
    const { data: company, error: cErr } = await sb
      .from("companies")
      .select("code")
      .eq("id", input.companyId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!company) return { ok: false, error: "Company not found." };

    const now = new Date();
    const task = await insertTaskWithUniqueCodeSb(input.companyId, company.code as string, {
      actionItem,
      status: input.status || "Not Started",
      priority: input.priority || "Low",
      escalation: input.escalation || "No",
      category: input.category ?? null,
      comments: input.comments ?? null,
      deadline: input.deadline ? new Date(input.deadline) : null,
      createdDate: now,
      lastUpdatedAt: now,
      archived: false,
    });

    const names = (input.assignees || "")
      .split(/,|\s+&\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
    for (const n of names) {
      const pid = await getOrCreatePersonSb(n, input.companyId);
      await sb.from("task_assignees").upsert({ task_id: task.id, person_id: pid }, { ignoreDuplicates: true });
    }

    await sb.from("audit_log").insert({
      task_id: task.id,
      task_code: task.code,
      company_id: input.companyId,
      entry_type: "CREATE",
      field: "Task",
      old_value: null,
      new_value: actionItem,
      change_reason: "Created via capture",
      created_at: now.toISOString(),
      created_by: "capture",
    });

    if (input.sourceMeetingId) {
      await sb.from("meeting_tasks").upsert(
        { meeting_id: input.sourceMeetingId, task_id: task.id, created_at: now.toISOString() },
        { ignoreDuplicates: true }
      );
      revalidatePath("/workbook");
    }

    revalidatePath("/registry");
    revalidatePath("/");
    updateTag("tasks");
    return { ok: true, code: task.code };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create task." };
  }
}
