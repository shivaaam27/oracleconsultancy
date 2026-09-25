"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudOff, Loader2, RefreshCw, Send, Wifi } from "lucide-react";
import { StudioScope, stBtn } from "@/components/studio/kit";
import { cn } from "@/lib/cn";
import { OfflineNoteShelf } from "@/components/offline-note-shelf";
import { OfflineNoteView } from "@/components/offline-note-view";
import { OfflineNoteWriter } from "@/components/offline-note-writer";
import {
  countDrafts,
  listCachedNotes,
  listEdits,
  notesCachedAt,
  refreshNoteCache,
  syncOffline,
  type CachedNote,
  type NoteEdit,
} from "@/lib/offline-notes";

/* ------------------------------------------------------------------ *
 * Notes, with no connection.
 *
 * ⚠️ THE POINT IS THAT THIS LOOKS LIKE COS. The owner's instruction, plainly:
 * offline should not be a different product — everything looks the same, and it
 * tells you the connection is gone. So this is the Studio shelf and the Studio
 * note page (25 Sept 2026 — they were the old Desk ones until then), fed from the
 * device's own copy instead of from the server, with one bar saying what is
 * going on and what is waiting to be sent.
 *
 * ⚠️ IT STILL LOADS NO SERVER DATA. This is the only page of the app the service
 * worker keeps, so what is cached must be an empty sheet of paper — every note on
 * this screen comes out of IndexedDB after it mounts, never out of the HTML.
 *
 * ⚠️ It also runs when you ARE connected, and that is deliberate: it is how the
 * device takes its copy, and it is the only way to see what is still waiting to
 * be sent.
 * ------------------------------------------------------------------ */

type View = { name: "shelf" } | { name: "note"; id: number } | { name: "new" };

