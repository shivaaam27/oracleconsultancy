"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FolderUp, Check, AlertTriangle, Loader2, FileText, X } from "lucide-react";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { Button } from "./ui";
import { downscaleImage } from "@/lib/downscale-image";
import { autoFileDocumentAction, type AutoFileResult } from "@/app/documents/actions";

type Row = AutoFileResult & { fileName: string };
type Owner = { kind: "company" | "person"; id: number; name: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

/**
 * Automatic bulk intake (transfer-pack 08/09): drop the whole pile — or a whole
 * FOLDER — and the AI reads + files each one. Cross-file context: a file that
 * doesn't self-identify is resolved from its folder name or the batch "mostly
 * for" owner, so only the true orphans need review. You watch a progress bar.
 */
export function BulkAutoUpload({
  open, onOpenChange, onDone, companies = [], people = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
  companies?: Array<{ id: number; name: string; aliases?: string[] }>;
  people?: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [finished, setFinished] = useState(false);
  const [ctx, setCtx] = useState<Owner | null>(null);

  // Mark the folder input as a directory picker (not a typed React attribute).
  useEffect(() => {
    if (folderInput.current) { folderInput.current.setAttribute("webkitdirectory", ""); folderInput.current.setAttribute("directory", ""); }
  }, [open]);

  useEffect(() => {
    if (open) { setRunning(false); setTotal(0); setDone(0); setCurrent(""); setRows([]); setFinished(false); setCtx(null); }
  }, [open]);

  // Match a folder name against the known companies/people to pre-set the owner.
  function detectOwner(folderName: string): Owner | null {
    const q = norm(folderName);
    if (!q) return null;
    const p = people.find((x) => norm(x.name) === q) ?? people.find((x) => q.includes(norm(x.name)) || norm(x.name).includes(q));
    if (p) return { kind: "person", id: p.id, name: p.name };
    // Match a company by its name OR any alias (exact, then longer-alias contains).
    const names = (c: { name: string; aliases?: string[] }) => [c.name, ...(c.aliases ?? [])];
    const c = companies.find((x) => names(x).some((n) => norm(n) === q))
      ?? companies.find((x) => names(x).some((n) => { const nn = norm(n); return nn.length >= 4 && (q.includes(nn) || nn.includes(q)); }));
    if (c) return { kind: "company", id: c.id, name: c.name };
    return null;
  }

  async function run(files: File[]) {
    if (!files.length) return;
    // Auto-detect the batch owner from the top-level folder (if any) before running.
    const firstPath = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
    const topFolder = firstPath.split("/")[0] ?? "";
    if (!ctx && topFolder) { const o = detectOwner(topFolder); if (o) setCtx(o); }
    const batchOwner = ctx ?? (topFolder ? detectOwner(topFolder) : null);

    setRunning(true); setFinished(false); setTotal(files.length); setDone(0); setRows([]);
    const collected: Row[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrent(file.name);
      try {
        const prepared = await downscaleImage(file);
        const fd = new FormData();
        fd.set("file", prepared);
        const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
        if (relPath) fd.set("folderHint", relPath);
        if (batchOwner?.kind === "company") fd.set("contextCompanyId", String(batchOwner.id));
        if (batchOwner?.kind === "person") fd.set("contextPersonId", String(batchOwner.id));
        const res = await autoFileDocumentAction(fd);
        collected.push({ ...res, fileName: file.name });
      } catch {
        collected.push({ ok: false, title: file.name, status: "needs_review", owner: null, error: "Upload failed", fileName: file.name });
      }
      setDone(i + 1);
      setRows([...collected]);
    }
    setRunning(false); setFinished(true); setCurrent("");
    onDone?.();
    router.refresh();
  }

  const filed = rows.filter((r) => r.status === "filed").length;
  const review = rows.filter((r) => r.status === "needs_review").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const allOwners = [...people.map((p) => ({ kind: "person" as const, id: p.id, name: p.name })), ...companies.map((c) => ({ kind: "company" as const, id: c.id, name: c.name }))];

  return (
    <HrmsDialog open={open} onOpenChange={onOpenChange} width={620} title="Add all documents"
      sub="Drop them all (or a whole folder) — the AI reads each one, files the confident ones, and lists only the few that need a look.">
      <input ref={fileInput} type="file" multiple className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv,application/pdf"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (e.target) e.target.value = ""; if (fs.length) void run(fs); }} />
      <input ref={folderInput} type="file" multiple className="hidden"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (e.target) e.target.value = ""; if (fs.length) void run(fs); }} />

      {!running && !finished && (
        <div className="space-y-3">
          {/* Batch context owner */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-bg-subtle/40 px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">These are mostly for</span>
            <select className="rounded-md border border-border bg-bg px-2 py-1 text-[12px]" value={ctx ? `${ctx.kind}:${ctx.id}` : ""}
              onChange={(e) => { const v = e.target.value; if (!v) { setCtx(null); return; } const [kind, id] = v.split(":"); const o = allOwners.find((x) => x.kind === kind && x.id === Number(id)); setCtx(o ?? null); }}>
              <option value="">— optional (auto-detected from folder) —</option>
              <optgroup label="People">{people.map((p) => <option key={`p${p.id}`} value={`person:${p.id}`}>{p.name}</option>)}</optgroup>
              <optgroup label="Companies">{companies.map((c) => <option key={`c${c.id}`} value={`company:${c.id}`}>{c.name}</option>)}</optgroup>
            </select>
            <span className="text-[10px] text-fg-subtle">files that don’t name a company/person fall back to this</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => fileInput.current?.click()}
              className="rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-10 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors">
              <UploadCloud size={24} className="mx-auto text-fg-subtle" />
              <div className="mt-2 text-sm font-medium">Choose files</div>
              <div className="text-[11px] text-fg-muted">many at once</div>
            </button>
            <button type="button" onClick={() => folderInput.current?.click()}
              className="rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-10 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors">
              <FolderUp size={24} className="mx-auto text-fg-subtle" />
              <div className="mt-2 text-sm font-medium">Choose a folder</div>
              <div className="text-[11px] text-fg-muted">subfolders give context</div>
            </button>
          </div>
          <p className="text-[11px] text-fg-subtle">Nothing is filed to the wrong place — a file the AI can’t place is flagged for you to confirm.</p>
        </div>
      )}

      {(running || finished) && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[12px] text-fg-muted">
              <span>{running ? `Reading ${done} of ${total}…` : `Done — ${total} processed`}</span>
              <span className="tabular">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-bg-subtle overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            {running && current && <p className="text-[11px] text-fg-subtle truncate"><Loader2 size={11} className="inline animate-spin mr-1" />{current}</p>}
          </div>

          {finished && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success"><Check size={13} /> {filed} filed automatically</span>
              {review > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-xs font-medium text-warn"><AlertTriangle size={13} /> {review} need a quick look</span>}
            </div>
          )}

          <ul className="max-h-64 overflow-y-auto rounded-xl ring-1 ring-border/60 divide-y divide-border/50">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2 text-[12px]">
                <FileText size={13} className="shrink-0 text-fg-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className="block truncate text-[11px] text-fg-muted">{[r.owner, r.reason || r.error].filter(Boolean).join(" · ") || "filed"}</span>
                </span>
                {r.status === "filed"
                  ? <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">Filed</span>
                  : <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-medium text-warn">Review</span>}
              </li>
            ))}
          </ul>

          {finished && (
            <div className="flex items-center justify-end gap-2">
              <Button type="button" onClick={() => { setFinished(false); setRows([]); setTotal(0); setDone(0); }}>Add more</Button>
              <button type="button" onClick={() => onOpenChange(false)} className="px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted">Close{review > 0 ? " — review below" : ""}</button>
            </div>
          )}
        </div>
      )}
    </HrmsDialog>
  );
}
