"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, Wand2, RotateCcw, ArrowRight } from "lucide-react";
import {
  proposeDocumentRenamesAction, applyDocumentRenamesAction, undoLastRenameSweepAction,
  type RenameProposal,
} from "@/app/documents/actions";
import { useToast } from "@/components/toast";

/** One-time "tidy names" sweep — review every proposed rename to the standard
 *  format, tick the ones to apply, and undo the last batch if needed. */
export function RenameSweepDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const { toast } = useToast();
  const [loading, startLoad] = useTransition();
  const [busy, startBusy] = useTransition();
  const [rows, setRows] = useState<RenameProposal[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) { setRows(null); setPicked(new Set()); return; }
    startLoad(async () => {
      const r = await proposeDocumentRenamesAction();
      setRows(r);
      setPicked(new Set(r.map((x) => x.id)));
    });
  }, [open]);

  function toggle(id: number) {
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function apply() {
    const items = (rows ?? []).filter((r) => picked.has(r.id)).map((r) => ({ id: r.id, title: r.proposed }));
    if (items.length === 0) return;
    startBusy(async () => {
      const res = await applyDocumentRenamesAction(items);
      toast(`Renamed ${res.count} document${res.count === 1 ? "" : "s"}.`, { tone: "success" });
      onDone?.();
      onClose();
    });
  }

  function undo() {
    startBusy(async () => {
      const res = await undoLastRenameSweepAction();
      toast(res.count ? `Reverted ${res.count} name${res.count === 1 ? "" : "s"}.` : "Nothing to undo.", { tone: "default" });
      onDone?.();
      onClose();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[61] -translate-x-1/2 -translate-y-1/2 w-[min(640px,calc(100vw-1.5rem))] max-h-[88dvh] flex flex-col overflow-hidden glass glass-refract rounded-2xl outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
            <Dialog.Title className="text-sm font-semibold inline-flex items-center gap-1.5"><Wand2 size={14} className="text-accent" /> Tidy document names</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle"><X size={14} /></button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <p className="text-[12px] text-fg-muted">Rename to the standard <b>Owner · Type · Ref/Year</b> format. Untick any you want to leave as they are.</p>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-muted"><Loader2 size={15} className="animate-spin" /> Finding documents to tidy…</div>
            ) : !rows || rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-fg-muted">Everything already follows the convention. 🎉</div>
            ) : (
              rows.map((r) => (
                <label key={r.id} className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-bg-subtle/30 p-2.5 cursor-pointer">
                  <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="mt-1 accent-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-fg-subtle line-through">{r.current}</span>
                    <span className="flex items-center gap-1.5 text-sm font-medium"><ArrowRight size={12} className="text-accent shrink-0" /> {r.proposed}</span>
                  </span>
                </label>
              ))
            )}
          </div>

          <div className="flex items-center gap-2 px-5 py-3 border-t border-border shrink-0">
            <button type="button" onClick={undo} disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition disabled:opacity-50">
              <RotateCcw size={13} /> Undo last sweep
            </button>
            <button type="button" onClick={apply} disabled={busy || !rows || picked.size === 0}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:opacity-90 transition disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Rename {picked.size > 0 ? picked.size : ""}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
