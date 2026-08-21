"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CloudOff, PenLine, Send, Loader2 } from "lucide-react";
import { countDrafts, countEdits, syncOffline } from "@/lib/offline-notes";

/* ------------------------------------------------------------------ *
 * The shelf's link to offline writing, and the nudge when something is waiting.
 *
 * It does two jobs, and the second matters more: whenever the shelf is opened
 * with a connection, anything written offline is SENT. Without that, a note
 * could sit on the device indefinitely simply because its author never happened
 * to reopen the writing page.
 *
 * Shows nothing at all when there is nothing to say — a permanent banner about a
 * feature you are not using is clutter.
 * ------------------------------------------------------------------ */

export function OfflineNotesBanner() {
  const [waiting, setWaiting] = useState(0);
  const [sending, setSending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [justSent, setJustSent] = useState(0);
  const [keptBoth, setKeptBoth] = useState(0);

  useEffect(() => {
    let alive = true;

    const flush = async () => {
      const before = (await countDrafts()) + (await countEdits());
      if (alive) setWaiting(before);
      if (!navigator.onLine) return;

      // ⚠️ Runs even with nothing waiting, because it does a second job: it takes
      // a fresh copy of the collection onto this device, so the notes can be read
      // with no connection. The shelf is the page you are most likely to be on
      // when you have a connection, which makes it the right place for it.
      if (before > 0) setSending(true);
      const res = await syncOffline();
      if (!alive) return;
      setSending(false);
      setWaiting((await countDrafts()) + (await countEdits()));
      const sent = res.notesSent + res.editsSent;
      if (sent > 0) {
        setJustSent(sent);
        setKeptBoth(res.keptBoth);
        // The shelf was rendered before these arrived, so it does not know about
        // them. Reload rather than show a list that is quietly wrong.
        setTimeout(() => window.location.reload(), res.keptBoth > 0 ? 4000 : 1200);
      }
    };

    setOffline(!navigator.onLine);
    void flush();

    const on = () => {
      setOffline(false);
      void flush();
    };
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      alive = false;
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (justSent > 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3.5 py-2 text-sm text-success">
        <Send size={14} /> {justSent} piece{justSent > 1 ? "s" : ""} of writing from offline {justSent > 1 ? "have" : "has"} arrived.
        {keptBoth > 0 && (
          /* Said out loud, never quietly: the note had moved on at the server, so
             BOTH versions were kept rather than one silently winning. */
          <span className="text-warn">
            {keptBoth} had changed here since, so both versions were kept — look for “(also edited offline)”.
          </span>
        )}
      </div>
    );
  }

  if (waiting > 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2 text-sm text-warn">
        {sending ? <Loader2 size={14} className="animate-spin" /> : <CloudOff size={14} />}
        {sending
          ? `Sending ${waiting}…`
          : `${waiting} piece${waiting > 1 ? "s" : ""} of writing from offline, still on this device.`}
        <Link href="/notes/offline" className="underline underline-offset-2">
          Open
        </Link>
      </div>
    );
  }

  if (offline) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-subtle px-3.5 py-2 text-sm text-fg-muted">
        <CloudOff size={14} /> No connection.
        <Link href="/notes/offline" className="inline-flex items-center gap-1 text-accent underline underline-offset-2">
          <PenLine size={13} /> You can still write
        </Link>
      </div>
    );
  }

  return null;
}
