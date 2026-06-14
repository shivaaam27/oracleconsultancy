"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, UploadCloud, Paperclip, Loader2 } from "lucide-react";
import { Button } from "./ui";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
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
    <>
      <Button type="button" size="md" onClick={() => setOpen(true)}>
        <Plus size={15} /> Add to inbox
      </Button>
      <HrmsDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}
        width={560}
        title="Add to inbox"
        sub="Paste what someone sent and attach their files — process it later."
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" size="sm" onClick={submit} disabled={pending}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add to inbox
            </Button>
          </>
        }
      >
        <div className="space-y-3">
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
        </div>
      </HrmsDialog>
    </>
  );
}
