"use client";

/**
 * The "+" card's Document tab (owner, 26 Sept 2026: "press full form, it should
 * let me upload immediately"). It used to say "the full form does the job" and
 * link to /files, where you then had to find Upload. Now the tab IS the upload:
 * tap to choose (a real tap, so the phone's file picker is allowed to open) or
 * drop files on it. They land in All files, exactly as Files' own Upload does —
 * same two steps: the bytes go straight to storage on a one-shot URL, then the
 * server files the record. "Check the details" opens it in Files, where the
 * reader fills in type, dates and reference for you to confirm.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Loader2, Upload } from "lucide-react";
import { uploadTicketAction, fileUploadAction } from "@/app/files/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/documents-shared";
import { cn } from "@/lib/cn";

type Item = { key: string; name: string; pct: number; state: "up" | "done" | "error"; error?: string; id?: number };

export function QuickDocumentPane({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);

  async function upload(list: File[]) {
    const fresh = list.map((f, i) => ({ f, key: `${Date.now()}-${i}` }));
    setItems((u) => [...u, ...fresh.map((x) => ({ key: x.key, name: x.f.name, pct: 0, state: "up" as const }))]);
    const set = (key: string, p: Partial<Item>) => setItems((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));
    let done = 0;
    for (const { f, key } of fresh) {
      if (f.size > MAX_UPLOAD_BYTES) { set(key, { state: "error", error: "Too large" }); continue; }
      if (f.size === 0) { set(key, { state: "error", error: "Empty file" }); continue; }
      const t = await uploadTicketAction(f.name).catch(() => ({ ok: false as const, error: "Couldn't start the upload" }));
      if (!t.ok) { set(key, { state: "error", error: t.error }); continue; }
      const ok = await new Promise<boolean>((resolve) => {
        const x = new XMLHttpRequest();
        x.open("PUT", t.signedUrl);
        x.setRequestHeader("content-type", f.type || "application/octet-stream");
        x.upload.onprogress = (e) => { if (e.lengthComputable) set(key, { pct: Math.round((e.loaded / e.total) * 96) }); };
        x.onload = () => resolve(x.status >= 200 && x.status < 300);
        x.onerror = () => resolve(false);
        x.send(f);
      });
      if (!ok) { set(key, { state: "error", error: "Upload failed — check the connection" }); continue; }
      const r = await fileUploadAction({ path: t.path, name: f.name, size: f.size, folderId: null }).catch(() => ({ ok: false as const, error: "Couldn't file it" }));
      if (!r.ok) { set(key, { state: "error", error: r.error }); continue; }
      set(key, { pct: 100, state: "done", id: r.id }); done++;
    }
    if (done) router.refresh();
  }

  const busy = items.some((i) => i.state === "up");
  const doneIds = items.filter((i) => i.state === "done" && i.id != null).map((i) => i.id!);

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => picker.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const l = [...e.dataTransfer.files]; if (l.length) void upload(l); }}
        className={cn("flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-5 py-6 text-center transition-colors",
          over ? "border-[var(--sh-fg)] bg-[var(--sh-hover)]" : "border-[var(--sh-chip-line)] bg-[var(--sh-card)] hover:bg-[var(--sh-hover)]")}>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--sh-on-bg)] text-[var(--sh-on-fg)]"><Upload size={18} /></span>
        <span className="text-[15px] font-medium">Choose files to upload</span>
        <span className="text-[12.5px] text-[var(--sh-sub)]">or drop them here · PDF, photos, Word, Excel · up to {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB each</span>
      </button>
      <input ref={picker} type="file" multiple hidden onChange={(e) => { const l = [...(e.target.files ?? [])]; e.target.value = ""; if (l.length) void upload(l); }} />

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-2.5 rounded-xl border border-[var(--sh-line)] bg-[var(--sh-card)] px-3 py-2 text-[13px]">
              {i.state === "up" ? <Loader2 size={14} className="shrink-0 animate-spin text-[var(--sh-sub)]" />
                : i.state === "done" ? <Check size={14} className="shrink-0 text-[#19C37D]" />
                : <CircleAlert size={14} className="shrink-0 text-[#E0479E]" />}
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              <span className="shrink-0 text-xs text-[var(--sh-sub)] tabular-nums">{i.state === "up" ? `${i.pct}%` : i.state === "done" ? "Uploaded" : i.error}</span>
            </li>
          ))}
        </ul>
      )}

      {doneIds.length > 0 && !busy && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[var(--sh-sub)]">
          <span>In All files. Open it to add the type, dates and who it belongs to — the reader fills them in for you to check.</span>
          <Link href={doneIds.length === 1 ? `/files?open=${doneIds[0]}` : "/files"} onClick={onClose} className="font-medium text-[var(--sh-fg)] hover:underline">
            {doneIds.length === 1 ? "Check the details" : "Open Files"}
          </Link>
        </div>
      )}
    </div>
  );
}
