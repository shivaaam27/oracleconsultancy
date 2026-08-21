"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, Check, Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import {
  countDrafts,
  deleteDraft,
  listDrafts,
  newClientKey,
  offlineStorageAvailable,
  saveDraft,
  syncDrafts,
  type NoteDraft,
} from "@/lib/offline-notes";

/* ------------------------------------------------------------------ *
 * Writing a note with no connection.
 *
 * ⚠️ THIS PAGE MUST NEVER NEED THE SERVER TO RENDER. It is the one page the
 * service worker keeps a copy of, so it can be opened when nothing else can be.
 * That is also why it holds NO data of its own: what is cached is an empty sheet
 * of paper, and everything you have written lives in this device's own store.
 *
 * ⚠️ PLAIN TEXT ON PURPOSE. The rich editor is a large amount of JavaScript and
 * a lot of moving parts; a page whose entire job is to work when things are
 * already going wrong should be as close to a sheet of paper as possible. What
 * you write here becomes an ordinary note the moment it syncs, and you can
 * format it then.
 * ------------------------------------------------------------------ */

/** How long after you stop typing before the draft is written to the device. */
const SAVE_MS = 600;

export function OfflineNoteWriter() {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<NoteDraft[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [supported, setSupported] = useState(true);

  const keyRef = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setDrafts(await listDrafts());
    } catch {
      /* the list is a convenience; never let it break the writing */
    }
  }, []);

  const runSync = useCallback(
    async (quiet = false) => {
      if (syncing) return;
      setSyncing(true);
      if (!quiet) setStatus("Sending…");
      const res = await syncDrafts();
      setSyncing(false);
      await refresh();
      if (res.error) setStatus(res.error);
      else if (res.sent > 0) setStatus(`${res.sent} note${res.sent > 1 ? "s" : ""} sent to COS.`);
      else if (!quiet) setStatus(res.kept > 0 ? "Nothing sent yet." : "Nothing waiting.");
    },
    [refresh, syncing]
  );

  useEffect(() => {
    if (!offlineStorageAvailable()) {
      setSupported(false);
      return;
    }
    setOnline(navigator.onLine);
    void refresh();
    // Anything waiting from a previous session goes as soon as we can.
    if (navigator.onLine) void runSync(true);

    const on = () => {
      setOnline(true);
      void runSync(true);
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Write what is on screen to the device. Debounced, and never lossy: the
   *  draft is stored under one key for the whole time you are writing it. */
  const persist = useCallback(async (value: string) => {
    if (!value.trim()) return;
    if (!keyRef.current) keyRef.current = newClientKey();
    try {
      await saveDraft({
        clientKey: keyRef.current,
        title: "",
        text: value,
        createdAt: new Date().toISOString(),
      });
      savedRef.current = true;
    } catch {
      setStatus("This device would not store the note. Copy it somewhere before leaving the page.");
    }
  }, []);

  function onChange(value: string) {
    setText(value);
    savedRef.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(value), SAVE_MS);
  }

  /** Finish this note and start a fresh one. */
  async function keepAndClear() {
    if (timer.current) clearTimeout(timer.current);
    await persist(text);
    keyRef.current = "";
    setText("");
    await refresh();
    setStatus("Saved on this device.");
    if (navigator.onLine) void runSync(true);
  }

  // Last line of defence: if the page is closing and the debounce has not fired,
  // write it now. Not awaited — the browser will not wait — but IndexedDB puts
  // are quick and this is better than losing the last few seconds of typing.
  useEffect(() => {
    const bye = () => {
      if (!savedRef.current && text.trim()) void persist(text);
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [text, persist]);

  if (!supported) {
    return (
      <p className="text-sm text-danger">
        This browser cannot store anything on the device, so notes written here could not be kept. Try
        Edge or Chrome.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs">
        {online ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <Check size={13} /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-warn">
            <CloudOff size={13} /> No connection — your writing is kept on this device
          </span>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write anything. The first line becomes the title."
        rows={12}
        autoFocus
        className="w-full resize-y rounded-lg border border-border bg-bg px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-accent"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={keepAndClear} disabled={!text.trim()}>
          Keep this note
        </Button>
        {drafts.length > 0 && (
          <Button variant="ghost" onClick={() => void runSync(false)} disabled={syncing || !online}>
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send {drafts.length} to COS
          </Button>
        )}
        {status && <span className="text-xs text-fg-muted">{status}</span>}
      </div>

      {drafts.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-3.5 py-2 text-xs font-medium text-fg-muted">
            Waiting on this device ({drafts.length})
          </div>
          <ul className="divide-y divide-border">
            {drafts.map((d) => (
              <li key={d.clientKey} className="flex items-start gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {d.text.split("\n").find((l) => l.trim())?.slice(0, 90) || "Empty note"}
                  </div>
                  <div className="text-[11px] text-fg-subtle">
                    {new Date(d.createdAt).toLocaleString("en-GB")}
                  </div>
                </div>
                <button
                  type="button"
                  title="Discard this one"
                  onClick={async () => {
                    // Deliberately explicit: this is the only way writing is
                    // ever thrown away here, and it takes a click to do it.
                    if (!confirm("Discard this note? It has not reached COS yet.")) return;
                    await deleteDraft(d.clientKey);
                    await refresh();
                  }}
                  className="mt-0.5 shrink-0 text-fg-subtle hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-fg-subtle">
        Notes written here are held on this device until COS can be reached, then they appear on your
        shelf. Nothing is deleted from here until the server confirms it has it.
      </p>
    </div>
  );
}

/** The count, for showing a "waiting to send" badge elsewhere. */
export function useWaitingCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const read = async () => {
      const c = await countDrafts();
      if (alive) setN(c);
    };
    void read();
    const t = setInterval(read, 15_000);
    window.addEventListener("online", read);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("online", read);
    };
  }, []);
  return n;
}
