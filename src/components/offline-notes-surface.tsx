"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudOff, Loader2, Plus, RefreshCw, Send, Wifi } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { OfflineNoteShelf } from "@/components/offline-note-shelf";
import { OfflineNoteView } from "@/components/offline-note-view";
import { OfflineNoteWriter } from "@/components/offline-note-writer";
import {
  countDrafts,
  countEdits,
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
 * tells you the connection is gone. So this is the shelf and the note page, the
 * real ones, fed from the device's own copy instead of from the server, with one
 * bar across the top saying what is going on and what is waiting to be sent.
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

  const open = view.name === "note" ? (notes ?? []).find((n) => n.id === view.id) ?? null : null;
  const count = (notes ?? []).filter((n) => !n.archived).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notes"
        sub={
          notes === null
            ? "Looking on this device…"
            : `${count} note${count === 1 ? "" : "s"} on this device${
                cachedAt ? ` · copied ${new Date(cachedAt).toLocaleString("en-GB")}` : ""
              }`
        }
      />

      {/* One bar, always. It says which of the two states you are in, because
          "why can I not press that" is the question this page has to answer
          before any other. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border px-3.5 py-2 text-[12.5px]",
          connected ? "border-border bg-bg-subtle text-fg-muted" : "border-warn/30 bg-warn/10 text-warn",
        )}
      >
        {connected ? <Wifi size={14} /> : <CloudOff size={14} />}
        <span>
          {connected
            ? "Connected. This is the copy kept on this device, so it works when the connection does not."
            : online
              ? "COS cannot be reached. You are reading the copy on this device, and you can still write."
              : "No connection. You are reading the copy on this device, and you can still write."}
        </span>
        {waiting > 0 && (
          <span className="font-medium">
            {waiting} thing{waiting > 1 ? "s" : ""} waiting to be sent.
          </span>
        )}
        <span className="grow" />
        {/* ⚠️ Shown whenever the browser thinks there is a network, NOT only when
            COS answered. Hiding them the moment a request failed would leave no
            way to try again — and "cannot reach COS" is usually the state you
            most want a Retry for. Pressing them says plainly what happened. */}
        {online && (
          <>
            {waiting > 0 && (
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-60"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send
              </button>
            )}
            <button
              type="button"
              title="Take a fresh copy"
              onClick={() => void (async () => { setBusy(true); const r = await refreshNoteCache(); setReachable(r.reachable); await load(); setBusy(false); setSaid(r.ok ? "Fresh copy taken." : "COS could not be reached."); })()}
              disabled={busy}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-elev px-2 text-[12px] font-medium text-fg-muted hover:text-fg disabled:opacity-60"
            >
              <RefreshCw size={12} />
            </button>
          </>
        )}
        {said && <span className="w-full text-[11.5px] opacity-80">{said}</span>}
      </div>

      {view.name === "new" ? (
        <div className="rounded-lg border border-border bg-bg-elev p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold">A new note</h2>
            <button
              type="button"
              onClick={() => { setView({ name: "shelf" }); void load(); }}
              className="text-[12px] text-fg-muted hover:text-fg"
            >
              Back to all notes
            </button>
          </div>
          <OfflineNoteWriter />
        </div>
      ) : open ? (
        <OfflineNoteView
          note={open}
          pending={pending.get(open.id) ?? []}
          online={connected}
          onBack={() => setView({ name: "shelf" })}
          onChanged={load}
        />
      ) : notes === null ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 size={14} className="animate-spin" /> Looking on this device…
        </p>
      ) : notes.length === 0 ? (
        <EmptyDevice online={connected} busy={busy} onCopy={() => void (async () => { setBusy(true); const r = await refreshNoteCache(); setReachable(r.reachable); await load(); setBusy(false); })()} onNew={() => setView({ name: "new" })} />
      ) : (
        <>
          {view.name === "note" && !open && (
            <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-[12px] text-fg-muted">
              That note is not on this device. Open it once with a connection and it will be.
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setView({ name: "new" })}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg hover:opacity-90"
            >
              <Plus size={13} /> New note
            </button>
          </div>
          <OfflineNoteShelf notes={notes} onOpen={(id) => setView({ name: "note", id })} />
        </>
      )}
    </div>
  );
}

function EmptyDevice({
  online,
  busy,
  onCopy,
  onNew,
}: {
  online: boolean;
  busy: boolean;
  onCopy: () => void;
  onNew: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev px-4 py-5 text-sm">
      <p className="font-medium text-fg">No notes have been copied to this device yet.</p>
      <p className="mt-1.5 text-[12.5px] text-fg-subtle">
        Open this page once while you have a connection and the whole collection is kept here, so you can
        read it anywhere. You can write a new one either way.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {online && (
          <button
            type="button"
            onClick={onCopy}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium text-fg-muted hover:text-fg disabled:opacity-60"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Copy them now
          </button>
        )}
        <button
          type="button"
          onClick={onNew}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg hover:opacity-90"
        >
          <Plus size={13} /> New note
        </button>
      </div>
    </div>
  );
}
