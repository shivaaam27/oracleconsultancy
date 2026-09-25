"use server";

import { guardOwner, guardViewer } from "@/lib/auth/viewer";
import { needCap, needCompany, stampOf, assigneesFor } from "@/lib/auth/viewer-scope";
import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import { parseCapture } from "@/lib/tasks/smart-parse";
import { createTaskCore } from "@/lib/tasks/task-write";
import { invalidateAllTasks } from "@/lib/tasks/queries";

/** One parsed line of a pasted list — what the preview table edits. */
export type ParsedLine = {
  raw: string;
  actionItem: string;
  companyId: number | null;
  assigneeNames: string[];
  priority: string;
  /** yyyy-mm-dd, or null. */
  deadline: string | null;
};

/**
 * Parse a PASTED LIST — one task per line — with the company and people
 * loaded once. Each line goes through the same `parseCapture` the wizard
 * uses, so "Renew TRA licence for DSC by Friday, Vishal" becomes a task on
 * DSC Ltd for Vishal due Friday with the matched words taken out of the
 * title. Nothing is created here; the caller previews and confirms.
 */
export async function parseCaptureLines(lines: string[]): Promise<ParsedLine[]> {
  await guardOwner();
  const [{ data: cRows }, { data: pRows }] = await Promise.all([
    sb.from("companies").select("id,name,code"),
    sb.from("people").select("id,name").eq("active", true),
  ]);
  const companies = (cRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string, code: c.code as string }));
  // People are stored WITH their honorific ("Mr Vishal Pragji"), and the parser
  // matches a person by full name or FIRST word — which was "Mr". Hand it the
  // bare name and map the match back to the stored one.
  const stripHon = (n: string) => n.replace(/^(?:mr|mrs|ms|miss|dr|eng|prof|hon)\.?\s+/i, "").trim();
  const people = (pRows ?? []).map((p) => ({ id: p.id as number, name: stripHon(p.name as string) }));
  const storedName = new Map(people.map((p, i) => [p.name, (pRows ?? [])[i].name as string]));
  const tidy = (s: string) =>
    s.replace(/\s+/g, " ")
      .replace(/\s*([,;:\-–—])\s*(?=[,;:\-–—]|$)/g, "") // ", ," and a dangling "-"
      .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, "")       // punctuation left at either end
      .replace(/\b(for|to|with|by|from|at|on)\s*$/i, "")   // "…licence for" once the company is out
      .trim();
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return lines
    .map((l) => l.replace(/^\s*(?:[-*••]|\d+[.)])\s*/, "").trim()) // "- ", "1. ", "• "
    .filter(Boolean)
    .slice(0, 100)
    .map((raw) => {
      const p = parseCapture(raw, companies, people);
      const title = tidy(p.actionItem);
      return {
        raw,
        actionItem: title.length > 2 ? title : raw,
        companyId: p.companyId,
        assigneeNames: p.assigneeNames.map((n) => storedName.get(n) ?? n),
        priority: p.priority === "Low" ? "Medium" : p.priority, // a pasted line rarely says "low"
        deadline: p.deadline ? ymd(p.deadline) : null,
      };
    });
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
  /**
   * Audit-log discriminator. Defaults to "capture" (the Capture Wizard). Other
   * web-UI callers (e.g. the Tasks quick-create popover) pass "web-ui" so they
   * stay distinguishable per the CLAUDE.md createdBy/source convention.
   */
  createdBy?: string;
}): Promise<{ ok: boolean; code?: string; error?: string }> {
  // The owner, or a director adding to one of their own companies — with
  // existing people only (viewer-scope.ts), stamped as themselves.
  const actionItem = input.actionItem.trim();
  if (!input.companyId || !actionItem) {
    return { ok: false, error: "Company and action item are required." };
  }
  try {
    const v = await guardViewer();
    needCap(v, "createTasks");
    needCompany(v, input.companyId);
    const names = (input.assignees || "").split(/,|\s+&\s+/).map((x) => x.trim()).filter(Boolean);
    const who = await assigneesFor(v, names);
    // ⚠️ THE ONE DOOR. This used to insert the task itself, so a task added
    // from the quick-add row or the board never notified its assignees, had
    // no undo token and wrote its own audit row. Same core as the full form
    // and MCP now; only the `createdBy` stamp differs.
    const res = await createTaskCore({
      companyId: input.companyId,
      actionItem,
      status: input.status || "Not Started",
      priority: input.priority || "Low",
      escalation: input.escalation || "No",
      category: input.category ?? null,
      comments: input.comments ?? null,
      deadline: input.deadline ? new Date(input.deadline) : null,
      ...who,
      createdBy: stampOf(v, input.createdBy ?? "capture"),
    });
    if (!res.ok) return { ok: false, error: res.error };
    const { taskId, code } = res.result;

    if (input.sourceMeetingId) {
      await sb.from("meeting_tasks").upsert(
        { meeting_id: input.sourceMeetingId, task_id: taskId, created_at: new Date().toISOString() },
        { ignoreDuplicates: true }
      );
    }

    revalidatePath("/registry");
    revalidatePath("/");
    updateTag("tasks"); invalidateAllTasks();
    return { ok: true, code };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create task." };
  }
}
