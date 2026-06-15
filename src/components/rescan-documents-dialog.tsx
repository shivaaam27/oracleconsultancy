"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ScanLine, Check, AlertTriangle, FileX, Paperclip, Square, CalendarClock } from "lucide-react";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { Button } from "./ui";
import { useToast } from "./toast";
import { DocPreview } from "./doc-preview";
import {
  listRescanCompaniesAction,
  listRescanCandidatesAction,
  rescanDocumentAction,
  applyDocumentRescanAction,
  type RescanProposal,
  type RescanChange,
} from "@/app/documents/actions";

type Company = { id: number; name: string; count: number };

// A document that came back from the re-scan with proposed changes (or a bundle).
type ChangedDoc = Extract<RescanProposal, { ok: true }>;
// A document whose re-scan failed.
type FailedDoc = Extract<RescanProposal, { ok: false }>;

// The headline fix the owner cares about most — expiry corrections get a green
// emphasis so the old wrong-date bug is obvious at a glance.
function isExpiryFix(field: string) {
  return field === "expiryDate" || field === "expiryKind";
}

/**
 * "Re-scan documents" — re-reads a company's already-saved files with the improved
 * reader and PROPOSES fixes (you tick each one; nothing changes until you approve).
 * The big win is fixing wrong expiry dates stored by an old bug, plus filling blank
 * fields and spotting bundles that should be split. Runs one file at a time (these
 * are AI reads), with a progress bar and a Stop button. Reuses HrmsDialog so it
 * looks native.
 */
