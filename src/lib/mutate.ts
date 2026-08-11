import { sb } from "@/db/supabase";
import { reportError } from "./sentry";

// 10 minutes
const UNDO_TTL_MS = 10 * 60 * 1000;

/** Who made the change. `mcp:<Name>` is an assistant working through /api/mcp —
 *  the undo tools there find a caller's own tokens by matching this exact stamp,
 *  so it must stay identical to `callerStamp()` in lib/mcp/auth.ts. */
export type Actor = "web-ui" | "ai-command" | `mcp:${string}`;

export type UndoSpec = {
  kind: string;
  payload: unknown;
  taskId?: number;
};

export type MutateInput<T> = {
  kind: string;
  actor?: Actor;
  taskId?: number;
  run: () => Promise<{ result: T; undo?: UndoSpec }>;
};

export type MutateResult<T> =
  | { ok: true; result: T; undoToken?: string }
  | { ok: false; error: string };

function newId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

export async function mutate<T>(input: MutateInput<T>): Promise<MutateResult<T>> {
  const actor: Actor = input.actor ?? "web-ui";
  try {
    const { result, undo } = await input.run();

    let undoToken: string | undefined;
    if (undo) {
      const id = newId();
      const now = new Date();
      const { error } = await sb.from("undo_tokens").insert({
        id,
        kind: undo.kind,
        payload: JSON.stringify(undo.payload),
        task_id: undo.taskId ?? input.taskId ?? null,
        created_by: actor,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + UNDO_TTL_MS).toISOString(),
        consumed_at: null,
      });
      if (!error) undoToken = id;
    }

    return { ok: true, result, undoToken };
  } catch (err) {
    await reportError(err, { kind: input.kind, actor, taskId: input.taskId });
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return { ok: false, error: message };
  }
}
