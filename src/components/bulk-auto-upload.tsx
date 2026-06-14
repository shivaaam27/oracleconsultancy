"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Check, AlertTriangle, Loader2, FileText, X } from "lucide-react";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { Button } from "./ui";
import { downscaleImage } from "@/lib/downscale-image";
import { autoFileDocumentAction, type AutoFileResult } from "@/app/documents/actions";

type Row = AutoFileResult & { fileName: string };

/**
 * Automatic bulk intake (transfer-pack 08/09): drop the whole pile, the AI reads
 * and files each one (matching the company by its TIN). You watch a progress bar;
 * the confident ones are filed automatically, and only the unsure ones are listed
 * at the end for a one-tap review. Nothing is ever lost.
 */
export function BulkAutoUpload({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone?: () => void }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (open) { setRunning(false); setTotal(0); setDone(0); setCurrent(""); setRows([]); setFinished(false); }
  }, [open]);

  async function run(files: File[]) {
    if (!files.length) return;
    setRunning(true); setFinished(false); setTotal(files.length); setDone(0); setRows([]);
    const collected: Row[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrent(file.name);
      try {
        const prepared = await downscaleImage(file);
        const fd = new FormData();
        fd.set("file", prepared);
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

  return (
    <HrmsDialog open={open} onOpenChange={onOpenChange} width={620} title="Add all documents"
      sub="Drop them all — the AI reads each one, files the confident ones automatically, and lists only the few that need a look.">
      <input ref={fileInput} type="file" multiple className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv,application/pdf"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (e.target) e.target.value = ""; if (fs.length) void run(fs); }} />

      {!running && !finished && (
        <button type="button" onClick={() => fileInput.current?.click()}
          className="w-full rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-12 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors">
          <UploadCloud size={26} className="mx-auto text-fg-subtle" />
          <div className="mt-2 text-sm font-medium">Choose all your documents</div>
          <div className="text-xs text-fg-muted">PDFs, photos/scans, Word, Excel — as many as you like, all at once</div>
        </button>
      )}

      {(running || finished) && (
        <div className="space-y-3">
          {/* Progress */}
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

          {/* Summary */}
          {finished && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success"><Check size={13} /> {filed} filed automatically</span>
              {review > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-xs font-medium text-warn"><AlertTriangle size={13} /> {review} need a quick look</span>}
            </div>
          )}

          {/* Per-file results */}
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
              <Button type="button" onClick={() => { setFinished(false); setRows([]); setTotal(0); setDone(0); }} >Add more</Button>
              <button type="button" onClick={() => onOpenChange(false)} className="px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted">Close{review > 0 ? " — review below" : ""}</button>
            </div>
          )}
        </div>
      )}

      {!running && !finished && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-fg-subtle"><X size={11} className="inline" /> Nothing is filed to the wrong place — unmatched docs are flagged for you to confirm.</p>
        </div>
      )}
    </HrmsDialog>
  );
}
