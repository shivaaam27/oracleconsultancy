// All-or-nothing transaction helper (ERPREADY-01 / DBSPINE-02).
//
// The dominant write client across the app is the supabase-js HTTP client
// (`sb` in src/db/supabase.ts), which speaks PostgREST over HTTP and has NO
// transaction primitive: every `.insert`/`.update`/`.delete` is its own round
// trip, so a multi-row mutation can half-apply on any mid-sequence failure.
//
// `withTx` is the single sanctioned way to make a mutation that touches more
// than one row/table atomic. It runs on the Drizzle/postgres.js pool from
// src/db/index.ts (the same PgBouncer transaction-mode pooler the supabase-js
// client uses) and wraps the body in `db.transaction`, so the whole body either
// commits together or rolls back together — nothing is left half-written.
//
// RULE (Phase 0 / ERP): any mutation that writes >1 row or >1 table and must be
// consistent goes through `withTx`. Use the Drizzle `tx` handle for the writes
// (NOT the supabase-js `sb` client — `sb` calls inside the callback are plain
// HTTP and are NOT part of the transaction, so they would not roll back).
//
// ---------------------------------------------------------------------------
// HOW TO CONVERT A HOT-PATH MUTATION (e.g. task create) off supabase-js:
//
//   BEFORE (non-atomic — orphaned task if the audit insert fails):
//     const { data: task } = await sb.from("tasks").insert(payload).select("id").single();
//     await sb.from("task_assignees").insert({ task_id: task.id, person_id });
//     await sb.from("audit_log").insert({ task_id: task.id, entry_type: "CREATE" });
//
//   AFTER (all-or-nothing):
//     import { withTx } from "@/lib/tx";
//     import { tasks, taskAssignees, auditLog } from "@/db/schema";
//
//     const id = await withTx(async (tx) => {
//       const [task] = await tx.insert(tasks).values(payload).returning({ id: tasks.id });
//       await tx.insert(taskAssignees).values({ taskId: task.id, personId });
//       await tx.insert(auditLog).values({ taskId: task.id, entryType: "CREATE" });
//       return task.id;
//     });
//
// `withTx` returns whatever the callback returns. If the callback throws, the
// transaction rolls back and the error propagates — let the calling action turn
// it into `{ ok: false, error }`.
// ---------------------------------------------------------------------------

import { db } from "@/db";

/** Drizzle transaction handle — the type of the `tx` passed to `db.transaction`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run `fn` inside a single database transaction. The whole callback commits
 * atomically, or rolls back entirely if it throws. Use the supplied `tx` handle
 * (Drizzle) for every write inside `fn` — do NOT use the supabase-js `sb` client
 * in here, as those HTTP calls are not part of the transaction.
 */
export function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
