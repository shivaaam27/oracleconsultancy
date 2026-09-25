"use client";

/**
 * The Notes shelf in Studio (26 Sept 2026, mockup board Notes). Same data and
 * the same actions as the old shelf (notes-shelf.tsx): folders, #tags, smart
 * folders, pin, Today's page, tidy empty notes, and "Ask your notes".
 * Filters live in the address, as everywhere.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, FileText, FolderPlus, Loader2, Plus, Search, Star } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, stBtn, stFloatBar } from "@/components/studio/kit";
import { StudioMenu } from "@/components/studio/tasks/controls";
import { StudioSheet } from "@/components/studio/sheet";
import { useUrlFilters } from "@/lib/use-url-filters";
import { useToast } from "@/components/toast";
import { withReturn } from "@/lib/return-to";
import { noteTitle, type NoteFolder, type NoteListRow } from "@/lib/notes-shared";
import { createNote, createFolder, openTodaysNote, tidyEmptyNotes, togglePinNote } from "@/app/notes/actions";
import { askNotesAction, type AskResult } from "@/app/notes/ai-actions";
import { cn } from "@/lib/cn";

type SavedView = { id: string; name: string; query: string };

const ago = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export function StudioNotesShelf({ rows, folders, counts, tags, savedViews, today, autoCreate }: {
  rows: NoteListRow[];
  folders: NoteFolder[];
  counts: { all: number; unfiled: number; pinned: number; archived: number };
  tags: { tag: string; count: number }[];
  savedViews: SavedView[];
  /** Today's daily page, if it has been started. */
  today: { id: number; title: string; snippet: string } | null;
  autoCreate: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const f = useUrlFilters({ filter: "all", folder: "", q: "", tag: "" }, { debounceKeys: ["q"], debounceMs: 250 });
  const [q, setQ] = useState(f.values.q);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");

  // ?new=1 — clear the address FIRST (see notes-shelf.tsx: Back re-fired it).
  const made = useRef(false);
  useEffect(() => {
    if (!autoCreate || made.current) return;
    made.current = true;
    try { window.history.replaceState(null, "", "/notes"); } catch { /* ignore */ }
    start(async () => { await createNote(); });
  }, [autoCreate]);

  const folderId = f.values.folder ? Number(f.values.folder) : null;
  const here = `/notes${f.query ? `?${f.query}` : ""}`;
  const emptyCount = rows.filter((r) => r.kind !== "template" && !r.title.trim() && !r.bodyText.trim()).length;
  const lane = f.values.filter;
  const folderName_ = folderId != null ? folders.find((x) => x.id === folderId)?.name ?? "Folder" : null;

  const newNote = () => start(async () => {
    const fd = new FormData();
    if (folderId != null) fd.set("folderId", String(folderId));
    await createNote(fd);
  });

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader
        title="Notes"
        right={
          <>
            <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist">
              {([["all", "All", counts.all], ["pinned", "Pinned", counts.pinned], ["unfiled", "Unfiled", counts.unfiled], ["archived", "Archived", counts.archived]] as const).map(([k, l, n]) => {
                const on = lane === k && folderId == null && !f.values.tag;
                return (
                  <Link key={k} href={f.hrefFor({ filter: k, folder: "", tag: "" })} role="tab" aria-selected={on} scroll={false}
                    className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-xs transition-colors", on ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                    {l}<span className="text-[11px] font-normal text-[var(--st-muted)]">{n}</span>
                  </Link>
                );
              })}
            </div>
            <button type="button" disabled={busy} onClick={() => start(async () => { await openTodaysNote(); })} className={cn(stBtn.ghost, "max-sm:hidden")}><CalendarDays size={14} />Today</button>
            <button type="button" onClick={() => setFolderOpen(true)} className={cn(stBtn.ghost, "max-sm:hidden")}><FolderPlus size={14} />New folder</button>
            <button type="button" disabled={busy} onClick={newNote} className={stBtn.dark}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}New note</button>
          </>
        }
      />

      <StudioCardRow className="lg:h-[232px]">
        <AskCard />
        <StudioCard texture="rings" className="min-h-[210px]">
          <CardHead label="Today’s page" right={<span>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Nairobi" })}</span>} />
          <div className="mt-auto flex flex-col gap-3 pt-3">
            {today ? (
              <>
                <div className="truncate text-[24px] font-medium tracking-[-0.02em]">{today.title}</div>
                <div className="line-clamp-2 text-[13px] text-[var(--st-on-card-muted)]">{today.snippet || "Started — nothing written yet."}</div>
              </>
            ) : (
              <>
                <div className="text-[24px] font-medium tracking-[-0.02em] sm:text-[28px]">Nothing written today yet</div>
                <div className="text-[13px] text-[var(--st-on-card-muted)]">One page per day, opened from your daily template. Tick-box lines can become to-dos with a reminder.</div>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              {today
                ? <Link href={`/notes/${today.id}`} className={stBtn.onCard}>Open today’s page</Link>
                : <button type="button" disabled={busy} onClick={() => start(async () => { await openTodaysNote(); })} className={stBtn.onCard}>Start today’s page</button>}
              {emptyCount > 0 && (
                <button type="button" disabled={busy} className={stBtn.onCardGhost}
                  onClick={() => start(async () => {
                    const r = await tidyEmptyNotes();
                    toast(r.ok ? (r.count ? `${r.count} empty note${r.count === 1 ? "" : "s"} archived.` : "Nothing to tidy.") : "Couldn't tidy the shelf.", { tone: r.ok ? "success" : "warn" });
                    router.refresh();
                  })}>Tidy {emptyCount} empty {emptyCount === 1 ? "note" : "notes"}</button>
              )}
            </div>
          </div>
        </StudioCard>
      </StudioCardRow>

      {(folderName_ || f.values.tag) && (
        <div className="flex items-center gap-2 px-1 text-[13px]">
          <span className="text-[var(--st-muted)]">Showing</span>
          <span className="font-medium">{folderName_ ?? `#${f.values.tag}`}</span>
          <Link href={f.hrefFor({ folder: "", tag: "" })} scroll={false} className="text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]">Show all</Link>
        </div>
      )}

      <div className="flex flex-col gap-2 pb-24">
        <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_120px_90px_28px] gap-x-5 px-5 text-xs text-[var(--st-muted)] md:grid">
          <span>Note</span><span>Starts with</span><span>Folder</span><span className="font-medium text-[var(--st-ink)]">Updated</span><span />
        </div>
        {rows.length === 0 && (
          <div className="st-tex-paper-dots flex min-h-[160px] items-center justify-center rounded-[20px] border border-dashed border-[var(--st-line)]">
            <span className="rounded-xl bg-[var(--st-page)] px-4 py-2.5 text-[13px] text-[var(--st-sub)]">{f.values.q ? "No note has those words." : lane === "archived" ? "Nothing archived." : "No notes here yet — write one."}</span>
          </div>
        )}
        {rows.map((r) => {
          const empty = !r.title.trim() && !r.bodyText.trim();
          return (
            <div key={r.id} className="group grid grid-cols-[minmax(0,1fr)_28px] items-center gap-x-5 rounded-[14px] bg-[var(--st-surface)] px-5 py-3 transition-shadow hover:shadow-[0_4px_14px_rgba(17,18,20,0.06)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_120px_90px_28px]">
              <Link href={withReturn(`/notes/${r.id}`, here)} className="min-w-0 md:contents">
                <span className={cn("block truncate text-[15px] font-medium", empty && "text-[var(--st-muted)]")}>
                  {noteTitle(r)}{r.kind === "daily" && <span className="ml-2 align-middle text-[11px] font-normal text-[var(--st-muted)]">Daily</span>}{r.kind === "template" && <span className="ml-2 align-middle text-[11px] font-normal text-[var(--st-muted)]">Template</span>}
                </span>
                <span className="block truncate text-[13px] text-[var(--st-muted)] max-md:text-xs">{r.snippet || (empty ? "Empty note" : "")}</span>
                <span className="hidden md:block"><span className="inline-flex h-6 max-w-full items-center truncate rounded-lg bg-[var(--st-page)] px-2 text-[11px]">{r.folderName ?? "Unfiled"}</span></span>
                <span className="hidden text-[13px] text-[var(--st-sub)] md:block">{ago(r.updatedAt)}</span>
              </Link>
              <button type="button" aria-label={r.pinnedAt ? "Unpin" : "Pin"} title={r.pinnedAt ? "Unpin" : "Pin to the top"}
                onClick={() => start(async () => { await togglePinNote(r.id); router.refresh(); })}
                className={cn("grid h-7 w-7 place-items-center rounded-lg transition-colors hover:bg-[var(--st-page)]", r.pinnedAt ? "text-[#F5A524]" : "text-[#C4C5C9]")}>
                <Star size={16} strokeWidth={1.7} fill={r.pinnedAt ? "currentColor" : "none"} />
              </button>
            </div>
          );
        })}
      </div>

      <div className={cn(stFloatBar.sticky, "-mt-20")}>
        <div className="pointer-events-auto flex w-full max-w-[760px] flex-wrap items-center gap-2.5 rounded-2xl border border-[var(--st-line)] bg-[var(--st-surface)] p-2 pl-4 shadow-[0_10px_28px_rgba(17,18,20,0.12)] sm:h-14 sm:flex-nowrap sm:py-0">
          <label className="flex min-w-[160px] flex-1 items-center gap-2 text-[var(--st-muted)]">
            <Search size={15} />
            <span className="sr-only">Search notes</span>
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); f.set({ q: e.target.value }); }} placeholder="Search notes — words, #tags or @people"
              className="bare-field h-9 w-full border-0 bg-transparent text-[13px] text-[var(--st-ink)] outline-none" />
          </label>
          <span className="hidden h-6 w-px bg-[var(--st-line)] sm:block" aria-hidden />
          <div className="flex gap-1.5">
            {folders.length > 0 && <StudioMenu label={folderName_ ?? "Folders"} up plus width={240} options={[
              { key: "all", label: "Every folder", href: f.hrefFor({ folder: "" }), active: folderId == null },
              ...folders.map((x) => ({ key: String(x.id), label: x.name, count: x.count, href: f.hrefFor({ folder: String(x.id), filter: "all" }), active: folderId === x.id })),
            ]} />}
            {tags.length > 0 && <StudioMenu label={f.values.tag ? `#${f.values.tag}` : "#tags"} up plus width={220} searchable={tags.length > 8} options={[
              { key: "", label: "Any tag", href: f.hrefFor({ tag: "" }), active: !f.values.tag },
              ...tags.map((t) => ({ key: t.tag, label: `#${t.tag}`, count: t.count, href: f.hrefFor({ tag: t.tag, filter: "all" }), active: f.values.tag === t.tag })),
            ]} />}
            {savedViews.length > 0 && <StudioMenu label="Smart folders" up plus width={240} options={savedViews.map((v) => ({ key: v.id, label: v.name, href: `/notes${v.query ? `?${v.query}` : ""}`, active: v.query === f.query }))} />}
          </div>
        </div>
      </div>

      <StudioSheet open={folderOpen} onClose={() => setFolderOpen(false)} title="New folder" icon={<FolderPlus size={15} />} width={420}
        footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setFolderOpen(false)} className="h-9 px-3 text-[13px]">Cancel</button>
          <button type="button" disabled={!folderName.trim() || busy} onClick={() => start(async () => {
            const r = await createFolder(folderName);
            if (!r.ok) { toast("Could not create that folder.", { tone: "warn" }); return; }
            toast(`Folder “${folderName.trim()}” added.`, { tone: "success" }); setFolderName(""); setFolderOpen(false); router.refresh();
          })} className={cn(stBtn.dark, "h-9 text-[13px]")}>Add folder</button></div>}>
        <input autoFocus value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="Folder name" className="st-field h-10 w-full rounded-[10px] px-3 text-[13px] outline-none" />
      </StudioSheet>
    </StudioScope>
  );
}

