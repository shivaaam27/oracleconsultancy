import { sb } from "@/db/supabase";
import { reportError } from "./sentry";

export type UndoResult = { ok: boolean; message: string };

type Handler = (payload: unknown) => Promise<void>;

const handlers: Record<string, Handler> = {};

export function registerUndoHandler(kind: string, fn: Handler) {
  handlers[kind] = fn;
}

export async function consumeUndo(tokenId: string): Promise<UndoResult> {
  const { data: token, error: e1 } = await sb
    .from("undo_tokens")
    .select("id,kind,payload,expires_at,consumed_at")
    .eq("id", tokenId)
    .maybeSingle();
  if (e1) {
    await reportError(e1, { tokenId });
    return { ok: false, message: "Couldn't load undo token." };
  }
  if (!token) return { ok: false, message: "Undo token not found." };
  if (token.consumed_at) return { ok: false, message: "Already undone." };
  if (new Date(token.expires_at as string).getTime() < Date.now()) {
    return { ok: false, message: "Undo expired." };
  }

  const handler = handlers[token.kind as string];
  if (!handler) {
    await reportError(new Error("No undo handler registered"), { kind: token.kind });
    return { ok: false, message: "Can't undo this kind of change." };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(token.payload as string);
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

  await sb
    .from("undo_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", tokenId)
    .is("consumed_at", null);

  return { ok: true, message: "Undone." };
}
