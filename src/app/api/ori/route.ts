// /api/ori — the ORI agent loop (Phase 0 of the "complete brain").
// Two calls:
//   POST { messages }                    → PLAN: returns {mode:"ask"|"answer"|"confirm", reply, plan?}
//   POST { confirmPlan: [ {tool,args} ] } → EXECUTE the confirmed plan, returns {mode:"done", results}
// Admin-only via the edge gate (src/proxy.ts). The planner never executes; nothing
// runs until the owner confirms, so clarify→confirm→execute stays honest + undoable.

import { NextRequest, NextResponse } from "next/server";
import { planTurn, type ChatMsg, type PlanStep } from "@/lib/ori/agent";
import { TOOL_BY_NAME } from "@/lib/ori/tools";
import { sb } from "@/db/supabase";
import { recordEvent } from "@/lib/system-events";

/** Short, human-readable digest of a step's args for the ORI action log. */
function summariseArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v == null || v === "") continue;
    let val = typeof v === "string" ? v : JSON.stringify(v);
    if (val.length > 60) val = val.slice(0, 57) + "…";
    parts.push(`${k}=${val}`);
    if (parts.length >= 4) break;
  }
  return parts.join(" ");
}

/** One system_events row per executed step ("ori.action"). Never throws. */
async function logOriAction(entry: {
  tool: string;
  ok: boolean;
  args: Record<string, unknown>;
  message?: string;
  undoToken?: string;
}): Promise<void> {
  try {
    await recordEvent("ori.action", entry.ok ? "ok" : "error", {
      tool: entry.tool,
      summary: summariseArgs(entry.args),
      message: entry.message,
      undoToken: entry.undoToken,
    });
  } catch {
    // Logging must never break execution.
  }
}

export const maxDuration = 60;

const UNDO_TTL_MS = 10 * 60 * 1000;

/** Persist an undo token for an executed tool step (reuses the app undo framework
 *  + /api/undo consume path). Returns the token id, or undefined on failure. */
async function createUndoToken(spec: { kind: string; payload: unknown }): Promise<string | undefined> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const now = new Date();
  const { error } = await sb.from("undo_tokens").insert({
    id, kind: spec.kind, payload: JSON.stringify(spec.payload),
    created_by: "ai-command", created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + UNDO_TTL_MS).toISOString(), consumed_at: null,
  });
  return error ? undefined : id;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // ---- EXECUTE a confirmed plan ---------------------------------------
    const confirmPlan = Array.isArray(body?.confirmPlan) ? (body.confirmPlan as PlanStep[]) : null;
    if (confirmPlan) {
      const results: { tool: string; ok: boolean; message: string; redirect?: string; undoToken?: string }[] = [];
      // Chaining: a task created earlier in THIS plan isn't known at plan time, so
      // later steps reference it as "$new" (or an invented "TASK-..." placeholder —
      // real codes never start with TASK). Substitute the real code here.
      let lastTaskCode: string | null = null;
      const isPlaceholder = (v: unknown) => typeof v === "string" && (/^\$?new$/i.test(v.trim()) || /^task[-_]?\d+$/i.test(v.trim()));
      for (const step of confirmPlan.slice(0, 8)) {
        const tool = TOOL_BY_NAME.get(step.tool);
        if (!tool) { results.push({ tool: step.tool, ok: false, message: `Unknown tool "${step.tool}".` }); continue; }
        const args = { ...(step.args ?? {}) };
        if (lastTaskCode && "taskCode" in tool.params && (isPlaceholder(args.taskCode) || !args.taskCode)) args.taskCode = lastTaskCode;
        try {
          const r = await tool.run(args);
          // Capture a newly-created task's code so later steps can attach to it.
          const m = r.ok && r.redirect ? /\/task\/([^/?#]+)/.exec(r.redirect) : null;
          if (m && step.tool === "create_task") lastTaskCode = m[1];
          // Mint an undo token for a reversible write so the owner can one-tap undo.
          const undoToken = r.ok && r.undo ? await createUndoToken(r.undo) : undefined;
          await logOriAction({ tool: step.tool, ok: r.ok, args, message: r.message, undoToken });
          results.push({ tool: step.tool, ok: r.ok, message: r.message, redirect: r.redirect, undoToken });
          // A step that fails (e.g. a company didn't resolve) stops the chain so a
          // half-built workflow doesn't run on wrong assumptions.
          if (!r.ok) break;
        } catch (e) {
          const message = e instanceof Error ? e.message : "Something went wrong running that step.";
          await logOriAction({ tool: step.tool, ok: false, args, message });
          results.push({ tool: step.tool, ok: false, message });
          break;
        }
      }
      const okAll = results.every((r) => r.ok);
      return NextResponse.json({ mode: "done", ok: okAll, results });
    }

    // ---- PLAN a turn ----------------------------------------------------
    const messages: ChatMsg[] = Array.isArray(body?.messages)
      ? (body.messages as ChatMsg[])
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-12)
      : [];
    if (messages.length === 0) return NextResponse.json({ error: "messages required" }, { status: 400 });

    const turn = await planTurn(messages);
    return NextResponse.json(turn);
  } catch (e) {
    console.error("/api/ori error:", e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}
