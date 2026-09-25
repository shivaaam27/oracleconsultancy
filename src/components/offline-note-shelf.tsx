"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, CloudOff, FolderPlus, Loader2, Lock, Plus, RefreshCw, Search, Star } from "lucide-react";
import { StudioHeader, StudioCardRow, StudioCard, CardHead, stBtn, stFloatBar } from "@/components/studio/kit";
import { noteTitle, snippetOf } from "@/lib/notes-shared";
import type { CachedNote, NoteEdit } from "@/lib/offline-notes";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * The shelf, with no connection — the Studio shelf (studio-notes-shelf.tsx),
 * fed from this device's copy.
 *
 * ⚠️ IT IS THE SAME SHELF ON PURPOSE — same header and lanes, same two cards,
 * same rows, same search bar floating at the foot. The owner's instruction was
 * that offline should not be a different product: it should look like COS and
 * simply tell you the connection is gone. A second, plainer notes screen is a
 * second thing to learn at the worst possible moment.
 *
 * What differs under the bonnet:
 * - **Nothing here navigates.** Filters are URLs everywhere else in COS, and
 *   should stay that way — but following a link here means asking the server for
 *   a page it cannot answer. So the lanes, the folder menu and the rows are
 *   buttons that change state on this page.
 * - **What needs the server is shown and held back, with the reason** — Ask your
 *   notes, New folder, starting today's page, pinning. Removing them would make
 *   the page look like a lesser thing; greying them without a word would leave
 *   you wondering why.
 * - #tags and smart folders are not in the device's copy, so they are not
 *   offered here; searching the words still finds a #tag.
 * ------------------------------------------------------------------ */

type Lane = "all" | "pinned" | "unfiled" | "archived";

const NEEDS = "Needs a connection";

const ago = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const eatDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });

