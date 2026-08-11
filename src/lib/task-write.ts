// The task write core — one implementation, several doors.
//
// `createTask` and `addTaskUpdate` in src/app/task/actions.ts are the WEB doors:
// they read a FormData, set the undo cookie and redirect. /api/mcp is another
// door and has neither a form nor a cookie. Both call the functions here, so a
// task an assistant creates is written by exactly the same code as one the owner
// types — same code allocation, same atomic transaction, same audit row, same
// undo token. Only the `createdBy` stamp differs.
//
// FORWARD RULE: if you add a task write path (an API, a cron, another assistant),
// call these — never re-implement the insert. The duplicate would drift, and the
// day it drifts is the day one door stops writing an audit row.
//
// Cache invalidation is deliberately NOT done here: a server action and a route
// handler bust caches differently. Each caller does its own.
//
// Server-only.

import { sb } from "@/db/supabase";
import { getOrCreateDeptSb, getOrCreatePersonSb } from "@/lib/db-helpers";
import { mutate, type Actor, type MutateResult } from "@/lib/mutate";
import { withTx } from "@/lib/tx";
import { computeClosedDate, computeClosedDateFrom } from "@/lib/task-status";
import { tasks as tasksTable, taskAssignees, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { reindexEntity } from "@/lib/index-hooks";

export type TaskRepeatRecipe = {
  cadence: "weekly" | "monthly";
  /** 0 = Sunday … 6 = Saturday. Weekly cadence only. */
  weekdays: number[];
  /** 1–31. Monthly cadence only. */
  dayOfMonth: number;
};

export type CreateTaskInput = {
  companyId: number;
  actionItem: string;
  departmentName?: string | null;
  status?: string | null;
  priority?: string | null;
  risk?: string | null;
  escalation?: string | null;
  category?: string | null;
  deadline?: Date | null;
  meetingDate?: Date | null;
  comments?: string | null;
  latestUpdate?: string | null;
  /**
   * Assignees by NAME — an unknown name CREATES a person (the web form's
   * behaviour, where the owner is typing and means it).
   */
  assigneeNames?: string[];
  /**
   * Assignees by id — resolved beforehand, so nothing new is created. Assistants
   * use this: an assistant that mishears a name must fail to find them, not
   * quietly add a member of staff.
   */
  assigneeIds?: number[];
  /** "lead" makes the first assignee accountable (only they carry the overdue). */
  accountability?: "shared" | "lead";
  /** Optional standing repeat rule saved alongside today's task. */
  repeat?: TaskRepeatRecipe | null;
  /** Audit stamp: "web-ui" | "capture" | "mcp:<Name>" | … */
  createdBy: string;
  /** Undo-token owner. Defaults to "web-ui". */
  actor?: Actor;
};

/**
 * Create a task, atomically, with its assignees and its CREATE audit row.
 *
 * Never throws for an expected failure — returns `{ ok: false, error }` so a
 * caller can report it. The task code is allocated inside the transaction and
 * retried on collision.
 */
export async function createTaskCore(
  input: CreateTaskInput,
): Promise<MutateResult<{ code: string; taskId: number }>> {
  const actionItem = (input.actionItem ?? "").trim();
  if (!input.companyId || !actionItem) {
    return { ok: false, error: "Company and Action Item are required" };
  }

  const status = input.status || "Not Started";
  const priority = input.priority || "Low";
  const escalation = input.escalation || "No";
  const accountability = input.accountability === "lead" ? "lead" : "shared";
  const repeat = input.repeat ?? null;

  return await mutate({
    kind: "task.create",
    actor: input.actor,
    run: async () => {
      const { data: company, error: cErr } = await sb
        .from("companies")
        .select("code, code_prefix")
        .eq("id", input.companyId)
        .maybeSingle();
      if (cErr) throw new Error(cErr.message);
      if (!company) throw new Error("Company not found");

      // Resolve the department + assignee people BEFORE the transaction: these
      // are idempotent get-or-create lookups (their own rows are not part of the
      // task's atomic write, and re-running them is harmless on retry).
      const departmentId = await getOrCreateDeptSb(input.departmentName ?? null);
      const assigneeIds: number[] = [...(input.assigneeIds ?? [])];
      for (const n of input.assigneeNames ?? []) {
        assigneeIds.push(await getOrCreatePersonSb(n, input.companyId));
      }

      const now = new Date();
      const nowIso = now.toISOString();
      // Prefer the two-letter prefix (DS-001); fall back to the legacy company code.
      const prefix = (company.code_prefix as string | null) || (company.code as string);
      const closedDate = computeClosedDate(status, null, nowIso);

      // Atomic create (ACTTASKS-04 / DBSPINE-02): the task row, its assignees and
      // the CREATE audit entry either all commit or all roll back — no orphaned
      // task and no missing audit on a mid-sequence failure. The unique-code
      // allocation is retried in-transaction on a code collision.
      const task = await withTx(async (tx) => {
        let created: { id: number; code: string } | null = null;
        for (let attempt = 0; attempt < 5 && !created; attempt++) {
          const existing = await tx
            .select({ code: tasksTable.code })
            .from(tasksTable)
            .where(eq(tasksTable.companyId, input.companyId));
          let maxNum = 0;
          for (const row of existing) {
            const m = row.code.match(/(\d+)$/);
            if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
          }
          const newCode = `${prefix}-${String(maxNum + 1 + attempt).padStart(3, "0")}`;
          try {
            // Nested transaction = a SAVEPOINT, so a unique-code collision rolls
            // back just this attempt (not the whole transaction, which postgres.js
            // would otherwise abort) and the next attempt can proceed.
            created = await tx.transaction(async (sp) => {
              const [inserted] = await sp
                .insert(tasksTable)
                .values({
                  code: newCode,
                  companyId: input.companyId,
                  departmentId,
                  actionItem,
                  status,
                  priority,
                  risk: input.risk ?? null,
                  escalation,
                  category: input.category ?? null,
                  deadline: input.deadline ?? null,
                  meetingDate: input.meetingDate ?? null,
                  comments: input.comments ?? null,
                  latestUpdate: input.latestUpdate ?? null,
                  createdDate: now,
                  lastUpdatedAt: now,
                  closedDate: closedDate ? new Date(closedDate) : null,
                  archived: false,
                  accountability,
                  // In "lead" mode the first assignee owns it (carries overdue).
                  ownerId: accountability === "lead" && assigneeIds.length ? assigneeIds[0] : undefined,
                })
                .returning({ id: tasksTable.id, code: tasksTable.code });
              return inserted;
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!/duplicate key|unique/i.test(msg)) throw e;
            // Code collided — let the next attempt pick the next number.
          }
        }
        if (!created) throw new Error("Could not allocate a unique task code.");

        if (assigneeIds.length) {
          await tx
            .insert(taskAssignees)
            .values(assigneeIds.map((personId, i) => ({
              taskId: created!.id,
              personId,
              // In "lead" mode the first assignee is the accountable lead.
              role: accountability === "lead" && i === 0 ? "accountable" : "working",
            })))
            .onConflictDoNothing();
        }

        await tx.insert(auditLog).values({
          taskId: created.id,
          taskCode: created.code,
          companyId: input.companyId,
          entryType: "CREATE",
          field: "Task",
          oldValue: null,
          newValue: actionItem,
          changeReason: null,
          createdAt: now,
          createdBy: input.createdBy,
        });

        return created;
      });

      // Best-effort semantic index (no-op unless semantic search is enabled).
      void reindexEntity("task", task.id);

      // Standing repeat rule — mirrors this task's template (title, company,
      // assignees, priority, status, description) so future copies auto-create
      // complete. Never bound to today's task row; best-effort (never blocks
      // today's task creation if it fails).
      if (repeat && (repeat.cadence === "monthly" || repeat.weekdays.length > 0)) {
        try {
          await sb.from("automation_rules").insert({
            task_id: null, company_id: input.companyId, kind: "recurring_task",
            config: {
              cadence: repeat.cadence,
              ...(repeat.cadence === "weekly"
                ? { weekdays: repeat.weekdays }
                : { dayOfMonth: repeat.dayOfMonth }),
              title: actionItem, companyId: input.companyId, priority, status,
              assigneePersonIds: assigneeIds,
              ...(input.comments ? { description: input.comments } : {}),
            },
            active: true, done: false, created_by: input.createdBy, created_at: nowIso,
          });
        } catch { /* best-effort — today's task is created regardless */ }
      }

      return {
        result: { code: task.code, taskId: task.id },
        undo: { kind: "task.create", taskId: task.id, payload: { taskId: task.id } },
      };
    },
  });
}

/**
 * Post an update on a task, optionally moving its status.
 *
 * Mirrors the web conversation box: the update row, the task's latest_update /
 * last_updated_at, a Status audit row when the status actually moves, and the
 * pipeline cascade. Returns the undo token so a wrong update can be pulled back.
 */
export async function addTaskUpdateCore(input: {
  taskId: number;
  taskCode: string;
  body: string;
  newStatus?: string;
  /** Audit stamp: "web-ui" | "mcp:<Name>" | … */
  createdBy: string;
  actor?: Actor;
}): Promise<MutateResult<{ taskUpdateId: number }>> {
  const trimmed = (input.body ?? "").trim();
  if (!trimmed) return { ok: false, error: "The update is empty." };

  return await mutate({
    kind: "task.update.add",
    taskId: input.taskId,
    actor: input.actor,
    run: async () => {
      const { data: t, error: tErr } = await sb
        .from("tasks")
        .select("status,closed_date,latest_update,last_updated_at,company_id")
        .eq("id", input.taskId)
        .maybeSingle();
      if (tErr) throw new Error(tErr.message);
      if (!t) throw new Error("Task not found");

      const before = {
        latestUpdate: t.latest_update as string | null,
        lastUpdatedAt: t.last_updated_at as string | null,
        status: t.status as string,
        closedDate: t.closed_date as string | null,
      };

      const { data: inserted, error: insErr } = await sb
        .from("task_updates")
        .insert({
          task_id: input.taskId,
          body: trimmed,
          created_at: new Date().toISOString(),
          created_by: input.createdBy,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      const taskUpdateId = inserted.id as number;

      const updatePayload: Record<string, unknown> = {
        latest_update: trimmed,
        last_updated_at: new Date().toISOString(),
      };

      if (input.newStatus) {
        updatePayload.status = input.newStatus;
        updatePayload.closed_date = computeClosedDateFrom(
          t.status as string,
          input.newStatus,
          t.closed_date as string | null,
        );

        if (t.status !== input.newStatus) {
          await sb.from("audit_log").insert({
            task_id: input.taskId,
            task_code: input.taskCode,
            company_id: t.company_id as number,
            entry_type: "CHANGE",
            field: "Status",
            old_value: t.status,
            new_value: input.newStatus,
            change_reason: trimmed,
            created_at: new Date().toISOString(),
            created_by: input.createdBy,
          });
        }
      }

      await sb.from("tasks").update(updatePayload).eq("id", input.taskId);
      if (input.newStatus) {
        await fireTaskCascade(input.taskId, t.status as string, input.newStatus);
      }

      // Best-effort re-index: latest_update (and possibly status/lifecycle) moved.
      void reindexEntity("task", input.taskId);

      return {
        result: { taskUpdateId },
        undo: {
          kind: "task.update.add",
          taskId: input.taskId,
          payload: {
            taskUpdateId,
            taskId: input.taskId,
            taskCode: input.taskCode,
            companyId: t.company_id as number,
            before,
          },
        },
      };
    },
  });
}

/** Fire the cross-process cascade when a task's status changes: completing a task
 *  that DRIVES a pipeline case (pipeline.task_id) advances that case a stage.
 *  Guarded + dynamic-imported (avoids cycles); never affects the task write. */
async function fireTaskCascade(taskId: number, wasStatus: string, nowStatus: string) {
  if (wasStatus === nowStatus) return;
  try {
    const m = await import("@/lib/automation-reactions");
    await m.reactToTaskStatusChange(taskId, wasStatus, nowStatus);
  } catch { /* best-effort */ }
}
