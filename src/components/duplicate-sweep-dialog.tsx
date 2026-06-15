"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CopyCheck, Fingerprint, Archive, FileText } from "lucide-react";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { Button } from "./ui";
import { useToast } from "./toast";
import { DocPreview } from "./doc-preview";
import {
  findExistingDuplicatesAction,
  backfillFileHashesAction,
  archiveDocumentAction,
  type DuplicateCluster,
} from "@/app/documents/actions";

const REASON_LABEL: Record<DuplicateCluster["reason"], string> = {
  "identical-file": "identical file",
  "same-reference": "same reference no.",
  "same-title": "same title",
};

/**
 * "Find duplicates" sweep — surfaces existing clusters of documents that look like
 * the same thing saved more than once, and lets the owner keep one copy and archive
 * the rest (kept as history, never deleted). A "Fingerprint old files" backfill
 * teaches the system to spot exact duplicates of older uploads too.
 */
export function DuplicateSweepDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [clusters, setClusters] = useState<DuplicateCluster[]>([]);
  // The chosen "keep" doc id per cluster (keyed by cluster.key).
  const [keepByCluster, setKeepByCluster] = useState<Record<string, number>>({});
  const [archivingKey, setArchivingKey] = useState<string | null>(null);
  // Backfill progress line + busy flag.
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState<string | null>(null);
  const [backfillRemaining, setBackfillRemaining] = useState(0);
  // Which document rows are currently previewing (by id).
  const [previewing, setPreviewing] = useState<Record<number, boolean>>({});

  async function load() {
    setLoading(true);
    const res = await findExistingDuplicatesAction();
    setClusters(res);
    // Default each cluster's keep choice to the suggested row.
    const defaults: Record<string, number> = {};
    for (const c of res) {
      const suggested = c.documents.find((d) => d.suggestKeep) ?? c.documents[0];
      if (suggested) defaults[c.key] = suggested.id;
    }
    setKeepByCluster(defaults);
    setLoading(false);
  }

  // Run the sweep fresh each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setBackfillNote(null);
    setBackfillRemaining(0);
    setPreviewing({});
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function runBackfill() {
    setBackfilling(true);
    const res = await backfillFileHashesAction();
    setBackfilling(false);
    if (!res.ok) {
      toast(res.error, { tone: "danger" });
      return;
    }
    setBackfillNote(`${res.hashed} done, ${res.remaining} left`);
    setBackfillRemaining(res.remaining);
    // If we fingerprinted anything new, the sweep may now find more exact dupes.
    if (res.hashed > 0) await load();
  }

  async function archiveOthers(cluster: DuplicateCluster) {
    const keepId = keepByCluster[cluster.key];
    const others = cluster.documents.filter((d) => d.id !== keepId);
    if (others.length === 0) return;
    setArchivingKey(cluster.key);
    let archived = 0;
    for (const d of others) {
      const res = await archiveDocumentAction(d.id, true);
      if (res.ok) archived += 1;
    }
    setArchivingKey(null);
    if (archived === 0) {
      toast("Couldn't archive those copies — please try again.", { tone: "danger" });
      return;
    }
    // Drop the resolved cluster from the list.
    setClusters((prev) => prev.filter((c) => c.key !== cluster.key));
    toast(
      `Archived ${archived} duplicate${archived === 1 ? "" : "s"} (kept as history).`,
      { tone: "success" }
    );
    router.refresh();
  }

  return (
    <HrmsDialog
      open={open}
      onOpenChange={onOpenChange}
      width={640}
      title="Find duplicates"
      sub="Spot copies of the same document and tidy up the extras"
    >
      {/* Improve detection — fingerprint older files so exact dupes of them show up too. */}
      <div className="rounded-xl ring-1 ring-border bg-bg-subtle/40 px-3 py-2.5 mb-3 space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-fg">Improve detection</p>
          <Button
            type="button"
            variant="secondary"
            onClick={runBackfill}
            disabled={backfilling}
          >
            {backfilling ? <Loader2 size={14} className="animate-spin" /> : <Fingerprint size={14} />}
            {backfillRemaining > 0 ? "Fingerprint more files" : "Fingerprint old files"}
          </Button>
        </div>
        <p className="text-[11px] text-fg-muted">
          Reads older saved files so the system can spot exact duplicates of them too.
          {backfillNote && <span className="ml-1 text-fg">{backfillNote}</span>}
        </p>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-fg-muted">
          <Loader2 size={20} className="animate-spin" />
          <p className="text-sm">Looking for duplicates…</p>
        </div>
      ) : clusters.length === 0 ? (
        <div className="py-10 text-center space-y-3">
          <CopyCheck size={28} className="mx-auto text-fg-subtle" />
          <p className="text-sm text-fg-muted">No duplicates found — your documents look tidy.</p>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">
            We found {clusters.length} possible duplicate{clusters.length === 1 ? "" : " sets"}.
            Pick the one copy to keep, then archive the rest — archived copies stay as history, nothing is deleted.
          </p>
          {clusters.map((cluster) => {
            const keepId = keepByCluster[cluster.key];
            const busy = archivingKey === cluster.key;
            const othersCount = cluster.documents.filter((d) => d.id !== keepId).length;
            return (
              <div
                key={cluster.key}
                className="rounded-xl ring-1 ring-border bg-bg-subtle/40 px-3 py-3 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg truncate">
                      {cluster.ownerLabel ?? "No owner"}
                    </p>
                    {cluster.category && (
                      <p className="text-xs text-fg-muted truncate">{cluster.category}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted ring-1 ring-border">
                    {REASON_LABEL[cluster.reason]}
                  </span>
                </div>

                <ul className="space-y-1.5">
                  {cluster.documents.map((d) => {
                    const isKeep = d.id === keepId;
                    return (
                      <li
                        key={d.id}
                        className={`rounded-lg px-2.5 py-2 ring-1 ${
                          isKeep ? "ring-accent/50 bg-accent/5" : "ring-border bg-bg-elev/40"
                        }`}
                      >
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`keep-${cluster.key}`}
                            checked={isKeep}
                            onChange={() => setKeepByCluster((prev) => ({ ...prev, [cluster.key]: d.id }))}
                            className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
                            aria-label={`Keep ${d.title}`}
                          />
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm text-fg truncate">{d.title}</span>
                              {d.suggestKeep && (
                                <span className="text-[11px] font-medium text-accent">✓ suggested keep</span>
                              )}
                              {d.needsReview && (
                                <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn ring-1 ring-warn/30">
                                  needs review
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-fg-muted">
                              {d.fileName ? (
                                <span className="inline-flex items-center gap-1 truncate">
                                  <FileText size={11} className="shrink-0" /> {d.fileName}
                                </span>
                              ) : (
                                <span className="italic">no file</span>
                              )}
                              {d.expiryLabel && <span>{d.expiryLabel}</span>}
                              {d.hasFile && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewing((prev) => ({ ...prev, [d.id]: !prev[d.id] }))
                                  }
                                  className="text-accent hover:underline"
                                >
                                  {previewing[d.id] ? "Hide" : "Preview"}
                                </button>
                              )}
                            </div>
                            {d.hasFile && previewing[d.id] && (
                              <DocPreview
                                documentId={d.id}
                                fileName={d.fileName}
                                defaultOpen
                                className="mt-1.5"
                              />
                            )}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    onClick={() => archiveOthers(cluster)}
                    disabled={busy || othersCount === 0}
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                    Archive the other{othersCount === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </HrmsDialog>
  );
}