export function OfflineNoteShelf({
  notes,
  pendingIds,
  sub,
  bar,
  missing,
  connected,
  busy,
  onCopy,
  onOpen,
  onNew,
}: {
  /** null while the device is still being read. */
  notes: CachedNote[] | null;
  pendingIds: Map<number, NoteEdit[]>;
  sub: string;
  /** The connection bar — one bar, on every view. */
  bar: ReactNode;
  /** A note was asked for (the service worker's `?note=`) that is not on this device. */
  missing: boolean;
  connected: boolean;
  busy: boolean;
  onCopy: () => void;
  onOpen: (id: number) => void;
  onNew: () => void;
}) {
  const [lane, setLane] = useState<Lane>("all");
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const all = useMemo(() => notes ?? [], [notes]);
  const live = useMemo(() => all.filter((n) => !n.archived), [all]);

  const counts = useMemo(
    () => ({
      all: live.length,
      pinned: live.filter((n) => n.pinnedAt).length,
      unfiled: live.filter((n) => !n.folderName).length,
      archived: all.length - live.length,
    }),
    [live, all],
  );

  const folders = useMemo(() => {
    const by = new Map<string, number>();
    for (const n of live) if (n.folderName) by.set(n.folderName, (by.get(n.folderName) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [live]);

  const rows = useMemo(() => {
    const base =
      lane === "archived" ? all.filter((n) => n.archived)
      : lane === "pinned" ? live.filter((n) => n.pinnedAt)
      : lane === "unfiled" ? live.filter((n) => !n.folderName)
      : live;
    const inFolder = folder ? base.filter((n) => n.folderName === folder) : base;
    const term = q.trim().toLowerCase();
    const found = term
      ? inFolder.filter((n) => n.title.toLowerCase().includes(term) || n.bodyText.toLowerCase().includes(term))
      : inFolder;
    // The shelf's own order: pinned first, then freshest.
    return [...found].sort((a, b) => {
      if (!!a.pinnedAt !== !!b.pinnedAt) return a.pinnedAt ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [all, live, lane, folder, q]);

  /* Today's page, if it was started today and made it onto this device. A daily
     page is created on its own day, so its creation date is the day it is for. */
  const today = useMemo(() => {
    const d = eatDay(new Date());
    return live.find((n) => n.kind === "daily" && eatDay(new Date(n.createdAt)) === d) ?? null;
  }, [live]);

  const pick = (l: Lane, f: string | null = null) => { setLane(l); setFolder(f); };

  return (
    <div className="flex flex-col gap-5">
      <StudioHeader
        title="Notes"
        sub={sub}
        right={
          <>
            <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist">
              {([["all", "All", counts.all], ["pinned", "Pinned", counts.pinned], ["unfiled", "Unfiled", counts.unfiled], ["archived", "Archived", counts.archived]] as const).map(([k, l, n]) => {
                const on = lane === k && folder == null;
                return (
                  <button key={k} type="button" role="tab" aria-selected={on} onClick={() => pick(k)}
                    className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-xs transition-colors", on ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                    {l}<span className="text-[11px] font-normal text-[var(--st-muted)]">{n}</span>
                  </button>
                );
              })}
            </div>
            <span aria-disabled title={`New folder — ${NEEDS.toLowerCase()}`} className={cn(stBtn.ghost, "cursor-not-allowed text-[var(--st-muted)] hover:bg-[var(--st-surface)] max-sm:hidden")}>
              <FolderPlus size={14} />New folder
            </span>
            <button type="button" onClick={onNew} className={stBtn.dark}><Plus size={15} />New note</button>
          </>
        }
      />

      {bar}

      <StudioCardRow className="lg:h-[232px]">
        {/* Ask your notes — ORI reads them on the server. Shown, held back, and
            saying why, rather than missing from the page. */}
        <StudioCard texture="dots" className="min-h-[210px]">
          <CardHead label="Ask your notes" right={<span className="inline-flex items-center gap-1"><CloudOff size={12} />{NEEDS}</span>} />
          <div className="mt-auto flex flex-col gap-2.5 pt-3">
            <div aria-disabled className="flex h-11 cursor-not-allowed items-center gap-2 rounded-xl border border-[#2E3035] bg-[#1F2023] pl-3.5 pr-1.5 opacity-70">
              <Search size={15} className="shrink-0 text-[#8E9197]" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[#8E9197]">What did I decide about…?</span>
              <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] bg-[#F2F2F0]/40 px-3 text-xs font-semibold text-[#111214]"><Lock size={11} />Ask</span>
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-[var(--st-on-card-muted)]">
              ORI reads your notes in COS, so asking needs a connection. Searching the words below works on this device.
            </p>
          </div>
        </StudioCard>

        <StudioCard texture="rings" className="min-h-[210px]">
          <CardHead label="Today’s page" right={<span>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Dar_es_Salaam" })}</span>} />
          <div className="mt-auto flex flex-col gap-3 pt-3">
            {today ? (
              <>
                <div className="truncate text-[24px] font-medium tracking-[-0.02em]">{noteTitle(today)}</div>
                <div className="line-clamp-2 text-[13px] text-[var(--st-on-card-muted)]">{snippetOf(today.bodyText, today.title) || "Started — nothing written yet."}</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onOpen(today.id)} className={stBtn.onCard}>Open today’s page</button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[24px] font-medium tracking-[-0.02em] sm:text-[28px]">Not on this device</div>
                <div className="text-[13px] text-[var(--st-on-card-muted)]">
                  Starting today’s page needs a connection — it opens from your daily template in COS. A new note works either way.
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={onNew} className={stBtn.onCard}>Write a new note</button>
                </div>
              </>
            )}
          </div>
        </StudioCard>
      </StudioCardRow>

      {missing && (
        <p className="m-0 rounded-[14px] bg-[var(--st-surface)] px-4 py-2.5 text-[13px] text-[var(--st-muted)]">
          That note is not on this device. Open it once with a connection and it will be.
        </p>
      )}

      {folder && (
        <div className="flex items-center gap-2 px-1 text-[13px]">
          <span className="text-[var(--st-muted)]">Showing</span>
          <span className="font-medium">{folder}</span>
          <button type="button" onClick={() => setFolder(null)} className="text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]">Show all</button>
        </div>
      )}

      <div className="flex flex-col gap-2 pb-24">
        <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_120px_90px_28px] gap-x-5 px-5 text-xs text-[var(--st-muted)] md:grid">
          <span>Note</span><span>Starts with</span><span>Folder</span><span className="font-medium text-[var(--st-ink)]">Updated</span><span />
        </div>

        {notes === null ? (
          <p className="m-0 flex items-center gap-2 px-5 py-4 text-[13px] text-[var(--st-muted)]">
            <Loader2 size={14} className="animate-spin" /> Looking on this device…
          </p>
        ) : all.length === 0 ? (
          /* Nothing copied yet — say how to get a copy, and that writing works regardless. */
          <div className="st-tex-paper-dots flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-[var(--st-line)] px-4 py-6 text-center">
            <div className="max-w-[30rem] rounded-xl bg-[var(--st-page)] px-4 py-3">
              <p className="m-0 text-[14px] font-medium">No notes have been copied to this device yet.</p>
              <p className="m-0 mt-1.5 text-[13px] text-[var(--st-sub)]">
                Open this page once while you have a connection and the whole collection is kept here, so you can
                read it anywhere. You can write a new one either way.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {connected && (
                <button type="button" onClick={onCopy} disabled={busy} className={cn(stBtn.ghost, "disabled:opacity-60")}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Copy them now
                </button>
              )}
              <button type="button" onClick={onNew} className={stBtn.dark}><Plus size={15} />New note</button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="st-tex-paper-dots flex min-h-[160px] items-center justify-center rounded-[20px] border border-dashed border-[var(--st-line)]">
            <span className="rounded-xl bg-[var(--st-page)] px-4 py-2.5 text-[13px] text-[var(--st-sub)]">
              {q ? "No note on this device has those words." : lane === "archived" ? "Nothing archived." : "Nothing here."}
            </span>
          </div>
        ) : (
          rows.map((r) => {
            const empty = !r.title.trim() && !r.bodyText.trim();
            const snippet = snippetOf(r.bodyText, r.title);
            const waiting = (pendingIds.get(r.id)?.length ?? 0) > 0;
            return (
              /* A button, not a link: following a link asks the server for a page
                 it cannot answer. The row looks exactly like the online one. */
              <button
                key={r.id}
                type="button"
                onClick={() => onOpen(r.id)}
                className="group grid w-full grid-cols-[minmax(0,1fr)_28px] items-center gap-x-5 rounded-[14px] bg-[var(--st-surface)] px-5 py-3 text-left transition-shadow hover:shadow-[0_4px_14px_rgba(17,18,20,0.06)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_120px_90px_28px]"
              >
                <span className="min-w-0 md:contents">
                  <span className={cn("block truncate text-[15px] font-medium", empty && "text-[var(--st-muted)]")}>
                    {noteTitle(r)}
                    {r.kind === "daily" && <span className="ml-2 align-middle text-[11px] font-normal text-[var(--st-muted)]">Daily</span>}
                    {r.kind === "template" && <span className="ml-2 align-middle text-[11px] font-normal text-[var(--st-muted)]">Template</span>}
                    {waiting && <span className="ml-2 inline-flex h-5 items-center rounded-md bg-[var(--st-warn-wash)] px-1.5 align-middle text-[11px] font-normal text-[var(--st-soon-text)]">Not sent yet</span>}
                  </span>
                  <span className="block truncate text-[13px] text-[var(--st-muted)] max-md:text-xs">{snippet || (empty ? "Empty note" : "")}</span>
                  <span className="hidden md:block"><span className="inline-flex h-6 max-w-full items-center truncate rounded-lg bg-[var(--st-page)] px-2 text-[11px]">{r.folderName ?? "Unfiled"}</span></span>
                  <span className="hidden text-[13px] text-[var(--st-sub)] md:block">{ago(r.updatedAt)}</span>
                </span>
                {/* The pin, shown as it stands — changing it needs the server. */}
                <span
                  title={r.pinnedAt ? `Pinned · changing it ${NEEDS.toLowerCase()}` : `Pinning ${NEEDS.toLowerCase()}`}
                  className={cn("grid h-7 w-7 place-items-center rounded-lg", r.pinnedAt ? "text-[#F5A524]" : "text-[#C4C5C9] opacity-60")}
                >
                  <Star size={16} strokeWidth={1.7} fill={r.pinnedAt ? "currentColor" : "none"} />
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className={cn(stFloatBar.page, "-mt-20")}>
        <div className="pointer-events-auto flex w-full max-w-[760px] flex-wrap items-center gap-2.5 rounded-2xl border border-[var(--st-line)] bg-[var(--st-surface)] p-2 pl-4 shadow-[0_10px_28px_rgba(17,18,20,0.12)] sm:h-14 sm:flex-nowrap sm:py-0">
          <label className="flex min-w-[160px] flex-1 items-center gap-2 text-[var(--st-muted)]">
            <Search size={15} />
            <span className="sr-only">Search notes</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the notes on this device"
              className="bare-field h-9 w-full border-0 bg-transparent text-[13px] text-[var(--st-ink)] outline-none" />
          </label>
          {folders.length > 0 && (
            <>
              <span className="hidden h-6 w-px bg-[var(--st-line)] sm:block" aria-hidden />
              <FolderMenu
                label={folder ?? "Folders"}
                options={[
                  { key: "", label: "Every folder", active: folder == null, pick: () => setFolder(null) },
                  ...folders.map(([name, n]) => ({ key: name, label: name, count: n, active: folder === name, pick: () => pick("all", name) })),
                ]}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The folder menu from the online search bar, opening upwards — but its choices
 *  are buttons, because a link here would ask the server for a page. */
function FolderMenu({ label, options }: { label: string; options: { key: string; label: string; count?: number; active: boolean; pick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={root} className="relative min-w-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[var(--st-page)] px-3 text-xs transition-colors hover:bg-[var(--st-seg)]">
        <span className="min-w-0 max-w-[12rem] truncate">{label}</span>
        <ChevronDown size={12} className={cn("shrink-0 transition-transform", !open && "rotate-180")} />
      </button>
      {open && (
        <div className="st-pop absolute bottom-[calc(100%+8px)] right-0 z-40 w-[240px] overflow-hidden rounded-xl border border-[var(--st-line)] bg-[var(--st-surface)] shadow-[0_16px_40px_rgba(17,18,20,0.16)]">
          <div className="max-h-[340px] overflow-y-auto p-1">
            {options.map((o) => (
              <button key={o.key} type="button" onClick={() => { o.pick(); setOpen(false); }}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-3 text-left text-[14px] hover:bg-[var(--st-page)] sm:py-1.5 sm:text-[13px]", o.active && "bg-[var(--st-page)] font-medium")}>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.count != null && <span className="st-mono text-[11px] text-[var(--st-muted)]">{o.count}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
