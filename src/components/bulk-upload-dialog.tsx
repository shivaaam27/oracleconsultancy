"use client";

// Bulk add — drop a pile of files into ONE company + category, let the AI read
// each one, check it, save it.
//
// The shape is deliberate (Aug 2026). You choose where the batch belongs BEFORE
// anything is read, so the model is never asked to guess an owner — that was the
// part that misfiled things. It reads the document's own details, fills the form,
// and stops. Nothing is saved until you press save on that file.

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, X, Check, Loader2, SkipForward, AlertTriangle, Sparkles, FileText } from "lucide-react";
import { useToast } from "./toast";
import { Button } from "./ui";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { Segmented } from "./macos";
import { cn } from "@/lib/cn";
import { DocumentForm } from "./document-form";
import { readDocumentFileAction } from "@/app/documents/read-actions";
import { discardUploadAction } from "@/app/documents/upload-actions";
import { uploadDirect } from "@/lib/upload-direct";
import { DOC_CATEGORIES, MAX_UPLOAD_BYTES } from "@/lib/documents-shared";
import type { ReadFields } from "@/lib/doc-read";

type Outcome = "saved" | "skipped" | "failed";
type OwnerMode = "company" | "person";
type Phase = "setup" | "queue" | "summary";

export function BulkUploadDialog({
  open,
  onOpenChange,
  companies,
  people,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  /** Fired after each save, so the library behind the dialog can refresh. */
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>("setup");
  const [ownerMode, setOwnerMode] = useState<OwnerMode>("company");
  const [companyId, setCompanyId] = useState<string>("");
  const [personId, setPersonId] = useState<string>("");
  const [category, setCategory] = useState<string>("");

  const [files, setFiles] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});

  // The current file's read.
  const [reading, setReading] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** Storage path of the file currently on screen (uploaded before it's read). */
  const [stagedPath, setStagedPath] = useState<string | null>(null);
  const [uploadFailed, setUploadFailed] = useState<string | null>(null);
  const [fields, setFields] = useState<ReadFields>({});
  const [readNote, setReadNote] = useState<string | null>(null);
  const [readSource, setReadSource] = useState<"typed" | "scan" | "none">("none");
  const [unsure, setUnsure] = useState(false);

  const current = files[index] ?? null;
  const ownerReady = ownerMode === "company" ? !!companyId : !!personId;

  function reset() {
    // Closing mid-queue leaves the file on screen staged in `uploads/` — bin it.
    if (stagedPath) void discardUploadAction(stagedPath);
    setPhase("setup");
    setFiles([]); setIndex(0); setOutcomes({});
    setFields({}); setReadNote(null); setReadSource("none"); setUnsure(false);
    setStagedPath(null); setUploading(false); setUploadFailed(null);
  }

  useEffect(() => { if (!open) reset(); }, [open]);

  /**
   * Upload the file at `i` straight to storage, then have the server read it
   * from there. Two steps on purpose: the bytes never cross a serverless
   * request body, so a big scan works. Never throws — a failed READ still
   * leaves the file uploaded and saveable, which is the important part.
   */
  const readAt = useCallback(async (i: number, list: File[]) => {
    const file = list[i];
    if (!file) return;
    setFields({}); setReadNote(null); setUnsure(false); setStagedPath(null); setUploadFailed(null);

    setUploading(true);
    const up = await uploadDirect(file);
    setUploading(false);
    if (!up.ok) {
      // The file never reached storage, so there is nothing to save. Show the
      // error instead of a form that would file an empty document.
      setUploadFailed(up.error);
      return;
    }
    setStagedPath(up.file.path);

    setReading(true);
    try {
      const res = await readDocumentFileAction({
        path: up.file.path,
        fileName: up.file.fileName,
        mimeType: up.file.mimeType,
      });
      setFields(res.ok ? res.fields : {});
      setReadSource(res.source);
      setUnsure(res.ok && res.confidence != null && res.confidence < 0.75);
      setReadNote(res.ok ? null : res.note ?? "Couldn't read this one — fill it in yourself.");
    } catch {
      setFields({});
      setReadNote("Couldn't read this one — fill it in yourself.");
    } finally {
      setReading(false);
    }
  }, []);

  function pickFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const all = Array.from(picked);
    const tooBig = all.filter((f) => f.size > MAX_UPLOAD_BYTES);
    const ok = all.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (tooBig.length) {
      toast(`${tooBig.length} file${tooBig.length === 1 ? " was" : "s were"} over ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB and skipped.`, { tone: "warn" });
    }
    if (!ok.length) return;
    setFiles(ok);
    setIndex(0);
    setPhase("queue");
    void readAt(0, ok);
  }

  function advance(outcome: Outcome) {
    // A skipped/failed file leaves an orphan in `uploads/` — bin it.
    if (outcome !== "saved" && stagedPath) void discardUploadAction(stagedPath);
    setStagedPath(null);
    setOutcomes((o) => ({ ...o, [index]: outcome }));
    const next = index + 1;
    if (next >= files.length) { setPhase("summary"); return; }
    setIndex(next);
    void readAt(next, files);
  }

  const counts = {
    saved: Object.values(outcomes).filter((o) => o === "saved").length,
    skipped: Object.values(outcomes).filter((o) => o === "skipped").length,
    failed: Object.values(outcomes).filter((o) => o === "failed").length,
  };
  const ownerLabel =
    ownerMode === "company"
      ? companies.find((c) => String(c.id) === companyId)?.name ?? "—"
      : people.find((p) => String(p.id) === personId)?.name ?? "—";

  const field = "mt-1 w-full rounded-lg bg-bg-subtle/60 px-3 py-2 text-sm ring-1 ring-border/60 focus:outline-none focus:ring-accent";

  return (
    <HrmsDialog open={open} onOpenChange={onOpenChange} width={880} title="Add several documents">
      {/* ── 1. Where does this batch go? ─────────────────────────── */}
      {phase === "setup" && (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Choose where this batch belongs first. Every file you drop is filed there, and the
            AI only reads the document&apos;s own details — it never picks the owner.
          </p>

          <div>
            <span className="block text-xs text-fg-muted">These documents belong to</span>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Segmented
                value={ownerMode}
                onChange={(v) => setOwnerMode(v)}
                options={[{ value: "company", label: "A company" }, { value: "person", label: "A person" }]}
              />
              {ownerMode === "company" ? (
                <select aria-label="Company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                  className="flex-1 rounded-lg bg-bg-subtle/60 px-3 py-2 text-sm ring-1 ring-border/60 focus:outline-none focus:ring-accent">
                  <option value="">Choose a company…</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <select aria-label="Person" value={personId} onChange={(e) => setPersonId(e.target.value)}
                  className="flex-1 rounded-lg bg-bg-subtle/60 px-3 py-2 text-sm ring-1 ring-border/60 focus:outline-none focus:ring-accent">
                  <option value="">Choose a person…</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-fg-muted" htmlFor="bulk-category">Category</label>
            <select id="bulk-category" value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
              <option value="">Choose a category…</option>
              {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => pickFiles(e.target.files)} />
          <button
            type="button"
            disabled={!ownerReady || !category}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (ownerReady && category) pickFiles(e.dataTransfer.files); }}
            className={cn(
              "flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-sm transition-colors",
              ownerReady && category
                ? "border-border text-fg-muted hover:border-accent/60 hover:text-fg"
                : "cursor-not-allowed border-border/50 text-fg-subtle",
            )}
          >
            <UploadCloud size={22} />
            <span>{ownerReady && category ? "Drop your files here, or click to choose them" : "Pick the owner and category first"}</span>
            <span className="text-xs text-fg-subtle">PDF, Word, Excel, or photos · up to {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB each</span>
          </button>
        </div>
      )}

      {/* ── 2. One file at a time ────────────────────────────────── */}
      {phase === "queue" && current && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-bg-subtle/50 px-3 py-2 text-xs">
            <FileText size={13} className="shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1 truncate font-medium">{current.name}</span>
            <span className="shrink-0 text-fg-muted">{index + 1} of {files.length}</span>
            <span className="shrink-0 text-fg-subtle">→ {ownerLabel} · {category}</span>
          </div>

          {uploading || reading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-fg-muted">
              <Loader2 size={20} className="animate-spin text-accent" />
              {uploading ? "Uploading…" : "Reading this document…"}
              <span className="text-xs text-fg-subtle">
                {uploading ? "Large scans take a moment to send." : "A scan takes a little longer than a typed file."}
              </span>
            </div>
          ) : uploadFailed ? (
            <div className="space-y-3 py-8 text-center">
              <AlertTriangle size={20} className="mx-auto text-danger" />
              <p className="text-sm text-danger">{uploadFailed}</p>
              <p className="text-xs text-fg-muted">This file wasn&apos;t uploaded, so there is nothing to save.</p>
              <Button type="button" variant="ghost" onClick={() => advance("failed")}>
                Skip and carry on
              </Button>
            </div>
          ) : (
            <>
              {readNote ? (
                <p className="flex items-start gap-1.5 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {readNote}
                </p>
              ) : (
                <p className="flex items-center gap-1.5 px-1 text-xs text-fg-subtle">
                  <Sparkles size={12} className={unsure ? "text-warn" : "text-accent"} />
                  {unsure
                    ? "Read, but the AI wasn't confident — please check every field."
                    : `Filled in from the ${readSource === "scan" ? "scan" : "file"}. Check it, then save.`}
                </p>
              )}

              <DocumentForm
                key={index}
                mode="create"
                companies={companies}
                people={people}
                initialFile={current}
                initialStoragePath={stagedPath ?? undefined}
                initialCompanyId={ownerMode === "company" ? Number(companyId) : null}
                initialPersonId={ownerMode === "person" ? Number(personId) : null}
                initialCategory={category}
                initialTitle={current.name.replace(/\.[^.]+$/, "")}
                initialFields={fields}
                submitLabel={index + 1 === files.length ? "Save & finish" : "Save & next"}
                cancelLabel="Skip this one"
                onCancel={() => advance("skipped")}
                onComplete={(res) => {
                  if (res.ok) { onDone?.(); advance("saved"); }
                  else advance("failed");
                }}
              />
            </>
          )}

          <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs text-fg-subtle">
            <span>{counts.saved} saved · {counts.skipped} skipped{counts.failed ? ` · ${counts.failed} failed` : ""}</span>
            <button type="button" onClick={() => advance("skipped")} className="inline-flex items-center gap-1 hover:text-fg">
              <SkipForward size={12} /> Skip
            </button>
          </div>
        </div>
      )}

      {/* ── 3. Done ──────────────────────────────────────────────── */}
      {phase === "summary" && (
        <div className="space-y-4 py-4 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
            <Check size={22} />
          </div>
          <div>
            <p className="text-sm font-medium">
              {counts.saved} document{counts.saved === 1 ? "" : "s"} saved to {ownerLabel}
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {counts.skipped ? `${counts.skipped} skipped. ` : ""}
              {counts.failed ? `${counts.failed} didn't save. ` : ""}
              Filed under {category}.
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <Button type="button" variant="ghost" onClick={reset}>Add another batch</Button>
            <Button type="button" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </div>
      )}

      {phase === "setup" && (
        <button type="button" onClick={() => onOpenChange(false)} className="sr-only">
          <X size={14} /> Close
        </button>
      )}
    </HrmsDialog>
  );
}
