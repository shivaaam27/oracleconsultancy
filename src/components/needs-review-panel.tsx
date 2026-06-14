"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Check, FileText, Loader2 } from "lucide-react";
import { confirmDocumentReviewAction } from "@/app/documents/actions";

export type ReviewDoc = {
  id: number;
  title: string;
  category: string | null;
  ownerName: string | null;
  needsOriginal: boolean;
};

/**
 * Needs-review queue (transfer-pack 08 step 5). Documents the AI scan wasn't
 * confident about — low confidence, or no company/person matched — wait here for
 * a one-tap confirm instead of being trusted silently. Confirming clears the flag.
 */
export function NeedsReviewPanel({ docs }: { docs: ReviewDoc[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);

  if (docs.length === 0) return null;

  function confirm(id: number) {
    setBusyId(id);
    start(async () => {
      await confirmDocumentReviewAction(id);
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="glass elevated rounded-2xl overflow-hidden ring-1 ring-warn/30">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <Inbox size={16} className="text-warn" />
        <span className="text-sm font-semibold">Needs review</span>
        <span className="text-xs text-fg-muted">{docs.length} document{docs.length === 1 ? "" : "s"} to confirm</span>
      </div>
      <ul className="divide-y divide-border/50">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-2.5 px-4 py-2.5">
            <FileText size={14} className="shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-fg truncate">{d.title}</span>
              <span className="block text-[11px] text-fg-muted truncate">
                {[d.category, d.ownerName ?? "no owner yet", d.needsOriginal ? "awaiting original" : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            <button
              type="button"
              onClick={() => router.push(`/documents?doc=${d.id}`)}
              className="rounded-lg px-2.5 py-1 text-[12px] text-fg-muted hover:bg-bg-muted/60"
            >
              Open
            </button>
            <button
              type="button"
              disabled={pending && busyId === d.id}
              onClick={() => confirm(d.id)}
              className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              {pending && busyId === d.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Confirm
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
