"use client";

// "Your documents" on the staff portal profile — a plain list of what is on file
// for this person, plus an upload. The required-document checklist and its score
// went with the rest of the compliance engine (Aug 2026): staff send files in,
// the administrator files them properly on /documents.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "./toast";
import { portalUploadDocument } from "@/app/portal/actions";
import { uploadDirect } from "@/lib/upload-direct";

export type PortalDocumentItem = {
  id: number;
  title: string;
  category: string | null;
  /** "Valid" | "Expiring" | "Expired" | "No expiry" — derived server-side. */
  status: string;
  expiryLabel: string | null;
};

const STATUS_TONE: Record<string, string> = {
  Valid: "bg-success-soft text-success",
  Expiring: "bg-warn-soft text-warn",
  Expired: "bg-danger-soft text-danger",
};

export function PortalDocuments({ items }: { items: PortalDocumentItem[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const input = useRef<HTMLInputElement | null>(null);

  function onPick(file: File | null) {
    if (!file) return;
    setBusy(true);
    startTransition(async () => {
      // Straight to storage, then hand the server just the path.
      const up = await uploadDirect(file);
      if (!up.ok) { setBusy(false); toast(up.error, { tone: "danger" }); return; }
      const res = await portalUploadDocument({ path: up.file.path, fileName: up.file.fileName });
      setBusy(false);
      if (input.current) input.current.value = "";
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Uploaded — your administrator will file it.", { tone: "success" });
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-bg-elev ring-1 ring-border">
      {items.length > 0 ? (
        <ul className="divide-y divide-border/50">
          {items.map((d) => (
            <li key={d.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
              <FileText size={15} className="shrink-0 text-fg-subtle" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{d.title}</div>
                {d.category && <div className="text-xs text-fg-subtle">{d.category}</div>}
              </div>
              {d.status !== "No expiry" && (
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[d.status] ?? "bg-bg-muted text-fg-muted")}>
                  {d.expiryLabel ?? d.status}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3.5 py-4 text-sm text-fg-muted">Nothing on file yet.</p>
      )}

      <div className="border-t border-border/50 p-2.5">
        <input
          ref={input}
          type="file"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {busy ? "Uploading…" : "Send a document"}
        </button>
      </div>
    </div>
  );
}
