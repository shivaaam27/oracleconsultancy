"use client";

import { useRef, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { UploadCloud, X, Loader2, Check, AlertTriangle, FileText } from "lucide-react";
import { Badge, Button } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { DOC_CATEGORIES } from "@/lib/documents-shared";
import { extractDocumentFromFile, createDocumentAction } from "@/app/documents/actions";
import type { DocumentRow } from "@/lib/documents-shared";

type Owner = { kind: "company" | "person"; id: number } | null;

type Row = {
  id: string;
  file: File;
  status: "extracting" | "ready" | "saving" | "saved" | "error";
  title: string;
  category: string;
  owner: Owner;
  expiryDate: string; // YYYY-MM-DD
  include: boolean;
  dup: string | null;
  note?: string;
};

function ownerValue(o: Owner): string {
  return o ? `${o.kind === "company" ? "c" : "p"}:${o.id}` : "";
}
function parseOwner(v: string): Owner {
  if (!v) return null;
  const [k, id] = v.split(":");
  return { kind: k === "c" ? "company" : "person", id: parseInt(id, 10) };
}

export function BulkUploadDialog({
  open,
  onOpenChange,
  companies,
  people,
  documents,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  documents: DocumentRow[];
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, startSaving] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // Flag a row as a likely duplicate: same owner + same category already on file.
  function dupFor(owner: Owner, category: string): string | null {
    if (!owner || !category) return null;
    const hit = documents.find(
      (d) => !d.archived && d.category === category &&
        (owner.kind === "company" ? d.companyId === owner.id : d.personId === owner.id)
    );
    return hit ? `Already have a ${category} on file` : null;
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const incoming: Row[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      status: "extracting",
      title: file.name.replace(/\.[^.]+$/, ""),
      category: "",
      owner: null,
      expiryDate: "",
      include: true,
      dup: null,
    }));
    setRows((prev) => [...prev, ...incoming]);

    // Read each file in turn (server extraction: text / office / scan via vision).
    for (const row of incoming) {
      const fd = new FormData();
      fd.set("file", row.file);
      let patch: Partial<Row> = { status: "ready" };
      try {
        const res = await extractDocumentFromFile(fd);
        const f = res.fields ?? {};
        const owner: Owner = f.companyId ? { kind: "company", id: f.companyId } : f.personId ? { kind: "person", id: f.personId } : null;
        const category = f.category ?? "";
        patch = {
          status: "ready",
          title: f.title || row.title,
          category,
          owner,
          expiryDate: f.expiryDate ?? "",
          dup: dupFor(owner, category),
          include: !dupFor(owner, category),
          note: res.note,
        };
      } catch {
        patch = { status: "ready", note: "Couldn't auto-read this file — fill it in manually." };
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    }
  }

  function update(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      // Re-check duplicate whenever owner/category changes.
      if ("owner" in patch || "category" in patch) next.dup = dupFor(next.owner, next.category);
      return next;
    }));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const ready = rows.filter((r) => r.status === "ready" || r.status === "error");
  const toFile = rows.filter((r) => r.include && r.owner && r.category && (r.status === "ready" || r.status === "error"));
  const stillReading = rows.some((r) => r.status === "extracting");

  function fileAll() {
    if (toFile.length === 0) return;
    startSaving(async () => {
      let ok = 0;
      for (const row of toFile) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "saving" } : r)));
        const fd = new FormData();
        fd.set("file", row.file);
        fd.set("title", row.title || row.file.name);
        fd.set("category", row.category);
        if (row.expiryDate) fd.set("expiryDate", row.expiryDate);
        if (row.owner?.kind === "company") fd.set("companyId", String(row.owner.id));
        if (row.owner?.kind === "person") fd.set("personId", String(row.owner.id));
        const res = await createDocumentAction(fd);
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: res.ok ? "saved" : "error", note: res.ok ? undefined : res.error } : r)));
        if (res.ok) ok++;
      }
      toast(`Filed ${ok} document${ok === 1 ? "" : "s"}.`, { tone: "success" });
      onDone?.();
      // Keep saved rows visible briefly, then close if everything saved.
      setTimeout(() => {
        setRows((prev) => prev.filter((r) => r.status !== "saved"));
        if (ok === toFile.length) onOpenChange(false);
      }, 800);
    });
  }

  const ownerOptions = [
    { group: "Companies", items: companies.map((c) => ({ value: `c:${c.id}`, label: c.name })) },
    { group: "People", items: people.map((p) => ({ value: `p:${p.id}`, label: p.name })) },
  ];
  const inputCls = "w-full rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs focus:outline-none focus:border-accent";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(820px,calc(100vw-2rem))] max-h-[88dvh] -translate-x-1/2 -translate-y-1/2 flex flex-col overflow-hidden rounded-2xl bg-bg-elev border border-border shadow-2xl outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
            <div>
              <Dialog.Title className="text-sm font-semibold">Bulk upload documents</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-fg-muted">
                Drop several files — each is auto-read and routed to its company or person. Review, then file all.
              </Dialog.Description>
            </div>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle"><X size={14} /></Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Drop / pick */}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="w-full rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-6 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors"
            >
              <UploadCloud size={22} className="mx-auto text-fg-subtle" />
              <div className="mt-1.5 text-sm font-medium">Choose files to upload</div>
              <div className="text-xs text-fg-muted">PDFs, photos/scans, Word, Excel — many at once</div>
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.xls,.csv,image/*,application/pdf"
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ""; }}
            />

            {rows.length === 0 ? (
              <p className="text-center text-xs text-fg-subtle py-4">No files yet.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <div key={row.id} className={cn("rounded-xl ring-1 p-2.5", row.dup ? "ring-warn/30 bg-warn-soft/20" : "ring-border bg-bg-subtle/40", row.status === "saved" && "opacity-60")}>
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-fg-subtle shrink-0" />
                      <span className="text-xs font-medium truncate flex-1">{row.file.name}</span>
                      {row.status === "extracting" && <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted"><Loader2 size={11} className="animate-spin" /> Reading…</span>}
                      {row.status === "saving" && <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted"><Loader2 size={11} className="animate-spin" /> Filing…</span>}
                      {row.status === "saved" && <span className="inline-flex items-center gap-1 text-[11px] text-success"><Check size={12} /> Filed</span>}
                      {(row.status === "ready" || row.status === "error") && (
                        <label className="inline-flex items-center gap-1 text-[11px] text-fg-muted cursor-pointer">
                          <input type="checkbox" checked={row.include} onChange={(e) => update(row.id, { include: e.target.checked })} className="accent-accent" /> Include
                        </label>
                      )}
                      <button type="button" onClick={() => removeRow(row.id)} className="h-6 w-6 inline-flex items-center justify-center rounded text-fg-subtle hover:text-danger"><X size={13} /></button>
                    </div>

                    {(row.status === "ready" || row.status === "error" || row.status === "saving") && (
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-4">
                        <input value={row.title} onChange={(e) => update(row.id, { title: e.target.value })} placeholder="Title" className={cn(inputCls, "sm:col-span-2")} />
                        <select value={row.category} onChange={(e) => update(row.id, { category: e.target.value })} className={inputCls}>
                          <option value="">Category…</option>
                          {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input type="date" value={row.expiryDate} onChange={(e) => update(row.id, { expiryDate: e.target.value })} className={inputCls} />
                        <select value={ownerValue(row.owner)} onChange={(e) => update(row.id, { owner: parseOwner(e.target.value) })} className={cn(inputCls, "sm:col-span-4")}>
                          <option value="">Belongs to… (company or person)</option>
                          {ownerOptions.map((g) => (
                            <optgroup key={g.group} label={g.group}>
                              {g.items.map((it) => <option key={it.value} value={it.value}>{it.label}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    )}

                    {row.dup && row.status !== "saved" && (
                      <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-warn"><AlertTriangle size={11} /> {row.dup} — unticked so it won't duplicate. Tick to add anyway.</div>
                    )}
                    {row.note && row.status === "error" && <div className="mt-1.5 text-[11px] text-danger">{row.note}</div>}
                    {row.note && row.status === "ready" && !row.dup && <div className="mt-1.5 text-[11px] text-fg-subtle">{row.note}</div>}
                    {(row.status === "ready") && (!row.owner || !row.category) && (
                      <div className="mt-1.5 text-[11px] text-fg-subtle">Set a category and owner to include this one.</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 shrink-0">
            <span className="text-xs text-fg-muted">
              {stillReading ? "Reading files…" : `${toFile.length} of ${ready.length} ready to file`}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
              <Button type="button" size="sm" loading={saving} disabled={toFile.length === 0} onClick={fileAll}>
                File {toFile.length || ""} document{toFile.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
