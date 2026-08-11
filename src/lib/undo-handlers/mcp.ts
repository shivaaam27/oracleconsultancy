// Undo handlers for writes that arrived through /api/mcp.
//
// Tasks and task updates already have handlers (undo-handlers/tasks.ts) and MCP
// reuses them — a task is a task however it was created. What needs its own
// handler is the three things only stage 2 creates through this door: a calendar
// event, a document record and an asset assignment.
//
// These reverse a change the SAME assistant made minutes ago; they are not a
// deletion tool. MCP itself can never delete anything — see memory/mcp_stage2_safe_writes.md.
//
// Registered via undo-handlers.ts and consumed by consumeUndo(), exactly like the rest.

import { sb } from "@/db/supabase";
import { registerUndoHandler } from "../undo";
import { reindexEntity } from "@/lib/index-hooks";

// Calendar event — remove it, through the action, so the Google copy and any
// meeting tasks it spawned go with it. No invitation was ever sent (MCP creates
// with autoInvite off), so nobody is emailed a cancellation for a diary entry
// they never heard about.
registerUndoHandler("mcp.event.create", async (raw) => {
  const p = raw as { eventId: number };
  const { deleteEventAction } = await import("@/app/calendar/actions");
  await deleteEventAction(p.eventId);
});

// Document record — remove the row. Only ever a record MCP itself just created,
// and it can carry no file (nothing can be uploaded through this door).
registerUndoHandler("mcp.document.create", async (raw) => {
  const p = raw as { documentId: number };
  await sb.from("documents").delete().eq("id", p.documentId);
});

// Asset assignment — put the asset back where it was: to the previous holder if
// there was one, otherwise to the store. The ledger row MCP opened is removed and
// the one it closed is reopened, so the history reads as though it never happened.
registerUndoHandler("mcp.asset.assign", async (raw) => {
  const p = raw as {
    assetId: number;
    assignmentId: number | null;
    before: {
      assigned_to_person_id: number | null;
      assigned_to_company_id: number | null;
      custodian_person_id: number | null;
      assigned_at: string | null;
      status: string;
    };
    reopenAssignmentId: number | null;
  };
  if (p.assignmentId) await sb.from("asset_assignments").delete().eq("id", p.assignmentId);
  if (p.reopenAssignmentId) {
    await sb.from("asset_assignments").update({ returned_at: null }).eq("id", p.reopenAssignmentId);
  }
  await sb
    .from("assets")
    .update({ ...p.before, updated_at: new Date().toISOString() })
    .eq("id", p.assetId);
  void reindexEntity("asset", p.assetId);
});

// Outbox draft — delete it. Nothing was ever sent (a draft is by definition
// unsent), so this leaves no trace and reaches nobody.
registerUndoHandler("mcp.outbox.draft", async (raw) => {
  const p = raw as { outboxId: number };
  await sb.from("outbox").delete().eq("id", p.outboxId).eq("status", "Draft");
});

// Archive / restore a task — put the flag back where it was, through the same
// action, so the audit trail records the reversal too.
registerUndoHandler("mcp.task.archive", async (raw) => {
  const p = raw as { code: string; before: boolean };
  const { setTaskArchived } = await import("@/app/task/actions");
  await setTaskArchived(p.code, p.before);
});

// Archive / restore a document — same again.
registerUndoHandler("mcp.document.archive", async (raw) => {
  const p = raw as { documentId: number; before: boolean };
  const { archiveDocumentAction } = await import("@/app/documents/actions");
  await archiveDocumentAction(p.documentId, p.before);
});
