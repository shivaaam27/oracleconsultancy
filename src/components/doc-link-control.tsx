"use client";

import { useState, useTransition } from "react";
import { Paperclip, ExternalLink, X, Loader2 } from "lucide-react";
import { getDocumentFileLinkAction } from "@/app/documents/actions";
import { DocLinkPicker } from "./doc-link-picker";

export type LinkDoc = { id: number; title: string; companyId: number | null };

/**
 * Attach / open a supporting document on a pipeline case or commitment. Shows an
 * "Open" link when one is attached (signed URL), else a compact picker filtered
 * to the item's company. onLink persists the choice.
 */
export function DocLinkControl({
  documentId,
  documents,
  companyId,
  onLink,
}: {
  documentId: number | null;
  documents: LinkDoc[];
  companyId: number | null;
  onLink: (docId: number | null) => Promise<void>;
}) {
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);

  async function open() {
    if (!documentId) return;
    setBusy(true);
    const res = await getDocumentFileLinkAction(documentId);
    setBusy(false);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else alert(res.error);
  }

  if (documentId) {
    const doc = documents.find((d) => d.id === documentId);
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={open} disabled={busy} title={doc?.title ?? "Open document"}
          className="inline-flex items-center gap-1 rounded-md bg-bg-subtle px-1.5 py-0.5 text-xs text-fg-muted hover:bg-bg-muted">
          {busy ? <Loader2 size={10} className="animate-spin" /> : <ExternalLink size={10} />} Doc
        </button>
        <button type="button" title="Unlink" onClick={() => start(async () => { await onLink(null); })}
          className="rounded-md p-0.5 text-fg-subtle hover:text-danger"><X size={10} /></button>
      </span>
    );
  }

  // Documents relevant to this item: same company, or company-less.
  const choices = documents.filter((d) => companyId == null || d.companyId === companyId || d.companyId == null).slice(0, 200);
  return (
    <DocLinkPicker docs={choices} label="Attach" placeholder="Search documents…"
      onPick={(id) => start(async () => { await onLink(id); })} />
  );
}
