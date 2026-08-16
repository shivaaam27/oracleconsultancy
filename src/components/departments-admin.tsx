"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X, GitMerge, Trash2, Users, Building2, ListTodo, Crown } from "lucide-react";
import { Button, Select } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { createDepartment, renameDepartment, mergeDepartments, deleteDepartment } from "@/app/companies/department-actions";
import type { DepartmentAdminRow } from "@/lib/departments";

export function DepartmentsAdmin({ departments }: { departments: DepartmentAdminRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [mergeId, setMergeId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
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
      {/* Add a department */}
      <div className="glass elevated rounded-2xl p-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) run(() => createDepartment(newName), `Added ${newName.trim()}`); }}
          placeholder="New department name…"
          className="flex-1 min-w-0 rounded-lg bg-bg-subtle text-sm text-fg ring-1 ring-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <Button size="sm" disabled={busy || !newName.trim()} onClick={() => run(() => createDepartment(newName), `Added ${newName.trim()}`)}>
          <Plus size={14} /> Add
        </Button>
      </div>

      {departments.length === 0 ? (
        <div className="glass elevated rounded-2xl text-center py-12 text-fg-muted text-sm">No departments yet.</div>
      ) : (
        <div className="glass elevated rounded-2xl overflow-hidden divide-y divide-border/60">
          {departments.map((d) => {
            const others = departments.filter((x) => x.id !== d.id);
            return (
              <div key={d.id} className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {editId === d.id ? (
                    <>
                      <input
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") run(() => renameDepartment(d.id, editName), "Renamed"); if (e.key === "Escape") setEditId(null); }}
                        className="flex-1 min-w-0 rounded-lg bg-bg-subtle text-sm text-fg ring-1 ring-border px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                      <button type="button" disabled={busy} onClick={() => run(() => renameDepartment(d.id, editName), "Renamed")} className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-accent text-accent-fg"><Check size={15} /></button>
                      <button type="button" onClick={() => setEditId(null)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-bg-subtle ring-1 ring-border text-fg-muted"><X size={15} /></button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-fg truncate">{d.name}</div>
                        <div className="flex items-center gap-2.5 text-[11px] text-fg-subtle mt-0.5">
                          <span className="inline-flex items-center gap-1"><Users size={11} /> {d.peopleCount}</span>
                          <span className="inline-flex items-center gap-1"><Building2 size={11} /> {d.companyCount}</span>
                          <span className="inline-flex items-center gap-1"><ListTodo size={11} /> {d.taskCount}</span>
                          {d.headCount > 0 && <span className="inline-flex items-center gap-1 text-fg-muted"><Crown size={11} /> {d.headCount} head{d.headCount === 1 ? "" : "s"}</span>}
                        </div>
                      </div>
                      <button type="button" onClick={() => { setEditId(d.id); setEditName(d.name); setMergeId(null); setConfirmDelete(null); }} title="Rename" className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-accent hover:bg-bg-muted/60 transition-colors"><Pencil size={14} /></button>
                      <button type="button" onClick={() => { setMergeId(mergeId === d.id ? null : d.id); setConfirmDelete(null); setEditId(null); }} title="Merge into another" disabled={others.length === 0} className={cn("h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-30", mergeId === d.id ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-accent hover:bg-bg-muted/60")}><GitMerge size={14} /></button>
                      <button type="button" onClick={() => { setConfirmDelete(confirmDelete === d.id ? null : d.id); setMergeId(null); setEditId(null); }} title="Delete" className={cn("h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors", confirmDelete === d.id ? "bg-danger text-white" : "text-fg-muted hover:text-danger hover:bg-danger-soft/50")}><Trash2 size={14} /></button>
                    </>
                  )}
                </div>

                {/* Merge panel */}
                {mergeId === d.id && (
                  <div className="rounded-xl bg-bg-subtle/60 ring-1 ring-border/60 p-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-xs text-fg-muted shrink-0">Merge <span className="font-medium text-fg">{d.name}</span> into:</span>
                    <Select wrapperClassName="flex-1 min-w-0" id={`merge-${d.id}`} defaultValue="" className="text-xs text-fg">
                      <option value="" disabled>Choose target…</option>
                      {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </Select>
                    <Button size="sm" disabled={busy} onClick={() => {
                      const v = (document.getElementById(`merge-${d.id}`) as HTMLSelectElement)?.value;
                      if (!v) { toast("Choose a target department.", { tone: "warn" }); return; }
                      run(() => mergeDepartments(d.id, Number(v)), "Departments merged");
                    }}><GitMerge size={13} /> Merge</Button>
                  </div>
                )}

                {/* Delete confirm */}
                {confirmDelete === d.id && (
                  <div className="rounded-xl bg-danger-soft/40 ring-1 ring-danger/25 p-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-xs text-fg-muted flex-1">
                      Delete <span className="font-medium text-fg">{d.name}</span>?
                      {d.peopleCount + d.taskCount > 0 && <> {d.peopleCount} {d.peopleCount === 1 ? "person" : "people"} and {d.taskCount} task{d.taskCount === 1 ? "" : "s"} will be set to “no department”.</>}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="danger-soft" disabled={busy} onClick={() => run(() => deleteDepartment(d.id), "Department deleted")}><Trash2 size={13} /> Delete</Button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="text-xs text-fg-muted hover:text-fg px-2">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-fg-subtle px-1">
        Heads are set per company in the <span className="font-medium">Organogram → By department</span> view. Merging re-points everyone and their tasks; deleting clears the tag.
      </p>
    </div>
  );
}
