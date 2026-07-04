"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, UploadCloud, FolderUp, Paperclip, X, Check, AlertTriangle, Copy, FileX, FileText, Loader2 } from "lucide-react";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { Button } from "./ui";
import { useToast } from "./toast";
import { downscaleImage } from "@/lib/downscale-image";
import { autoFileDocumentAction, type AutoFileResult } from "@/app/documents/actions";
import { createInboxBundle } from "@/app/inbox/actions";

type Row = AutoFileResult & { fileName: string };
type Owner = { kind: "company" | "person"; id: number; name: string };
type Pick = File & { webkitRelativePath?: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

/**
 * Smart Add — the single intake entry point. Drop files OR a whole folder, and/or
 * paste a message, then either SORT NOW (read + file each immediately, folder-aware)
 * or SAVE TO INBOX (stage a bundle for the auto-sorter to handle later). Merges the
 * old "Add to inbox" (staging + text) and "Add all (auto)" (folder-aware immediate).
 */
export function SmartAdd({
  companies = [], people = [],
}: {
  companies?: Array<{ id: number; name: string; aliases?: string[] }>;
  people?: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<Pick[]>([]);
  const [ctx, setCtx] = useState<Owner | null>(null);

  const [saving, startSave] = useTransition();
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [finished, setFinished] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const setFolderRef = (el: HTMLInputElement | null) => {
    folderInput.current = el;
    if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("mozdirectory", ""); el.setAttribute("directory", ""); }
  };

  function resetAll() {
    setSubject(""); setBody(""); setPicked([]); setCtx(null);
    setRunning(false); setTotal(0); setDone(0); setCurrent(""); setRows([]); setFinished(false);
  }

  function detectOwner(folderName: string): Owner | null {
    const q = norm(folderName);
    if (!q) return null;
    const p = people.find((x) => norm(x.name) === q) ?? people.find((x) => q.includes(norm(x.name)) || norm(x.name).includes(q));
    if (p) return { kind: "person", id: p.id, name: p.name };
    const names = (c: { name: string; aliases?: string[] }) => [c.name, ...(c.aliases ?? [])];
    const c = companies.find((x) => names(x).some((n) => norm(n) === q))
      ?? companies.find((x) => names(x).some((n) => { const nn = norm(n); return nn.length >= 4 && (q.includes(nn) || nn.includes(q)); }));
    if (c) return { kind: "company", id: c.id, name: c.name };
    return null;
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list) as Pick[];
    setPicked((prev) => [...prev, ...next]);
    // Pre-fill the batch owner from the folder a dropped tree came from.
    if (!ctx) {
      const top = (next[0]?.webkitRelativePath ?? "").split("/")[0] ?? "";
      if (top) { const o = detectOwner(top); if (o) setCtx(o); }
    }
  }

  async function sortNow() {
    if (!picked.length) return;
    const batchOwner = ctx;
    setRunning(true); setFinished(false); setTotal(picked.length); setDone(0); setRows([]);
    const collected: Row[] = [];
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      setCurrent(file.name);
      try {
        const prepared = await downscaleImage(file);
        const fd = new FormData();
        fd.set("file", prepared);
        const relPath = file.webkitRelativePath ?? "";
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
    router.refresh();
  }

  function saveToInbox() {
    if (!body.trim() && picked.length === 0) { toast("Add a message or some files.", { tone: "warn" }); return; }
    const fd = new FormData();
    if (subject.trim()) fd.set("subject", subject.trim());
    fd.set("body", body.trim());
    picked.forEach((f) => fd.append("file", f));
    startSave(async () => {
      const res = await createInboxBundle(fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Saved to inbox — it'll be sorted automatically.", { tone: "success" });
      resetAll(); setOpen(false); router.refresh();
    });
  }

  const filedRows = rows.filter((r) => r.ok && r.status === "filed");
  const reviewRows = rows.filter((r) => r.ok && r.status === "needs_review");
  const dupeRows = rows.filter((r) => r.ok && r.status === "duplicate");
  const failedRows = rows.filter((r) => !r.ok);
  const pct = total ? Math.round((done / total) * 100) : 0;

  function openRow(r: Row) {
    const id = r.status === "duplicate" ? r.duplicateOfId : r.id;
    if (!id) return;
    setOpen(false);
    router.push(`/documents?doc=${id}`);
  }
  const clickable = (r: Row) => Boolean(r.status === "duplicate" ? r.duplicateOfId : r.id);
  const allOwners = [...people.map((p) => ({ kind: "person" as const, id: p.id, name: p.name })), ...companies.map((c) => ({ kind: "company" as const, id: c.id, name: c.name }))];
  const input = "w-full rounded-lg border border-border bg-bg-subtle/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3.5 text-xs font-semibold text-fg transition-colors hover:bg-bg-muted">
        <Sparkles size={15} className="text-accent" /> Smart Add
      </button>
      <HrmsDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) resetAll(); }}
        width={620}
        title="Smart Add"
        sub="Drop files or a whole folder, and/or paste a message — then sort it now or save it to the inbox."
      >
        <input ref={fileInput} type="file" multiple className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv,image/*,application/pdf"
          onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ""; }} />
        <input ref={setFolderRef} type="file" multiple className="hidden"
          onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ""; }} />

        {!running && !finished && (
          <div className="space-y-3">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional) — e.g. Hanisha's documents" className={input} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Paste a WhatsApp / email message (optional) — name, passport no, address, contacts…" className={input} />

            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-bg-subtle/40 px-3 py-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">Mostly for</span>
              <select className="rounded-md border border-border bg-bg px-2 py-1 text-[12px]" value={ctx ? `${ctx.kind}:${ctx.id}` : ""}
                onChange={(e) => { const v = e.target.value; if (!v) { setCtx(null); return; } const [kind, id] = v.split(":"); const o = allOwners.find((x) => x.kind === kind && x.id === Number(id)); setCtx(o ?? null); }}>
                <option value="">— optional (auto-detected from folder) —</option>
                <optgroup label="People">{people.map((p) => <option key={`p${p.id}`} value={`person:${p.id}`}>{p.name}</option>)}</optgroup>
                <optgroup label="Companies">{companies.map((c) => <option key={`c${c.id}`} value={`company:${c.id}`}>{c.name}</option>)}</optgroup>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => fileInput.current?.click()}
                className="rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-7 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors">
                <UploadCloud size={22} className="mx-auto text-fg-subtle" />
                <div className="mt-1.5 text-sm font-medium">Choose files</div>
                <div className="text-[11px] text-fg-muted">many at once</div>
              </button>
              <button type="button" onClick={() => folderInput.current?.click()}
                className="rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-7 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors">
                <FolderUp size={22} className="mx-auto text-fg-subtle" />
                <div className="mt-1.5 text-sm font-medium">Choose a folder</div>
                <div className="text-[11px] text-fg-muted">subfolders → company/category</div>
              </button>
            </div>

            {picked.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-fg-muted">
                  <span>{picked.length} file{picked.length === 1 ? "" : "s"} selected</span>
                  <button type="button" onClick={() => setPicked([])} className="hover:text-danger">Clear</button>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {picked.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs rounded-lg bg-bg-subtle/50 px-2.5 py-1.5">
                      <Paperclip size={12} className="text-fg-subtle shrink-0" />
                      <span className="truncate flex-1">{f.webkitRelativePath || f.name}</span>
                      <button type="button" onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))} className="text-fg-muted hover:text-danger"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={saveToInbox} disabled={saving || (!body.trim() && picked.length === 0)}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />} Save to inbox
              </Button>
              <Button type="button" size="sm" onClick={sortNow} disabled={picked.length === 0}>
                <Sparkles size={13} /> Sort now
              </Button>
            </div>
            <p className="text-[11px] text-fg-subtle">
              <strong>Sort now</strong> reads + files each one immediately (folders route by company/category). <strong>Save to inbox</strong> stages it for the automatic sort. Duplicates go to Trash, anything unclear to Quarantine — nothing is filed to the wrong place.
            </p>
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success"><Check size={13} /> {filedRows.length} filed</span>
                {reviewRows.length > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-xs font-medium text-warn"><AlertTriangle size={13} /> {reviewRows.length} need a look</span>}
                {dupeRows.length > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-3 py-1 text-xs font-medium text-fg-muted"><Copy size={13} /> {dupeRows.length} duplicate</span>}
                {failedRows.length > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-medium text-danger"><FileX size={13} /> {failedRows.length} couldn’t read</span>}
              </div>
            )}

            {finished && (
              <div className="max-h-72 overflow-y-auto space-y-3">
                <ResultSection title="Filed" rows={filedRows} tone="success" icon={<Check size={12} />} onOpen={openRow} clickable={clickable} subFor={(r) => r.owner || "Filed"} />
                <ResultSection title="Needs a quick look" rows={reviewRows} tone="warn" icon={<AlertTriangle size={12} />} onOpen={openRow} clickable={clickable} subFor={(r) => [r.owner, r.reason].filter(Boolean).join(" · ") || "Needs a quick look"} />
                <ResultSection title="Duplicate → Trash" rows={dupeRows} tone="muted" icon={<Copy size={12} />} onOpen={openRow} clickable={clickable} subFor={(r) => r.reason || "Already on file"} />
                <ResultSection title="Couldn’t read" rows={failedRows} tone="danger" icon={<FileX size={12} />} onOpen={openRow} clickable={clickable} subFor={(r) => r.error || r.reason || "Couldn’t read this file"} />
              </div>
            )}

            {finished && (
              <div className="flex items-center justify-end gap-2">
                <Button type="button" onClick={resetAll}>Add more</Button>
                <button type="button" onClick={() => { setOpen(false); resetAll(); }} className="px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted">Close</button>
              </div>
            )}
          </div>
        )}
      </HrmsDialog>
    </>
  );
}

function ResultSection({
  title, rows, tone, icon, onOpen, clickable, subFor,
}: {
  title: string;
  rows: Row[];
  tone: "success" | "warn" | "muted" | "danger";
  icon: React.ReactNode;
  onOpen: (r: Row) => void;
  clickable: (r: Row) => boolean;
  subFor: (r: Row) => string;
}) {
  if (rows.length === 0) return null;
  const headTone = tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-fg-muted";
  const ringTone = tone === "success" ? "ring-success/25" : tone === "warn" ? "ring-warn/30" : tone === "danger" ? "ring-danger/30" : "ring-border/60";
  return (
    <div>
      <div className={`mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider ${headTone}`}>
        {icon} {title} <span className="text-fg-subtle">· {rows.length}</span>
      </div>
      <ul className={`rounded-xl ring-1 ${ringTone} divide-y divide-border/50`}>
        {rows.map((r, i) => {
          const can = clickable(r);
          const isBundle = (r.segmentCount ?? 0) > 1;
          return (
            <li key={i}>
              <button type="button" onClick={() => can && onOpen(r)} disabled={!can}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] ${can ? "hover:bg-bg-muted/50 cursor-pointer" : "cursor-default"}`}>
                <FileText size={13} className="shrink-0 text-fg-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.title || r.fileName}</span>
                  <span className="block truncate text-[11px] text-fg-muted">{subFor(r)}</span>
                  {isBundle && <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-accent"><Paperclip size={10} /> {r.segmentCount}-document bundle — open to split</span>}
                </span>
                {can && <span className="shrink-0 text-[10px] text-fg-subtle">Open</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
