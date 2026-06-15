"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Scissors, Loader2 } from "lucide-react";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { Button } from "./ui";
import { useToast } from "./toast";
import { DOC_CATEGORIES } from "@/lib/documents-shared";
import {
  detectCompilationForDocumentAction,
  splitDocumentAction,
  type ExtractedSegment,
} from "@/app/documents/actions";

// One editable row in the split list — the detected segment plus whether to keep it.
type EditableSegment = ExtractedSegment & { include: boolean };

/**
 * Split a stored file that holds several documents into separate records, all
 * sharing the one file. Re-reads the file on open to propose the parts, then lets
 * the operator tidy each part's title/category and exclude any false splits before
 * committing (review-before-commit). Reuses HrmsDialog so it looks native.
 */
export function SplitDocumentDialog({
  documentId,
  fileName,
  open,
  onOpenChange,
  onDone,
}: {
  documentId: number;
  fileName?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [segments, setSegments] = useState<EditableSegment[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Scan the stored file fresh each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setScanning(true);
    setScanError(null);
    setSplitError(null);
    setSegments([]);
    (async () => {
      const res = await detectCompilationForDocumentAction(documentId);
      if (cancelled) return;
      if (!res.ok) {
        setScanError(res.error);
      } else {
        setSegments(res.segments.map((s) => ({ ...s, include: true })));
      }
      setScanning(false);
    })();
    return () => { cancelled = true; };
  }, [open, documentId]);

  function updateSegment(i: number, patch: Partial<EditableSegment>) {
    setSegments((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  const included = segments.filter((s) => s.include);

  async function doSplit() {
    if (included.length < 2) return;
    setSaving(true);
    setSplitError(null);
    // Strip the `include` flag back off — the action takes plain segments.
    const payload: ExtractedSegment[] = included.map(({ include: _include, ...seg }) => seg);
    const res = await splitDocumentAction(documentId, payload);
    setSaving(false);
    if (res.ok) {
      toast(`Split into ${payload.length} documents.`, { tone: "success" });
      onDone?.();
      router.refresh();
      onOpenChange(false);
    } else {
      setSplitError(res.error);
    }
  }

  const single = !scanning && !scanError && segments.length < 2;

  return (
    <HrmsDialog
      open={open}
      onOpenChange={onOpenChange}
      width={620}
      title="Split into separate documents"
      sub={fileName ?? undefined}
    >
      {scanning ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-fg-muted">
          <Loader2 size={20} className="animate-spin" />
          <p className="text-sm">Scanning the file for separate documents…</p>
        </div>
      ) : scanError ? (
        <div className="py-8 text-center space-y-4">
          <p className="text-sm text-danger">{scanError}</p>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      ) : single ? (
        <div className="py-8 text-center space-y-4">
          <p className="text-sm text-fg-muted">This file looks like a single document — there&rsquo;s nothing to split.</p>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">
            We found {segments.length} documents in this file. Tidy the title and type for each, untick any that don&rsquo;t belong, then split. All parts keep the same stored file.
          </p>
          <ul className="space-y-2.5">
            {segments.map((s, i) => {
              const owner = s.personName ?? s.companyName ?? "—";
              return (
                <li
                  key={i}
                  className="rounded-xl ring-1 ring-border bg-bg-subtle/40 px-3 py-2.5 space-y-2"
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={s.include}
                      onChange={(e) => updateSegment(i, { include: e.target.checked })}
                      className="mt-1.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
                      aria-label={`Include part ${i + 1}`}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        type="text"
                        value={s.title ?? ""}
                        onChange={(e) => updateSegment(i, { title: e.target.value })}
                        placeholder="Document title"
                        className="w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <select
                          value={s.category ?? ""}
                          onChange={(e) => updateSegment(i, { category: e.target.value || undefined })}
                          className="rounded-md border border-border bg-bg-subtle px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent/40"
                        >
                          <option value="">— Category</option>
                          {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <span className="text-fg-muted truncate">{owner}</span>
                        {s.pageRange && <span className="text-fg-subtle">p.{s.pageRange}</span>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {splitError && <p className="text-xs text-danger">{splitError}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={doSplit} disabled={saving || included.length < 2}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
              Split into {included.length} document{included.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </HrmsDialog>
  );
}
