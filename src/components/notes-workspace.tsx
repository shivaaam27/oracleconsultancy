"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, Search, Trash2, ArrowLeft, Loader2, Check, StickyNote, Wand2, ExternalLink, Pin, Pencil, Eye, Bold, Italic, Heading2, List } from "lucide-react";
import { cn } from "@/lib/cn";
import { createNote, updateNote, deleteNote, setNotePinned, type Note } from "@/app/notes/actions";
import { PeekPreview, type PeekAction } from "./peek-preview";
import { Button } from "./ui";
import { FluidSelect } from "./fluid-select";
import { Combobox } from "./combobox";
import { Markdown } from "./markdown";
import { triggerHaptic } from "@/lib/use-long-press";

type Company = { id: number; name: string };
type SaveState = "idle" | "saving" | "saved";

function relTime(iso: string): string {
  const norm = /[Zz]$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const s = (Date.now() - new Date(norm).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  if (d < 30) return `${d}d ago`;
  return new Date(norm).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function snippet(body: string): string {
  const s = body.replace(/[#*`>-]/g, "").replace(/\s+/g, " ").trim();
  return s || "No additional text";
}

function sortNotes(a: Note, b: Note): number {
  if (!!a.pinnedAt !== !!b.pinnedAt) return a.pinnedAt ? -1 : 1;
  if (a.pinnedAt && b.pinnedAt) return b.pinnedAt.localeCompare(a.pinnedAt);
  return b.updatedAt.localeCompare(a.updatedAt);
}

export function NotesWorkspace({ initialNotes, companies, openId }: { initialNotes: Note[]; companies: Company[]; openId?: number }) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [editing, setEditing] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const [creating, setCreating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [peek, setPeek] = useState<Note | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  const selected = notes.find((n) => n.id === selectedId) || null;
  const folders = [...new Set(notes.map((n) => n.folder).filter(Boolean))].sort() as string[];

  function clearPress() { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }
  function onNotePointerDown(n: Note, e: React.PointerEvent) {
    longPressed.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPress();
    pressTimer.current = setTimeout(() => { longPressed.current = true; triggerHaptic(); setPeek(n); }, 400);
  }
  function onNotePointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    if (Math.abs(e.clientX - pressStart.current.x) > 8 || Math.abs(e.clientY - pressStart.current.y) > 8) clearPress();
  }
  const peekActions = (n: Note): PeekAction[] => [
    { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => setSelectedId(n.id) },
    { label: n.pinnedAt ? "Unpin" : "Pin", icon: <Pin size={15} />, onClick: () => togglePin(n) },
    { label: "Turn into task", icon: <Wand2 size={15} />, onClick: () => turnIntoTask(n) },
    { label: "Delete", icon: <Trash2 size={15} />, tone: "danger", onClick: () => handleDelete(n.id) },
  ];

  const filtered = notes
    .filter((n) => {
      if (folderFilter && (n.folder || "") !== folderFilter) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
    })
    .sort(sortNotes);

  const scheduleSave = useCallback((id: number, patch: { title?: string; body?: string; companyId?: number | null; folder?: string | null }) => {
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await updateNote({ id, ...patch });
      setSave("saved");
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, updatedAt: res.updatedAt } : n)));
      setTimeout(() => setSave("idle"), 1200);
    }, 700);
  }, []);

  function patchLocal(id: number, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  async function togglePin(n: Note) {
    const next = n.pinnedAt ? null : new Date().toISOString();
    patchLocal(n.id, { pinnedAt: next });
    await setNotePinned(n.id, !!next);
  }

  async function handleNew() {
    setCreating(true);
    const note = await createNote({ title: "", body: "", companyId: null });
    setNotes((prev) => [note, ...prev]);
    setSelectedId(note.id);
    setEditing(true);
    setCreating(false);
    setTimeout(() => titleRef.current?.focus(), 50);
  }

  // Lets the global context action bar trigger "New note".
  useEffect(() => {
    const h = () => { handleNew(); };
    window.addEventListener("workbook:new-note", h);
    return () => window.removeEventListener("workbook:new-note", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(id: number) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
    await deleteNote(id);
  }

  function turnIntoTask(note: Note) {
    const text = [note.title, note.body].filter(Boolean).join("\n");
    const params = new URLSearchParams({ tab: "notes", capture: "open", text, noteId: String(note.id) });
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // ---- Formatting toolbar (markdown) ----
  function applyWrap(token: string) {
    const ta = bodyRef.current; if (!ta || !selected) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const next = value.slice(0, s) + token + value.slice(s, e) + token + value.slice(e);
    patchLocal(selected.id, { body: next }); scheduleSave(selected.id, { body: next });
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = s + token.length; ta.selectionEnd = e + token.length; });
  }
  function applyLine(prefix: string) {
    const ta = bodyRef.current; if (!ta || !selected) return;
    const { selectionStart: s, value } = ta;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    patchLocal(selected.id, { body: next }); scheduleSave(selected.id, { body: next });
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + prefix.length; });
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // When switching notes, open empty notes ready to type; written notes in read view.
  useEffect(() => { if (selected) setEditing(!selected.body.trim()); /* eslint-disable-next-line */ }, [selectedId]);

  // Deep-link: open a specific note when arriving with ?open=<id>.
  useEffect(() => { if (openId && notes.some((n) => n.id === openId)) setSelectedId(openId); /* eslint-disable-next-line */ }, [openId]);

  return (
    <div className="md:grid md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)] rounded-2xl overflow-hidden min-h-[70vh] glass elevated">
      {/* List pane */}
      <div className={cn("flex flex-col border-border md:border-r", selected ? "hidden md:flex" : "flex")}>
        <div className="p-3 space-y-2 border-b border-border">
          <Button type="button" onClick={handleNew} disabled={creating} className="w-full">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} New note
          </Button>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes" className="w-full rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none" />
          </div>
          {folders.length > 0 && (
            <FluidSelect
              value={folderFilter}
              onSelect={setFolderFilter}
              options={[{ value: "", label: "All folders" }, ...folders.map((f) => ({ value: f, label: f }))]}
              buttonClassName="w-full justify-between"
              className="w-full"
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-fg-muted px-4">{query || folderFilter ? "No notes match." : "No notes yet. Tap “New note”."}</div>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onPointerDown={(e) => onNotePointerDown(n, e)}
                onPointerMove={onNotePointerMove}
                onPointerUp={clearPress}
                onPointerLeave={clearPress}
                onPointerCancel={clearPress}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => { if (longPressed.current) { longPressed.current = false; return; } setSelectedId(n.id); }}
                className={cn("w-full text-left px-3 py-2.5 border-b border-border/60 transition-colors select-none", selectedId === n.id ? "bg-accent/10" : "hover:bg-bg-muted/50")}
              >
                <div className="flex items-center gap-1.5">
                  {n.pinnedAt && <Pin size={11} className="text-accent shrink-0 fill-accent" />}
                  <span className="text-sm font-medium truncate">{n.title || "Untitled note"}</span>
                </div>
                <p className="text-xs text-fg-muted line-clamp-1 mt-0.5">
                  <span className="text-fg-subtle">{relTime(n.updatedAt)}</span>
                  <span className="mx-1 text-fg-subtle">·</span>{snippet(n.body)}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  {n.companyName && <span className="text-[10px] text-accent">{n.companyName}</span>}
                  {n.folder && <span className="text-[10px] text-fg-subtle bg-bg-muted rounded px-1.5 py-0.5">{n.folder}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor pane */}
      <div className={cn("flex flex-col min-w-0", selected ? "flex" : "hidden md:flex")}>
        {selected ? (
          <>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border">
              <button type="button" onClick={() => setSelectedId(null)} className="md:hidden inline-flex items-center justify-center h-8 w-8 rounded-lg text-fg-muted hover:bg-bg-muted" aria-label="Back to list"><ArrowLeft size={16} /></button>
              <FluidSelect
                value={selected.companyId ? String(selected.companyId) : ""}
                onSelect={(v) => { const companyId = v ? Number(v) : null; patchLocal(selected.id, { companyId }); scheduleSave(selected.id, { companyId }); }}
                options={[{ value: "", label: "No company" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
              />
              <div className="w-32">
                <Combobox
                  key={selected.id}
                  defaultValue={selected.folder ?? ""}
                  options={folders}
                  placeholder="Folder"
                  className="w-full rounded-lg px-2 py-1.5 text-xs text-fg-muted focus:outline-none"
                  onInput={(v) => { patchLocal(selected.id, { folder: v }); scheduleSave(selected.id, { folder: v }); }}
                  onCommit={(v) => { patchLocal(selected.id, { folder: v }); scheduleSave(selected.id, { folder: v }); }}
                />
              </div>

              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-fg-subtle">
                {save === "saving" && <><Loader2 size={11} className="animate-spin" /> Saving…</>}
                {save === "saved" && <><Check size={11} className="text-success" /> Saved</>}
              </span>
              <button type="button" onClick={() => togglePin(selected)} className={cn("inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-bg-muted transition-colors", selected.pinnedAt ? "text-accent" : "text-fg-muted hover:text-fg")} title={selected.pinnedAt ? "Unpin" : "Pin"} aria-label="Pin note">
                <Pin size={15} className={selected.pinnedAt ? "fill-accent" : ""} />
              </button>
              <button type="button" onClick={() => setEditing((e) => !e)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-accent hover:border-accent/50 transition-colors" title={editing ? "Preview" : "Edit"}>
                {editing ? <><Eye size={13} /> <span className="hidden sm:inline">Preview</span></> : <><Pencil size={13} /> <span className="hidden sm:inline">Edit</span></>}
              </button>
              <button type="button" onClick={() => turnIntoTask(selected)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-accent hover:border-accent/50 transition-colors" title="Turn this note into a task">
                <Wand2 size={13} /> <span className="hidden sm:inline">Task</span>
              </button>
              <button type="button" onClick={() => handleDelete(selected.id)} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-fg-muted hover:text-danger hover:bg-bg-muted" aria-label="Delete note"><Trash2 size={15} /></button>
            </div>

            <input
              ref={titleRef}
              value={selected.title}
              onChange={(e) => { patchLocal(selected.id, { title: e.target.value }); scheduleSave(selected.id, { title: e.target.value }); }}
              placeholder="Title"
              className="px-5 pt-5 pb-0.5 text-xl font-semibold tracking-tight bg-transparent outline-none placeholder:text-fg-subtle"
            />
            <div className="px-5 pb-2 text-[11px] text-fg-subtle">Edited {relTime(selected.updatedAt)}{selected.pinnedAt ? " · Pinned" : ""}</div>

            {editing ? (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center gap-0.5 px-4 pb-1.5">
                  {[
                    { icon: <Bold size={14} />, fn: () => applyWrap("**"), label: "Bold" },
                    { icon: <Italic size={14} />, fn: () => applyWrap("*"), label: "Italic" },
                    { icon: <Heading2 size={14} />, fn: () => applyLine("## "), label: "Heading" },
                    { icon: <List size={14} />, fn: () => applyLine("- "), label: "List" },
                  ].map((b) => (
                    <button key={b.label} type="button" onClick={b.fn} title={b.label} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors">{b.icon}</button>
                  ))}
                  <span className="ml-2 text-[10px] text-fg-subtle">Markdown supported</span>
                </div>
                <textarea
                  ref={bodyRef}
                  value={selected.body}
                  onChange={(e) => { patchLocal(selected.id, { body: e.target.value }); scheduleSave(selected.id, { body: e.target.value }); }}
                  placeholder="Start writing… (**bold**, # heading, - list)"
                  className="flex-1 px-5 pb-5 pt-1 text-[15px] leading-relaxed bg-transparent outline-none resize-none placeholder:text-fg-subtle min-h-[40vh]"
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 pb-5 pt-1 cursor-text" onClick={() => setEditing(true)}>
                {selected.body.trim()
                  ? <Markdown text={selected.body} className="text-[15px] text-fg" />
                  : <p className="text-sm text-fg-subtle">Empty note — tap to write.</p>}
              </div>
            )}
          </>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8">
            <StickyNote size={28} className="text-fg-subtle mb-3" />
            <p className="text-sm text-fg-muted">Select a note, or create a new one.</p>
            <p className="text-xs text-fg-subtle mt-1">Pin important ones, group them into folders, and format with Markdown.</p>
          </div>
        )}
      </div>

      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => setSelectedId(peek.id) : undefined}
        title={peek?.title || "Untitled note"}
        subtitle={peek ? [peek.companyName, peek.folder, relTime(peek.updatedAt)].filter(Boolean).join(" · ") || undefined : undefined}
        body={peek ? peek.body.slice(0, 180) || "No additional text" : undefined}
        actions={peek ? peekActions(peek) : []}
      />
    </div>
  );
}
