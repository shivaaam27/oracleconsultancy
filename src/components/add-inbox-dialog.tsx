"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X, UploadCloud, Paperclip, Loader2 } from "lucide-react";
import { Button } from "./ui";
import { useToast } from "./toast";
import { createInboxBundle } from "@/app/inbox/actions";

/** Button + dialog to add a bundle (pasted text + multiple files) to the Inbox. */
export function AddInboxDialog() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() { setSubject(""); setBody(""); setFiles([]); }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  function submit() {
    if (!body.trim() && files.length === 0) { toast("Add some text or a file.", { tone: "warn" }); return; }
    const fd = new FormData();
    if (subject.trim()) fd.set("subject", subject.trim());
    fd.set("body", body.trim());
    files.forEach((f) => fd.append("file", f));
    start(async () => {
      const res = await createInboxBundle(fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Added to inbox.", { tone: "success" });
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  const input = "w-full rounded-lg border border-border bg-bg-subtle/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <Dialog.Trigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-accent text-accent-fg hover:opacity-90 transition-opacity">
          <Plus size={15} /> Add to inbox
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(560px,calc(100vw-2rem))] max-h-[88dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-bg-elev border border-border shadow-2xl outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div>
              <Dialog.Title className="text-sm font-semibold">Add to inbox</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-fg-muted">Paste what someone sent and attach their files — process it later.</Dialog.Description>
            </div>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle"><X size={14} /></Dialog.Close>
          </div>

          <div className="p-5 space-y-3">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional) — e.g. Hanisha's documents" className={input} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Paste the WhatsApp / email text here (name, passport no, address, contacts…)" className={input} />

            <div>
              <button type="button" onClick={() => fileInput.current?.click()}
                className="w-full rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-5 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors">
                <UploadCloud size={20} className="mx-auto text-fg-subtle" />
                <div className="mt-1 text-sm font-medium">Attach files</div>
                <div className="text-xs text-fg-muted">PDFs, photos/scans, Word, Excel — many at once</div>
              </button>
              <input ref={fileInput} type="file" multiple className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv,image/*,application/pdf"
                onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ""; }} />
              {files.length > 0 && (
                <div className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs rounded-lg bg-bg-subtle/50 px-2.5 py-1.5">
                      <Paperclip size={12} className="text-fg-subtle shrink-0" />
                      <span className="truncate flex-1">{f.name}</span>
                      <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-fg-muted hover:text-danger"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" size="sm" onClick={submit} disabled={pending}>
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add to inbox
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