export function OfflineNotesSurface() {
  const [notes, setNotes] = useState<CachedNote[] | null>(null);
  const [edits, setEdits] = useState<NoteEdit[]>([]);
  const [drafts, setDrafts] = useState(0);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  /* ⚠️ TWO DIFFERENT QUESTIONS. `online` is what the browser claims; `reachable`
     is whether COS actually answered when we last asked. They disagree more often
     than you would think — a hotel portal, a dropped VPN, a bar of signal
     carrying nothing, or COS itself being down all leave `navigator.onLine`
     saying yes. Believing it printed "Connected" across the top of a page that
     could not reach anything, which is worse than saying nothing. */
  const [online, setOnline] = useState(true);
  const [reachable, setReachable] = useState(true);
  const [view, setView] = useState<View>({ name: "shelf" });
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [rows, queued, waiting, when] = await Promise.all([
      listCachedNotes(),
      listEdits(),
      countDrafts(),
      notesCachedAt(),
    ]);
    setNotes(rows);
    setEdits(queued);
    setDrafts(waiting);
    setCachedAt(when);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    void load();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [load]);

  // A fresh copy whenever there is a connection: a copy is only worth having if
  // it is close to current.
  useEffect(() => {
    if (!online) return;
    let alive = true;
    void (async () => {
      const res = await refreshNoteCache();
      if (!alive) return;
      setReachable(res.reachable);
      await load();
    })();
    return () => {
      alive = false;
    };
  }, [online, load]);

  /* The service worker sends `/notes/123` here when the network is gone, so the
     note that was asked for is the note that opens. Without this you would land
     on the shelf and have to find it again — which is not "the same experience". */
  useEffect(() => {
    const want = Number(new URLSearchParams(window.location.search).get("note"));
    if (Number.isInteger(want) && want > 0) setView({ name: "note", id: want });
  }, []);

  const pending = useMemo(() => {
    const by = new Map<number, NoteEdit[]>();
    for (const e of edits) by.set(e.noteId, [...(by.get(e.noteId) ?? []), e]);
    return by;
  }, [edits]);

  const waiting = edits.length + drafts;
  /* Connected means connected TO COS, not to a network. */
  const connected = online && reachable;

  async function send() {
    setBusy(true);
    setSaid("Sending…");
    const res = await syncOffline();
    setReachable(res.reachable);
    await load();
    setBusy(false);
    const sent = res.notesSent + res.editsSent;
    if (res.error) setSaid(res.error);
    else if (res.keptBoth > 0)
      setSaid(
        `${sent} sent. ${res.keptBoth} had changed in COS since, so both versions were kept — look for “(also edited offline)”.`,
      );
    else if (sent > 0) setSaid(`${sent} sent to COS.`);
    else setSaid("Nothing to send.");
  }

  async function takeCopy(report: boolean) {
    setBusy(true);
    const r = await refreshNoteCache();
    setReachable(r.reachable);
    await load();
    setBusy(false);
    if (report) setSaid(r.ok ? "Fresh copy taken." : "COS could not be reached.");
  }

  const open = view.name === "note" ? (notes ?? []).find((n) => n.id === view.id) ?? null : null;
  const count = (notes ?? []).filter((n) => !n.archived).length;
  const toShelf = () => { setView({ name: "shelf" }); void load(); };

  /* One bar, always — on the shelf, in a note and in a new one. It says which of
     the two states you are in, because "why can I not press that" is the
     question this page has to answer before any other. */
  const bar = (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-[14px] px-4 py-2.5 text-[13px] sm:items-center",
        connected ? "bg-[var(--st-surface)] text-[var(--st-ink)]" : "bg-[var(--st-warn-wash)] text-[var(--st-soon-text)]",
      )}
    >
      {connected ? <Wifi size={15} className="mt-0.5 shrink-0 text-[var(--st-ok-text)] sm:mt-0" /> : <CloudOff size={15} className="mt-0.5 shrink-0 sm:mt-0" />}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="min-w-0">
          {connected
            ? "Connected. This is the copy kept on this device, so it works when the connection does not."
            : online
              ? "COS cannot be reached. You are reading the copy on this device, and you can still write."
              : "No connection. You are reading the copy on this device, and you can still write."}
        </span>
        {waiting > 0 && (
          <span className="inline-flex h-6 items-center rounded-[7px] bg-[var(--st-page)] px-2 text-xs font-medium text-[var(--st-ink)]">
            {waiting} waiting to be sent
          </span>
        )}
        {said && <span className="w-full text-xs opacity-80">{said}</span>}
      </div>
      {/* ⚠️ Shown whenever the browser thinks there is a network, NOT only when
          COS answered. Hiding them the moment a request failed would leave no
          way to try again — and "cannot reach COS" is usually the state you
          most want a Retry for. Pressing them says plainly what happened. */}
      {online && (
        <span className="flex shrink-0 items-center gap-1.5">
          {waiting > 0 && (
            <button type="button" onClick={() => void send()} disabled={busy} className={cn(stBtn.dark, "h-8 px-3 text-xs disabled:opacity-60")}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
            </button>
          )}
          <button
            type="button"
            title="Take a fresh copy"
            aria-label="Take a fresh copy"
            onClick={() => void takeCopy(true)}
            disabled={busy}
            className={cn(stBtn.ghost, "h-8 w-8 justify-center px-0 text-[var(--st-ink)] disabled:opacity-60")}
          >
            <RefreshCw size={13} className={cn(busy && "animate-spin")} />
          </button>
        </span>
      )}
    </div>
  );

  return (
    <StudioScope className="flex flex-col gap-4">
      {view.name === "new" ? (
        <>
          {bar}
          <OfflineNoteWriter onBack={toShelf} />
        </>
      ) : open ? (
        <>
          {bar}
          <OfflineNoteView
            note={open}
            pending={pending.get(open.id) ?? []}
            online={connected}
            onBack={() => setView({ name: "shelf" })}
            onChanged={load}
          />
        </>
      ) : (
        <OfflineNoteShelf
          notes={notes}
          pendingIds={pending}
          sub={
            notes === null
              ? "Looking on this device…"
              : `${count} note${count === 1 ? "" : "s"} on this device${
                  cachedAt ? ` · copied ${new Date(cachedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""
                }`
          }
          bar={bar}
          missing={view.name === "note" && notes !== null}
          connected={connected}
          busy={busy}
          onCopy={() => void takeCopy(false)}
          onOpen={(id) => setView({ name: "note", id })}
          onNew={() => setView({ name: "new" })}
        />
      )}
    </StudioScope>
  );
}
