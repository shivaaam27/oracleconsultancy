import "server-only";

/* ------------------------------------------------------------------ *
 * Server → client realtime, the safe way: we POST a tiny event to the
 * Supabase Realtime *broadcast* REST endpoint. Clients subscribe to the
 * channel `thread:<id>` with the anon key and react instantly.
 *
 * Broadcast (not postgres_changes) means NO row-level-security rework —
 * the server is the only publisher and only ships a minimal stamp
 * ({ type, id, at }), never message contents. The client re-fetches
 * through the gated server action, so nothing sensitive crosses the wire.
 *
 * If realtime isn't configured (no URL/key) this is a silent no-op and
 * the polling fallback in chat-realtime.tsx still delivers messages.
 * ------------------------------------------------------------------ */

export type ThreadEvent = { type: "message" | "edit" | "delete" | "read"; id: number; at: string };

export async function broadcastToThread(threadId: number, event: ThreadEvent): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic: `thread:${threadId}`, event: "thread", payload: event }],
      }),
    });
  } catch {
    /* best effort — polling fallback covers delivery */
  }
}
