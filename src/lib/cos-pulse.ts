import "server-only";

/* Server → cockpit realtime, the same safe way chat does it (see chat-broadcast.ts):
 * POST a tiny event to the Supabase Realtime *broadcast* REST endpoint on the
 * `cos-pulse` channel. Open Command Centres subscribe with the anon key and refresh
 * instantly. Only an opaque {reason, at} stamp crosses the wire — never data.
 *
 * Silent no-op when realtime isn't configured (no URL/service key); the cockpit's
 * polling + on-focus refresh (cockpit-live.tsx) still keeps everything current. */
export async function broadcastPulse(reason = "change"): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        messages: [{ topic: "cos-pulse", event: "pulse", payload: { reason, at: new Date().toISOString() } }],
      }),
    });
  } catch {
    /* best effort — polling fallback covers delivery */
  }
}
