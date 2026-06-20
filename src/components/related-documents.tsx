"use client";

import { useEffect, useState, useTransition } from "react";
import { Link2, ExternalLink, Loader2 } from "lucide-react";
import { getRelatedDocumentsAction, getDocumentFileLinkAction, type RelatedDoc } from "@/app/documents/actions";

/** "This relates to…" — documents the system has correlated with this one (shared
 *  reference number, renewal lineage, same file, shared ID, same owner+type). */
export function RelatedDocuments({ documentId }: { documentId: number }) {
  const [rows, setRows] = useState<RelatedDoc[] | null>(null);
  const [loading, startLoad] = useTransition();
  const [opening, startOpen] = useTransition();

  useEffect(() => {
    startLoad(async () => { setRows(await getRelatedDocumentsAction(documentId)); });
  }, [documentId]);

  function open(id: number) {
    startOpen(async () => {
      const res = await getDocumentFileLinkAction(id);
      if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  if (loading && rows === null) {
    return <p className="text-[11px] text-fg-subtle inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Finding related documents…</p>;
  }
  if (!rows || rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/70 bg-bg-subtle/30 p-3 space-y-1.5">
      <p className="inline-flex items-center gap-1.5 text-[12px] font-medium"><Link2 size={13} className="text-accent" /> Related documents</p>
      <ul className="divide-y divide-border/50">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 py-1.5">
            <button type="button" onClick={() => open(r.id)} disabled={opening}
              className="min-w-0 flex-1 text-left truncate text-sm hover:text-accent hover:underline transition-colors disabled:opacity-50">
              {r.title}
            </button>
            <span className="shrink-0 text-[10px] text-fg-subtle">{r.reason}</span>
            <ExternalLink size={12} className="shrink-0 text-fg-subtle" />
          </li>
        ))}
      </ul>
    </div>
  );
}
