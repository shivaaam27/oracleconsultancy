"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage } from "@/lib/chat";

/* Realtime layer for a chat thread.
 *
 * Preferred path: subscribe to the Supabase Realtime channel `thread:<id>`.
 *   - The SERVER publishes "thread" broadcast events (message/edit/delete/read)
 *     via REST → we refetch through the gated action.
 *   - PEERS publish "typing" broadcast events directly (client→client) → we
 *     show a transient "… is typing" indicator.
 * Needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *
 * Fallback: if those aren't set or the socket fails, poll the gated
 * /api/portal/chat/sync stamp so messages still arrive (typing is socket-only).
 * Only an opaque stamp / a display name ever crosses the wire. */

type ChannelLike = {
  send: (args: { type: "broadcast"; event: string; payload: unknown }) => void;
};

export function useThreadChannel(
  threadId: number | null,
  opts: { onChange: (type: string, message?: ChatMessage) => void; meName: string; seconds?: number }
) {
  const { meName, seconds = 5 } = opts;
  const router = useRouter();
  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;
  const fire = useCallback((type: string, message?: ChatMessage) => onChangeRef.current(type, message), []);

  const [typing, setTyping] = useState<string[]>([]);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const channelRef = useRef<ChannelLike | null>(null);
  const lastSentTyping = useRef(0);

  const noteTyping = useCallback((name: string) => {
    if (!name) return;
    setTyping((cur) => (cur.includes(name) ? cur : [...cur, name]));
    const timers = typingTimers.current;
    clearTimeout(timers.get(name));
    timers.set(
      name,
      setTimeout(() => {
        setTyping((cur) => cur.filter((n) => n !== name));
        timers.delete(name);
      }, 3500)
    );
  }, []);

  useEffect(() => {
    if (threadId == null) return;
    let stopped = false;
    let cleanupSocket: (() => void) | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    const stampRef = { current: null as string | null };
    setTyping([]);

    const startPolling = () => {
      if (pollId) return;
      const probe = async () => {
        if (stopped || document.visibilityState !== "visible") return;
        try {
          const res = await fetch(`/api/portal/chat/sync?threadId=${threadId}`, { cache: "no-store" });
          if (!res.ok) return;
          const { stamp } = (await res.json()) as { stamp: string };
          // Stamp is content-only, so any change means new content.
          if (stampRef.current !== null && stampRef.current !== stamp) fire("message");
          stampRef.current = stamp;
        } catch {
          /* offline blip */
        }
      };
      probe();
      pollId = setInterval(probe, seconds * 1000);
    };

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (url && anon) {
      import("@supabase/supabase-js")
        .then(({ createClient }) => {
          if (stopped) return;
          const client = createClient(url, anon, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const channel = client.channel(`thread:${threadId}`, {
            config: { broadcast: { self: false } },
          });
          channel
            .on("broadcast", { event: "thread" }, (msg: { payload?: { type?: string; message?: ChatMessage } }) =>
              fire(msg.payload?.type ?? "message", msg.payload?.message)
            )
            .on("broadcast", { event: "typing" }, (msg: { payload?: { name?: string } }) =>
              noteTyping(msg.payload?.name ?? "")
            )
            .subscribe((status: string) => {
              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") startPolling();
            });
          channelRef.current = channel as unknown as ChannelLike;
          cleanupSocket = () => {
            channelRef.current = null;
            client.removeChannel(channel);
          };
        })
        .catch(() => startPolling());
    } else {
      startPolling();
    }

    return () => {
      stopped = true;
      if (pollId) clearInterval(pollId);
      if (cleanupSocket) cleanupSocket();
      typingTimers.current.forEach(clearTimeout);
      typingTimers.current.clear();
      channelRef.current = null;
    };
  }, [threadId, seconds, fire, noteTyping, router]);

  // Throttled outbound typing ping (max ~1/2s).
  const sendTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastSentTyping.current < 2000) return;
    lastSentTyping.current = now;
    try {
      ch.send({ type: "broadcast", event: "typing", payload: { name: meName } });
    } catch {
      /* best effort */
    }
  }, [meName]);

  // Tell peers something changed. For a new message we ALSO ship the message
  // itself so peers can append one bubble instead of refetching the whole thread
  // (edits/deletes/reads carry no payload → peers refetch). self:false means we
  // never receive our own — so no echo/refetch loop on the sender.
  const notify = useCallback((type: "message" | "read", message?: ChatMessage) => {
    const ch = channelRef.current;
    if (!ch) return;
    try {
      ch.send({ type: "broadcast", event: "thread", payload: { type, message } });
    } catch {
      /* best effort — polling fallback covers delivery */
    }
  }, []);

  return { typing, sendTyping, notify };
}
