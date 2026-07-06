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
      for (const step of confirmPlan.slice(0, 8)) {
        const tool = TOOL_BY_NAME.get(step.tool);
        if (!tool) { results.push({ tool: step.tool, ok: false, message: `Unknown tool "${step.tool}".` }); continue; }
        try {
          const r = await tool.run(step.args ?? {});
          // Mint an undo token for a reversible write so the owner can one-tap undo.
          const undoToken = r.ok && r.undo ? await createUndoToken(r.undo) : undefined;
          results.push({ tool: step.tool, ok: r.ok, message: r.message, redirect: r.redirect, undoToken });
          // A step that fails (e.g. a company didn't resolve) stops the chain so a
          // half-built workflow doesn't run on wrong assumptions.
          if (!r.ok) break;
        } catch (e) {
          results.push({ tool: step.tool, ok: false, message: e instanceof Error ? e.message : "Something went wrong running that step." });
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
