import { db, schema } from "@/db";
import { and, eq, isNull } from "drizzle-orm";
import { reportError } from "./sentry";

export type UndoResult = { ok: boolean; message: string };

type Handler = (payload: unknown) => Promise<void>;

const handlers: Record<string, Handler> = {};

export function registerUndoHandler(kind: string, fn: Handler) {
  handlers[kind] = fn;
}

export async function consumeUndo(tokenId: string): Promise<UndoResult> {
  const rows = await db
    .select()
    .from(schema.undoTokens)
    .where(eq(schema.undoTokens.id, tokenId))
    .limit(1);
  const token = rows[0];
  if (!token) return { ok: false, message: "Undo token not found." };
  if (token.consumedAt) return { ok: false, message: "Already undone." };
  if (token.expiresAt.getTime() < Date.now()) {
    return { ok: false, message: "Undo expired." };
  }

  const handler = handlers[token.kind];
  if (!handler) {
    await reportError(new Error("No undo handler registered"), { kind: token.kind });
    return { ok: false, message: "Can't undo this kind of change." };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(token.payload);
  } catch (err) {
    await reportError(err, { tokenId });
    return { ok: false, message: "Couldn't read undo data." };
  }

  try {
    await handler(payload);
  } catch (err) {
    await reportError(err, { kind: token.kind, tokenId });
    return { ok: false, message: "Undo failed." };
  }

  await db
    .update(schema.undoTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(schema.undoTokens.id, tokenId), isNull(schema.undoTokens.consumedAt)));

  return { ok: true, message: "Undone." };
}
