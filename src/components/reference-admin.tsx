"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X, GitMerge, Trash2 } from "lucide-react";
import { Button, Select } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";

export type RefItem = { id: number; name: string; meta?: string };
type Res = { ok: boolean; error?: string };

/** Generic add / rename / merge / delete manager for a simple named list
 *  (sites, job titles, …). Mirrors the Departments admin. */
export function ReferenceAdmin({
  items, noun, plural, addPlaceholder, onCreate, onRename, onMerge, onDelete, mergeNote, deleteNote,
}: {
  items: RefItem[];
  noun: string;
  /** Plural, when adding an "s" is wrong — Category/Categories, Entry/Entries.
   *  Defaults to `noun + "s"`, which is right for Sites, Roles and Suppliers. */
  plural?: string;
  addPlaceholder: string;
  onCreate: (name: string) => Promise<Res>;
  onRename: (id: number, name: string) => Promise<Res>;
  onMerge: (fromId: number, intoId: number) => Promise<Res>;
  onDelete: (id: number) => Promise<Res>;
  mergeNote: string;
  deleteNote: string;
}) {
  const many = plural ?? `${noun}s`;
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [mergeId, setMergeId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  function run(fn: () => Promise<Res>, okMsg: string) {
    setBusy(true);
    start(async () => {
      const res = await fn();
      toast(res.ok ? okMsg : (res.error || "Couldn't update"), { tone: res.ok ? "success" : "warn" });
      setBusy(false);
      if (res.ok) { setEditId(null); setMergeId(null); setConfirmDelete(null); setNewName(""); router.refresh(); }
    });
  }

  return (
    <div className="space-y-4">
      <div className="glass elevated rounded-2xl p-3 flex items-center gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) run(() => onCreate(newName), `Added ${newName.trim()}`); }}
          placeholder={addPlaceholder}
          className="flex-1 min-w-0 rounded-lg bg-bg-subtle text-sm text-fg ring-1 ring-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40" />
        <Button size="sm" disabled={busy || !newName.trim()} onClick={() => run(() => onCreate(newName), `Added ${newName.trim()}`)}><Plus size={14} /> Add</Button>
      </div>

      {items.length === 0 ? (
        <div className="glass elevated rounded-2xl text-center py-12 text-fg-muted text-sm">No {many.toLowerCase()} yet.</div>
      ) : (
        <div className="glass elevated rounded-2xl overflow-hidden divide-y divide-border/60">
          {items.map((d) => {
            const others = items.filter((x) => x.id !== d.id);
            return (
              <div key={d.id} className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {editId === d.id ? (
                    <>
                      <input value={editName} autoFocus onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") run(() => onRename(d.id, editName), "Renamed"); if (e.key === "Escape") setEditId(null); }}
                        className="flex-1 min-w-0 rounded-lg bg-bg-subtle text-sm text-fg ring-1 ring-border px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40" />
                      <button type="button" disabled={busy} onClick={() => run(() => onRename(d.id, editName), "Renamed")} className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-accent text-accent-fg"><Check size={15} /></button>
                      <button type="button" onClick={() => setEditId(null)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-bg-subtle ring-1 ring-border text-fg-muted"><X size={15} /></button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-fg truncate">{d.name}</div>
                        {d.meta && <div className="text-xs text-fg-subtle mt-0.5">{d.meta}</div>}
                      </div>
                      <button type="button" onClick={() => { setEditId(d.id); setEditName(d.name); setMergeId(null); setConfirmDelete(null); }} title="Rename" className="h-8 w-8 max-sm:h-10 max-sm:w-10 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-accent hover:bg-bg-muted/60 transition-colors"><Pencil size={14} /></button>
                      <button type="button" onClick={() => { setMergeId(mergeId === d.id ? null : d.id); setConfirmDelete(null); setEditId(null); }} title="Merge into another" disabled={others.length === 0} className={cn("h-8 w-8 max-sm:h-10 max-sm:w-10 inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-30", mergeId === d.id ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-accent hover:bg-bg-muted/60")}><GitMerge size={14} /></button>
                      <button type="button" onClick={() => { setConfirmDelete(confirmDelete === d.id ? null : d.id); setMergeId(null); setEditId(null); }} title="Delete" className={cn("h-8 w-8 max-sm:h-10 max-sm:w-10 inline-flex items-center justify-center rounded-lg transition-colors", confirmDelete === d.id ? "bg-danger text-white" : "text-fg-muted hover:text-danger hover:bg-danger-soft/50")}><Trash2 size={14} /></button>
                    </>
                  )}
                </div>

                {mergeId === d.id && (
                  <div className="rounded-xl bg-bg-subtle/60 ring-1 ring-border/60 p-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-xs text-fg-muted shrink-0">Merge <span className="font-medium text-fg">{d.name}</span> into:</span>
                    <Select wrapperClassName="flex-1 min-w-0" id={`ref-merge-${d.id}`} defaultValue="" className="text-xs text-fg">
                      <option value="" disabled>Choose target…</option>
                      {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </Select>
                    <Button size="sm" disabled={busy} onClick={() => {
                      const v = (document.getElementById(`ref-merge-${d.id}`) as HTMLSelectElement)?.value;
                      if (!v) { toast("Choose a target.", { tone: "warn" }); return; }
                      run(() => onMerge(d.id, Number(v)), `Merged ${many.toLowerCase()}`);
                    }}><GitMerge size={13} /> Merge</Button>
                    <span className="text-xs text-fg-subtle">{mergeNote}</span>
                  </div>
                )}

                {confirmDelete === d.id && (
                  <div className="rounded-xl bg-danger-soft/40 ring-1 ring-danger/25 p-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-xs text-fg-muted flex-1">Delete <span className="font-medium text-fg">{d.name}</span>? {deleteNote}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="danger-soft" disabled={busy} onClick={() => run(() => onDelete(d.id), "Deleted")}><Trash2 size={13} /> Delete</Button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="text-xs text-fg-muted hover:text-fg px-2">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
