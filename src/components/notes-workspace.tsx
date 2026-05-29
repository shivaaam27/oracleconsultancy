"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, Search, Trash2, ArrowLeft, Loader2, Check, StickyNote, Wand2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { listNotes, createNote, updateNote, deleteNote, type Note } from "@/app/notes/actions";

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
  const s = body.replace(/\s+/g, " ").trim();
  return s || "No additional text";
}

export function NotesWorkspace({ initialNotes, companies }: { initialNotes: Note[]; companies: Company[] }) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  const [creating, setCreating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const selected = notes.find((n) => n.id === selectedId) || null;

  const filtered = notes.filter((n) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
  });

  const scheduleSave = useCallback((id: number, patch: { title?: string; body?: string; companyId?: number | null }) => {
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await updateNote({ id, ...patch });
      setSave("saved");
      // refresh updatedAt so ordering/labels stay honest
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, updatedAt: res.updatedAt } : n)));
      setTimeout(() => setSave("idle"), 1200);
    }, 700);
  }, []);

  function patchLocal(id: number, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  async function handleNew() {
    setCreating(true);
    const note = await createNote({ title: "", body: "" });
    setNotes((prev) => [note, ...prev]);
    setSelectedId(note.id);
    setCreating(false);
    setTimeout(() => titleRef.current?.focus(), 50);
  }

  async function handleDelete(id: number) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
    await deleteNote(id);
  }

  // Open the Capture Wizard pre-filled with this note's content (note is kept).
  function turnIntoTask(note: Note) {
    const text = [note.title, note.body].filter(Boolean).join("\n");
    const params = new URLSearchParams({ tab: "notes", capture: "open", text });
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Keep the server list fresh if notes were added elsewhere (e.g. Capture Wizard).
  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  return (
    <div className="md:grid md:grid-cols-[240px_1fr] rounded-2xl border border-border overflow-hidden min-h-[70vh] bg-bg-elev">
      {/* List pane */}
      <div className={cn("flex flex-col border-border md:border-r", selected ? "hidden md:flex" : "flex")}>
        <div className="p-3 space-y-2 border-b border-border">
          <button
            type="button"
            onClick={handleNew}
            disabled={creating}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent text-accent-fg text-sm font-medium px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} New note
          </button>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              className="w-full rounded-lg border border-border bg-bg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-fg-muted px-4">
              {query ? "No notes match." : "No notes yet. Tap “New note”."}
            </div>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelectedId(n.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b border-border/60 transition-colors",
                  selectedId === n.id ? "bg-accent/10" : "hover:bg-bg-muted/50"
                )}
              >
                <div className="text-sm font-medium truncate">{n.title || "Untitled note"}</div>
                <p className="text-xs text-fg-muted line-clamp-1 mt-0.5">
                  <span className="text-fg-subtle">{relTime(n.updatedAt)}</span>
                  <span className="mx-1 text-fg-subtle">·</span>
                  {snippet(n.body)}
                </p>
                {n.companyName && <span className="inline-block mt-1 text-[10px] text-accent">{n.companyName}</span>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor pane */}
      <div className={cn("flex flex-col", selected ? "flex" : "hidden md:flex")}>
        {selected ? (
          <>
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="md:hidden inline-flex items-center justify-center h-8 w-8 rounded-lg text-fg-muted hover:bg-bg-muted"
                aria-label="Back to list"
              >
                <ArrowLeft size={16} />
              </button>
              <select
                value={selected.companyId ?? ""}
                onChange={(e) => {
                  const companyId = e.target.value ? Number(e.target.value) : null;
                  patchLocal(selected.id, { companyId });
                  scheduleSave(selected.id, { companyId });
                }}
                className="text-xs rounded-lg border border-border bg-bg px-2 py-1 text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">No company</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-fg-subtle">
                {save === "saving" && <><Loader2 size={11} className="animate-spin" /> Saving…</>}
                {save === "saved" && <><Check size={11} className="text-success" /> Saved</>}
              </span>
              <button
                type="button"
                onClick={() => turnIntoTask(selected)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-accent hover:border-accent/50 transition-colors"
                title="Turn this note into a task"
              >
                <Wand2 size={13} /> <span className="hidden sm:inline">Turn into task</span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(selected.id)}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-fg-muted hover:text-danger hover:bg-bg-muted"
                aria-label="Delete note"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <input
              ref={titleRef}
              value={selected.title}
              onChange={(e) => { patchLocal(selected.id, { title: e.target.value }); scheduleSave(selected.id, { title: e.target.value }); }}
              placeholder="Title"
              className="px-5 pt-5 pb-0.5 text-xl font-semibold tracking-tight bg-transparent outline-none placeholder:text-fg-subtle"
            />
            <div className="px-5 pb-2 text-[11px] text-fg-subtle">Edited {relTime(selected.updatedAt)}</div>
            <textarea
              value={selected.body}
              onChange={(e) => { patchLocal(selected.id, { body: e.target.value }); scheduleSave(selected.id, { body: e.target.value }); }}
              placeholder="Start writing…"
              className="flex-1 px-5 pb-5 pt-1 text-[15px] leading-relaxed bg-transparent outline-none resize-none placeholder:text-fg-subtle min-h-[40vh]"
            />
          </>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8">
            <StickyNote size={28} className="text-fg-subtle mb-3" />
            <p className="text-sm text-fg-muted">Select a note, or create a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