/** Ask your notes — answers only from what was written, with the notes cited. */
function AskCard() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AskResult | null>(null);
  const ask = async () => {
    if (!q.trim() || busy) return;
    setBusy(true); setRes(null);
    try { setRes(await askNotesAction(q.trim())); } catch { setRes({ ok: false, message: "Couldn't reach ORI — try again." }); }
    setBusy(false);
  };
  return (
    <StudioCard texture="dots" className="min-h-[210px]">
      <CardHead label="Ask your notes" right={<span>Answers only from what you wrote</span>} />
      <div className="mt-auto flex min-h-0 flex-col gap-2.5 pt-3">
        <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="flex h-11 items-center gap-2 rounded-xl border border-[#2E3035] bg-[#1F2023] pl-3.5 pr-1.5">
          <Search size={15} className="shrink-0 text-[#8E9197]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What did I decide about…?"
            className="bare-field h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#F2F2F0] outline-none placeholder:text-[#8E9197]" />
          <button type="submit" disabled={!q.trim() || busy} className="flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] bg-[#F2F2F0] px-3 text-xs font-semibold text-[#111214] disabled:opacity-40">{busy && <Loader2 size={12} className="animate-spin" />}Ask</button>
        </form>
        {res && (res.ok ? (
          <>
            <div className="st-scroll max-h-[64px] overflow-y-auto text-[13px] leading-relaxed text-[#C9CBCF]">{res.answer}</div>
            {res.sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {res.sources.slice(0, 4).map((s) => (
                  <Link key={s.id} href={`/notes/${s.id}`} className="inline-flex h-6 max-w-[14rem] items-center gap-1.5 truncate rounded-[7px] bg-[#26282C] px-2 text-[11px] text-[#E6E6E3] hover:bg-[#2E3035]"><FileText size={11} />{s.title}</Link>
                ))}
              </div>
            )}
          </>
        ) : <div className="text-[13px] text-[#F07BBE]">{res.message}</div>)}
      </div>
    </StudioCard>
  );
}
