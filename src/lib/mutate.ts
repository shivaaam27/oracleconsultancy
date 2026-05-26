import { db, schema } from "@/db";
import { reportError } from "./sentry";

// 10 minutes
const UNDO_TTL_MS = 10 * 60 * 1000;

export type Actor = "web-ui" | "ai-command";

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
  // Short, URL-safe, unique enough for 10-minute tokens.
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
      await db.insert(schema.undoTokens).values({
        id,
        kind: undo.kind,
        payload: JSON.stringify(undo.payload),
        taskId: undo.taskId ?? input.taskId ?? null,
        createdBy: actor,
        createdAt: now,
        expiresAt: new Date(now.getTime() + UNDO_TTL_MS),
        consumedAt: null,
      });
      undoToken = id;
    }

    return { ok: true, result, undoToken };
  } catch (err) {
    await reportError(err, { kind: input.kind, actor, taskId: input.taskId });
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return { ok: false, error: message };
  }
}