export function RescanDocumentsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();

  // Step 1: pick a company.
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState<Company | null>(null);

  // Step 2: the re-scan run.
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState<string>("");
  const [finished, setFinished] = useState(false);
  // A "stop requested" flag the loop checks between files.
  const [stopRequested, setStopRequested] = useState(false);

  // Results.
  const [changed, setChanged] = useState<ChangedDoc[]>([]);
  const [failed, setFailed] = useState<FailedDoc[]>([]);
  const [noChange, setNoChange] = useState(0);
  const [read, setRead] = useState(0);

  // Per-card UI state: which changes are ticked, preview open, and "updated" mark.
  const [ticked, setTicked] = useState<Record<number, Set<string>>>({});
  const [previewing, setPreviewing] = useState<Record<number, boolean>>({});
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<number>>(new Set());
  const [applyingId, setApplyingId] = useState<number | null>(null);

  // A tiny mutable handle so the Stop button can flip the running loop's local
  // flag. (A plain ref, not state — flipping it must not trigger a re-render.)
  const stopHandlerRef = useRef<(() => void) | null>(null);

  // Reset everything when the dialog opens, then load the company list.
  useEffect(() => {
    if (!open) return;
    setCompany(null);
    setRunning(false);
    setFinished(false);
    setStopRequested(false);
    setTotal(0);
    setDone(0);
    setCurrent("");
    setChanged([]);
    setFailed([]);
    setNoChange(0);
    setRead(0);
    setTicked({});
    setPreviewing({});
    setAppliedIds(new Set());
    setSkippedIds(new Set());
    setApplyingId(null);
    setLoadingCompanies(true);
    (async () => {
      const res = await listRescanCompaniesAction();
      setCompanies(res);
      setLoadingCompanies(false);
    })();
  }, [open]);

  // Re-scan every candidate for the chosen company, ONE AT A TIME (these are AI
  // reads — firing them all at once would hammer the model). Checks the stop flag
  // between files so the operator can halt a long run.
  async function runForCompany(c: Company) {
    setCompany(c);
    setRunning(true);
    setFinished(false);
    setStopRequested(false);
    setChanged([]);
    setFailed([]);
    setNoChange(0);
    setRead(0);
    setTicked({});
    setPreviewing({});
    setAppliedIds(new Set());
    setSkippedIds(new Set());
    setDone(0);
    setCurrent("");

    const candidates = await listRescanCandidatesAction(c.id);
    setTotal(candidates.length);

    let stop = false;
    const setStop = () => { stop = true; setStopRequested(true); };
    // Expose the live stop via a ref-like closure: we re-read the state setter's
    // intent through a local flag toggled by the Stop handler below.
    stopHandlerRef.current = setStop;

    const collectedChanged: ChangedDoc[] = [];
    const collectedFailed: FailedDoc[] = [];
    let noChangeCount = 0;
    let readCount = 0;

    for (let i = 0; i < candidates.length; i++) {
      if (stop) break;
      const cand = candidates[i];
      setCurrent(cand.fileName ?? cand.title);
      const res = await rescanDocumentAction(cand.id);
      readCount += 1;
      if (res.ok) {
        // Show it only if it has proposed changes OR looks like a bundle.
        if (res.changes.length > 0 || res.segments > 1) {
          collectedChanged.push(res);
          setChanged([...collectedChanged]);
          // Default every change ticked.
          setTicked((prev) => ({ ...prev, [res.id]: new Set(res.changes.map((ch) => ch.field)) }));
        } else {
          noChangeCount += 1;
        }
      } else {
        collectedFailed.push(res);
        setFailed([...collectedFailed]);
      }
      setRead(readCount);
      setNoChange(noChangeCount);
      setDone(i + 1);
    }

    stopHandlerRef.current = null;
    setRunning(false);
    setFinished(true);
    setCurrent("");
  }

  function toggleChange(docId: number, field: string) {
    setTicked((prev) => {
      const next = new Set(prev[docId] ?? []);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return { ...prev, [docId]: next };
    });
  }

  // Build the filtered patch from the ticked changes only and apply it.
  async function applyApproved(doc: ChangedDoc) {
    const chosen = ticked[doc.id] ?? new Set<string>();
    const fields = doc.changes.map((ch) => ch.field).filter((f) => chosen.has(f));
    if (fields.length === 0) {
      toast("Tick at least one change to apply.", { tone: "danger" });
      return;
    }
    const patch = Object.fromEntries(fields.map((k) => [k, doc.patch[k]]));
    setApplyingId(doc.id);
    const res = await applyDocumentRescanAction(doc.id, patch);
    setApplyingId(null);
    if (res.ok) {
      setAppliedIds((prev) => new Set(prev).add(doc.id));
      toast(`Updated “${doc.title}”.`, { tone: "success" });
      router.refresh();
    } else {
      toast(res.error, { tone: "danger" });
    }
  }

  function skip(doc: ChangedDoc) {
    setSkippedIds((prev) => new Set(prev).add(doc.id));
  }

  const pct = total ? Math.round((done / total) * 100) : 0;
  // Cards still awaiting a decision (not yet applied/skipped).
  const pending = changed.filter((d) => !appliedIds.has(d.id) && !skippedIds.has(d.id));

  return (
    <HrmsDialog
      open={open}
      onOpenChange={onOpenChange}
      width={680}
      title="Re-scan documents"
      sub="Re-reads your saved files with the improved reader and suggests fixes — nothing changes until you approve it."
    >
      {/* Step 1: choose a company (before a run is started). */}
      {!company && !running && !finished && (
        loadingCompanies ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-fg-muted">
            <Loader2 size={20} className="animate-spin" />
            <p className="text-sm">Finding documents to re-scan…</p>
          </div>
        ) : companies.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <ScanLine size={28} className="mx-auto text-fg-subtle" />
            <p className="text-sm text-fg-muted">No saved files to re-scan yet.</p>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">
              Pick a company. We&rsquo;ll re-read each of its saved files one at a time and list only the ones where the reader suggests a fix.
            </p>
            <ul className="space-y-1.5">
              {companies.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void runForCompany(c)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl ring-1 ring-border bg-bg-subtle/40 px-3 py-2.5 text-left hover:bg-bg-muted/50 transition-colors"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-fg">{c.name}</span>
                    <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted ring-1 ring-border">
                      {c.count} file{c.count === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {/* Step 2: the run — progress + results. */}
      {(running || finished) && (
        <div className="space-y-3">
          {/* Progress bar (mirrors the bulk-upload UX). */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[12px] text-fg-muted">
              <span>
                {running
                  ? `Reading ${done} of ${total}…`
                  : stopRequested
                    ? `Stopped — ${done} of ${total} read`
                    : `Done — ${total} re-read`}
              </span>
              <span className="tabular">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-bg-subtle overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            {running && current && (
              <p className="text-[11px] text-fg-subtle truncate">
                <Loader2 size={11} className="inline animate-spin mr-1" />{current}
              </p>
            )}
          </div>

          {/* Stop affordance while running. */}
          {running && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-fg-subtle truncate">{company?.name}</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { stopHandlerRef.current?.(); }}
                disabled={stopRequested}
              >
                <Square size={13} /> {stopRequested ? "Stopping…" : "Stop"}
              </Button>
            </div>
          )}

          {/* Tally once finished. */}
          {finished && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-3 py-1 text-xs font-medium text-fg-muted">
                <ScanLine size={13} /> {read} re-read
              </span>
              {changed.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-xs font-medium text-warn">
                  <AlertTriangle size={13} /> {changed.length} with suggestions
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
                <Check size={13} /> {noChange} already correct
              </span>
              {failed.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-medium text-danger">
                  <FileX size={13} /> {failed.length} couldn&rsquo;t re-read
                </span>
              )}
            </div>
          )}

          {/* No suggestions at all. */}
          {finished && changed.length === 0 && failed.length === 0 && (
            <div className="py-6 text-center">
              <Check size={26} className="mx-auto text-success" />
              <p className="mt-2 text-sm text-fg-muted">Everything looks right — no fixes to suggest.</p>
            </div>
          )}

          {/* The proposal cards. */}
          {changed.length > 0 && (
            <div className="space-y-2.5">
              {changed.map((doc) => {
                const isApplied = appliedIds.has(doc.id);
                const isSkipped = skippedIds.has(doc.id);
                const chosen = ticked[doc.id] ?? new Set<string>();
                const isBundle = doc.segments > 1;
                const busy = applyingId === doc.id;
                return (
                  <div
                    key={doc.id}
                    className={`rounded-xl ring-1 ring-border bg-bg-subtle/40 px-3 py-3 space-y-2.5 transition-opacity ${
                      isApplied || isSkipped ? "opacity-55" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg truncate">{doc.title}</p>
                        {doc.fileName && (
                          <button
                            type="button"
                            onClick={() => setPreviewing((p) => ({ ...p, [doc.id]: !p[doc.id] }))}
                            className="text-[11px] text-accent hover:underline"
                          >
                            {previewing[doc.id] ? "Hide file" : "Show file"}
                          </button>
                        )}
                      </div>
                      {isApplied ? (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-success">
                          <Check size={13} /> Updated
                        </span>
                      ) : isSkipped ? (
                        <span className="shrink-0 text-[11px] font-medium text-fg-subtle">Skipped</span>
                      ) : null}
                    </div>

                    {/* Inline file preview. */}
                    {doc.fileName && previewing[doc.id] && (
                      <DocPreview
                        documentId={doc.id}
                        fileName={doc.fileName}
                        defaultOpen
                        className="rounded-lg ring-1 ring-border bg-bg-elev/40 px-2.5 py-2"
                      />
                    )}

                    {/* Bundle hint — splitting lives in the documents table peek. */}
                    {isBundle && (
                      <div className="flex items-start gap-1.5 rounded-lg bg-accent/5 ring-1 ring-accent/20 px-2.5 py-2 text-[11px] text-accent">
                        <Paperclip size={12} className="mt-0.5 shrink-0" />
                        <span>Looks like {doc.segments} documents — open it from the list to split.</span>
                      </div>
                    )}

                    {/* The proposed changes — one ticked row each. */}
                    {doc.changes.length > 0 && (
                      <ul className="space-y-1.5">
                        {doc.changes.map((ch) => (
                          <ChangeRow
                            key={ch.field}
                            change={ch}
                            checked={chosen.has(ch.field)}
                            disabled={isApplied || isSkipped}
                            onToggle={() => toggleChange(doc.id, ch.field)}
                          />
                        ))}
                      </ul>
                    )}

                    {/* Per-card actions. */}
                    {!isApplied && !isSkipped && doc.changes.length > 0 && (
                      <div className="flex items-center justify-end gap-2 pt-0.5">
                        <Button type="button" variant="ghost" onClick={() => skip(doc)} disabled={busy}>
                          Skip
                        </Button>
                        <Button type="button" onClick={() => void applyApproved(doc)} disabled={busy}>
                          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          Apply approved
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Documents we couldn't re-read. */}
          {failed.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-danger">
                <FileX size={12} /> Couldn&rsquo;t re-read <span className="text-fg-subtle">· {failed.length}</span>
              </div>
              <ul className="rounded-xl ring-1 ring-danger/30 divide-y divide-border/50">
                {failed.map((f) => (
                  <li key={f.id} className="px-3 py-2 text-[12px]">
                    <span className="block truncate font-medium">{f.title || `Document #${f.id}`}</span>
                    <span className="block truncate text-[11px] text-fg-muted">{f.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer actions once finished. */}
          {finished && (
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCompany(null);
                  setFinished(false);
                  setChanged([]);
                  setFailed([]);
                  setNoChange(0);
                  setRead(0);
                  setTotal(0);
                  setDone(0);
                }}
              >
                Re-scan another company
              </Button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted"
              >
                Close{pending.length > 0 ? " — suggestions above" : ""}
              </button>
            </div>
          )}
        </div>
      )}
    </HrmsDialog>
  );
}

/** One "Label: old → new" row with a checkbox; expiry fixes get a green emphasis. */
function ChangeRow({
  change,
  checked,
  disabled,
  onToggle,
}: {
  change: RescanChange;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const expiry = isExpiryFix(change.field);
  return (
    <li
      className={`rounded-lg px-2.5 py-2 ring-1 ${
        expiry ? "ring-success/40 bg-success/5" : "ring-border bg-bg-elev/40"
      }`}
    >
      <label className={`flex items-start gap-2.5 ${disabled ? "" : "cursor-pointer"}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
          aria-label={`Apply change to ${change.label}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {expiry && <CalendarClock size={12} className="shrink-0 text-success" />}
            <span className={`text-[12px] font-medium ${expiry ? "text-success" : "text-fg"}`}>{change.label}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-fg-muted line-through decoration-fg-subtle/60">
              {change.old ?? "—"}
            </span>
            <span className="text-fg-subtle">→</span>
            <span className="font-medium text-fg">{change.new ?? "(blank)"}</span>
          </div>
        </div>
      </label>
    </li>
  );
}
