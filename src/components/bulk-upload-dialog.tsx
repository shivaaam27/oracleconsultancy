"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { UploadCloud, X, Check, Plus } from "lucide-react";
import { Button } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { DocumentForm } from "./document-form";

/**
 * Bulk add: a queue that reviews each dropped file in the FULL DocumentForm
 * (pre-filled by extraction), so every field is captured and company/person/
 * both + new-person creation all work — same form as single add.
 */
export function BulkUploadDialog({
  open,
  onOpenChange,
  companies,
  people,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);

  // Fresh start every time the dialog opens (fixes stale data on reopen).
  useEffect(() => {
    if (open) { setFiles([]); setIndex(0); setDone(new Set()); }
  }, [open]);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  function advanceFrom(i: number): number | null {
    for (let j = i + 1; j < files.length; j++) if (!done.has(j)) return j;
    for (let j = 0; j < files.length; j++) if (!done.has(j) && j !== i) return j;
    return null;
  }

  function afterHandled(savedOk: boolean) {
    const nextDone = new Set(done);
    nextDone.add(index);
    setDone(nextDone);
    if (savedOk) onDone?.();
    // Move to the next unhandled file, or finish.
    const remaining = files.map((_, j) => j).filter((j) => !nextDone.has(j));
    if (remaining.length === 0) {
      toast(`Filed ${[...nextDone].length} file${nextDone.size === 1 ? "" : "s"} reviewed.`, { tone: "success" });
      onOpenChange(false);
      return;
    }
    setIndex(remaining[0]);
  }

  const allHandled = files.length > 0 && done.size >= files.length;
  const current = files[index];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(640px,calc(100vw-2rem))] max-h-[90dvh] -translate-x-1/2 -translate-y-1/2 flex flex-col overflow-hidden rounded-2xl bg-bg-elev border border-border shadow-2xl outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
            <div>
              <Dialog.Title className="text-sm font-semibold">Add several documents</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-fg-muted">
                {files.length === 0
                  ? "Pick several files — each is auto-read, then reviewed in the normal form."
                  : `Reviewing ${Math.min(done.size + 1, files.length)} of ${files.length}`}
              </Dialog.Description>
            </div>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle"><X size={14} /></Dialog.Close>
          </div>

          {/* Queue strip */}
          {files.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/70 px-4 py-2 shrink-0">
              {files.map((f, j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => !done.has(j) && setIndex(j)}
                  title={f.name}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] whitespace-nowrap ring-1 transition-colors",
                    done.has(j) ? "bg-success-soft/60 ring-success/30 text-success"
                      : j === index ? "bg-accent-soft ring-accent/40 text-accent"
                      : "bg-bg-subtle ring-border text-fg-muted hover:bg-bg-muted"
                  )}
                >
                  {done.has(j) && <Check size={11} />} {f.name.length > 18 ? f.name.slice(0, 16) + "…" : f.name}
                </button>
              ))}
              <button type="button" onClick={() => fileInput.current?.click()}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-fg-muted ring-1 ring-dashed ring-border hover:text-fg whitespace-nowrap">
                <Plus size={11} /> More
              </button>
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv,image/*,application/pdf"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ""; }}
          />

          <div className="flex-1 overflow-y-auto p-4">
            {files.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="w-full rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-10 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors"
              >
                <UploadCloud size={24} className="mx-auto text-fg-subtle" />
                <div className="mt-2 text-sm font-medium">Choose files to upload</div>
                <div className="text-xs text-fg-muted">PDFs, photos/scans, Word, Excel — many at once</div>
              </button>
            ) : allHandled || !current ? (
              <div className="py-10 text-center text-sm text-fg-muted">All files reviewed.</div>
            ) : (
              <DocumentForm
                key={`${index}-${current.name}`}
                mode="create"
                companies={companies}
                people={people}
                initialFile={current}
                submitLabel={advanceFrom(index) === null ? "Save & finish" : "Save & next"}
                cancelLabel="Skip"
                onCancel={() => afterHandled(false)}
                onComplete={(res) => { if (res.ok) afterHandled(true); }}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
