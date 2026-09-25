"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
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

export function OfflineNoteWriter({ onBack }: { onBack?: () => void } = {}) {
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
      else if (res.sent > 0) setStatus(`${res.sent} note${res.sent > 1 ? "s" : ""} sent to Oracle.`);
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

  /* The Studio note sheet: "All notes" first in the strip along the top, then
     the white paper. What you can still do sits in the strip; what is waiting
     on this device is a card under it. */
  const tool = "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-[24rem] flex-col overflow-hidden rounded-[20px] bg-[var(--st-surface)]">
        <div className="slim-scroll flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--st-line-soft)] px-2 py-1.5 sm:flex-wrap sm:overflow-x-visible sm:px-3 sm:py-2">
          {onBack && (
            <>
              <button type="button" onClick={onBack}
                className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg bg-[var(--st-page)] px-2.5 text-xs text-[var(--st-ink)] transition-colors hover:bg-[var(--st-seg)]">
                <ArrowLeft size={12} strokeWidth={2.2} /> All notes
              </button>
              <span className="mx-1 h-[18px] w-px shrink-0 bg-[var(--st-line)]" aria-hidden />
            </>
          )}
          <span className="shrink-0 px-1.5 text-xs font-medium text-[var(--st-ink)]">A new note</span>
          <span className="grow" />
          {status && <span className="shrink-0 px-1 text-xs text-[var(--st-muted)]">{status}</span>}
          {drafts.length > 0 && (
            <button type="button" onClick={() => void runSync(false)} disabled={syncing || !online}
              className={cn(tool, "text-[var(--st-ink)] hover:bg-[var(--st-page)] disabled:opacity-50")}>
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Send {drafts.length} to Oracle
            </button>
          )}
          <button type="button" onClick={keepAndClear} disabled={!text.trim() || !supported}
            className={cn(tool, "bg-[var(--st-ink)] font-medium text-[var(--st-page)] hover:opacity-90 disabled:opacity-50")}>
            Keep this note
          </button>
        </div>

        <div className="slim-scroll min-h-0 flex-1 px-6 py-7 sm:px-10 sm:py-9 lg:px-16 lg:pb-10 lg:pt-9">
          <div className="mx-auto w-full max-w-[68ch] lg:mx-0 lg:max-w-[72ch]">
            {supported ? (
              <textarea
                value={text}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Write anything. The first line becomes the title."
                rows={14}
                autoFocus
                /* `.bare-field`: part of the paper, not a box on it. */
                className="bare-field w-full resize-y bg-transparent text-[15px] leading-[1.6] text-[var(--st-ink)] outline-none placeholder:text-[var(--st-muted)] sm:text-[16px]"
              />
            ) : (
              <p className="m-0 rounded-[10px] bg-[var(--st-bad-wash)] px-3 py-2.5 text-[13px] text-[var(--st-late-text)]">
                This browser cannot store anything on the device, so notes written here could not be kept. Try
                Edge or Chrome.
              </p>
            )}
          </div>
        </div>
      </div>

      {drafts.length > 0 && (
        <section className="rounded-[20px] bg-[var(--st-surface)] px-5 py-4">
          <h2 className="m-0 text-[15px] font-semibold">Waiting on this device <span className="font-normal text-[var(--st-muted)]">{drafts.length}</span></h2>
          <ul className="m-0 mt-2 list-none divide-y divide-[var(--st-line-soft)] p-0">
            {drafts.map((d) => (
              <li key={d.clientKey} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px]">
                    {d.text.split("\n").find((l) => l.trim())?.slice(0, 90) || "Empty note"}
                  </div>
                  <div className="text-xs text-[var(--st-muted)]">
                    {new Date(d.createdAt).toLocaleString("en-GB")}
                  </div>
                </div>
                <button
                  type="button"
                  title="Discard this one"
                  aria-label="Discard this one"
                  onClick={async () => {
                    // Deliberately explicit: this is the only way writing is
                    // ever thrown away here, and it takes a click to do it.
                    if (!confirm("Discard this note? It has not reached Oracle yet.")) return;
                    await deleteDraft(d.clientKey);
                    await refresh();
                  }}
                  className="mt-0.5 shrink-0 text-[var(--st-muted)] hover:text-[var(--st-late-text)]"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="m-0 px-1 text-xs text-[var(--st-muted)]">
        Notes written here are held on this device until Oracle can be reached, then they appear on your
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
