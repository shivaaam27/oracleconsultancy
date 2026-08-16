"use client";

// The document form — add or edit (Aug 2026).
//
// Added by hand: attach the file, choose who it belongs to, pick a category,
// type the dates. Nothing is inferred from the file name and nothing is filed
// on your behalf.
//
// `initialFields` is the one exception, and it is opt-in: the bulk-add flow
// reads a file with the AI and passes what it found so the fields arrive
// pre-filled. They are ordinary editable values — you check them and press
// save. Nothing reaches the database until you do.

import { useRef, useState, useTransition } from "react";
import { Loader2, Save, FilePlus, AlertCircle, X, Upload, Link2, Paperclip } from "lucide-react";
import { createDocumentAction, updateDocumentAction } from "@/app/documents/actions";
import { DocPreview } from "@/components/doc-preview";
import {
  DOC_CATEGORIES,
  DEFAULT_LEAD_DAYS,
  MAX_UPLOAD_BYTES,
  type DocumentRow,
} from "@/lib/documents-shared";
import { Button, Select } from "@/components/ui";
import { Segmented } from "@/components/macos";
import { submitOnEnterKeyDown, EnterHint } from "@/components/form-keys";
import { uploadDirect } from "@/lib/upload-direct";

type CaptureMode = "upload" | "link";
type OwnerMode = "company" | "person";

type Result = { ok: true; id?: number } | { ok: false; error: string };

// Date → "YYYY-MM-DD" for <input type="date"> (uses the stored UTC date).
function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

const LEAD_CHOICES = [0, 14, 30, 60, 90, 180];

/* Layout only. The BOX — white fill, hairline, radius, focus ring — comes from
   the one field rule in globals.css, so every input in the app matches. This
   constant used to redraw it as a tinted well with its own ring, which is why
   this form looked unlike the rest. */
const FIELD = "mt-1 w-full px-3 py-2 text-sm";

export function DocumentForm({
  mode,
  doc,
  companies,
  people,
  onComplete,
  onCancel,
  initialCompanyId,
  initialPersonId,
  initialCategory,
  initialTitle,
  initialVendorId,
  initialFile,
  initialStoragePath,
  initialFields,
  submitLabel,
  cancelLabel,
}: {
  mode: "create" | "edit";
  doc?: DocumentRow;
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  onComplete?: (res: Result) => void;
  onCancel?: () => void;
  initialCompanyId?: number | null;
  initialPersonId?: number | null;
  initialCategory?: string | null;
  initialTitle?: string;
  /** When set (e.g. adding a vendor contract), links the document to a vendor. */
  initialVendorId?: number | null;
  /** A file to attach on mount (used by the bulk-add queue). */
  initialFile?: File;
  /** The bulk queue has ALREADY uploaded this file to storage — reuse that
   *  object instead of sending the bytes up a second time. */
  initialStoragePath?: string;
  /** Values read off the file by the AI, pre-filled for the owner to check.
   *  Suggestions only — nothing is saved until the owner presses save. */
  initialFields?: {
    docType?: string | null;
    issuer?: string | null;
    referenceNo?: string | null;
    issueDate?: string | null;
    expiryDate?: string | null;
    notes?: string | null;
  };
  /** Override the submit / cancel button text (e.g. "Save & next" / "Skip"). */
  submitLabel?: string;
  cancelLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [capture, setCapture] = useState<CaptureMode>(
    doc?.fileUrl && !doc?.storagePath ? "link" : "upload"
  );
  const [owner, setOwner] = useState<OwnerMode>(
    doc?.personId || initialPersonId ? "person" : "company"
  );
  const [category, setCategory] = useState<string>(doc?.category ?? initialCategory ?? "");
  const [lead, setLead] = useState<number>(
    doc?.reminderLeadDays ?? (initialCategory ? DEFAULT_LEAD_DAYS[initialCategory] ?? 30 : 30)
  );
  // A category change re-suggests that category's default warning window, but
  // only while the owner hasn't picked one themselves.
  const [leadTouched, setLeadTouched] = useState(false);

  const existingFileName = doc?.fileName ?? null;

  function pickCategory(next: string) {
    setCategory(next);
    if (!leadTouched) setLead(next ? DEFAULT_LEAD_DAYS[next] ?? 30 : 30);
  }

  function onFile(f: File | null) {
    setError(null);
    if (f && f.size > MAX_UPLOAD_BYTES) {
      setError(`That file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    setFile(f);
  }

  function submit(fd: FormData) {
    setError(null);
    // The owner toggle decides which side is saved — a document belongs to a
    // company OR a person, never both.
    if (owner === "company") fd.set("personId", "");
    else fd.set("companyId", "");
    fd.delete("file"); // bytes never travel in the action — see upload-direct.ts

    start(async () => {
      // Put the file in storage FIRST, straight from the browser, then hand the
      // action only its path. A 20 MB scan is fine; the old way died at 4.5 MB.
      if (file && !initialStoragePath) {
        setUploading(true);
        const up = await uploadDirect(file);
        setUploading(false);
        if (!up.ok) { setError(up.error); return; }
        fd.set("storagePath", up.file.path);
        fd.set("storageFileName", up.file.fileName);
      } else if (initialStoragePath && file) {
        fd.set("storagePath", initialStoragePath);
        fd.set("storageFileName", file.name);
      }

      const res = mode === "edit" && doc
        ? await updateDocumentAction(doc.id, fd)
        : await createDocumentAction(fd);
      if (!res.ok) { setError(res.error); return; }
      onComplete?.(res);
      if (mode === "create") {
        formRef.current?.reset();
        setFile(null);
        setCategory("");
        setLead(30);
        setLeadTouched(false);
      }
    });
  }

  return (
    <form ref={formRef} action={submit} className="space-y-4">
      {initialVendorId != null && <input type="hidden" name="vendorId" value={initialVendorId} />}

      {/* ── The file ─────────────────────────────────────────────── */}
      <div className="rounded-xl p-3 ring-1 ring-border/60">
        <Segmented
          value={capture}
          onChange={(v) => setCapture(v)}
          options={[
            { value: "upload", label: "Upload a file", icon: <Upload size={13} /> },
            { value: "link", label: "Link to it", icon: <Link2 size={13} /> },
          ]}
        />

        {capture === "upload" ? (
          <div className="mt-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex items-center gap-2 rounded-lg bg-bg-subtle/60 px-3 py-2 text-sm">
                <Paperclip size={14} className="text-fg-muted" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button type="button" onClick={() => onFile(null)} className="text-fg-muted hover:text-fg" aria-label="Remove file">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0] ?? null); }}
                className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-fg-muted transition-colors hover:border-accent/60 hover:text-fg"
              >
                <Upload size={18} />
                <span>Drop a file here, or click to choose one</span>
                {existingFileName && (
                  <span className="text-xs text-fg-subtle">Currently attached: {existingFileName}</span>
                )}
              </button>
            )}
            {file && <div className="mt-3"><DocPreview file={file} /></div>}
          </div>
        ) : (
          <div className="mt-3">
            <label className="block text-xs text-fg-muted" htmlFor="doc-file-url">Link to the file</label>
            <input
              id="doc-file-url"
              name="fileUrl"
              type="url"
              defaultValue={doc?.fileUrl ?? ""}
              placeholder="https://drive.google.com/…"
              className={FIELD}
            />
          </div>
        )}
      </div>

      {/* ── The details ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs text-fg-muted" htmlFor="doc-title">Title</label>
          <input
            id="doc-title"
            name="title"
            required
            defaultValue={doc?.title ?? initialTitle ?? ""}
            placeholder="Business Licence 2026"
            className={FIELD}
          />
        </div>

        <div className="sm:col-span-2">
          <span className="block text-xs text-fg-muted">Belongs to</span>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Segmented
              value={owner}
              onChange={(v) => setOwner(v)}
              options={[
                { value: "company", label: "A company" },
                { value: "person", label: "A person" },
              ]}
            />
            {owner === "company" ? (
              <Select wrapperClassName="flex-1"
        name="companyId"
        aria-label="Company"
        defaultValue={String(doc?.companyId ?? initialCompanyId ?? "")}
        
       >
                <option value="">Choose a company…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            ) : (
              <Select wrapperClassName="flex-1"
        name="personId"
        aria-label="Person"
        defaultValue={String(doc?.personId ?? initialPersonId ?? "")}
        
       >
                <option value="">Choose a person…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs text-fg-muted" htmlFor="doc-category">Category</label>
          <Select id="doc-category" name="category" value={category} onChange={(e) => pickCategory(e.target.value)} className={FIELD}>
            <option value="">Choose a category…</option>
            {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>

        <div>
          <label className="block text-xs text-fg-muted" htmlFor="doc-type">Type</label>
          <input id="doc-type" name="docType" defaultValue={doc?.docType ?? initialFields?.docType ?? ""} placeholder="Trade Licence" className={FIELD} />
        </div>

        <div>
          <label className="block text-xs text-fg-muted" htmlFor="doc-issuer">Issued by</label>
          <input id="doc-issuer" name="issuer" defaultValue={doc?.issuer ?? initialFields?.issuer ?? ""} placeholder="BRELA" className={FIELD} />
        </div>

        <div>
          <label className="block text-xs text-fg-muted" htmlFor="doc-ref">Reference no.</label>
          <input id="doc-ref" name="referenceNo" defaultValue={doc?.referenceNo ?? initialFields?.referenceNo ?? ""} placeholder="4471209" className={FIELD} />
        </div>

        <div>
          <label className="block text-xs text-fg-muted" htmlFor="doc-issued">Issue date</label>
          <input id="doc-issued" name="issueDate" type="date" defaultValue={toDateInput(doc?.issueDate) || (initialFields?.issueDate ?? "")} className={FIELD} />
        </div>

        <div>
          <label className="block text-xs text-fg-muted" htmlFor="doc-expiry">Expiry date</label>
          <input id="doc-expiry" name="expiryDate" type="date" defaultValue={toDateInput(doc?.expiryDate) || (initialFields?.expiryDate ?? "")} className={FIELD} />
        </div>

        <div>
          <label className="block text-xs text-fg-muted" htmlFor="doc-lead">Warn me before</label>
          <Select
            id="doc-lead"
            name="reminderLeadDays"
            value={String(lead)}
            onChange={(e) => { setLead(parseInt(e.target.value, 10)); setLeadTouched(true); }}
            className={FIELD}
          >
            {LEAD_CHOICES.map((n) => (
              <option key={n} value={n}>{n === 0 ? "No warning" : `${n} days`}</option>
            ))}
          </Select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs text-fg-muted" htmlFor="doc-notes">Notes</label>
          <textarea
            id="doc-notes"
            name="notes"
            rows={2}
            defaultValue={doc?.notes ?? initialFields?.notes ?? ""}
            onKeyDown={submitOnEnterKeyDown}
            placeholder="Optional"
            className={`${FIELD} resize-y`}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 text-xs text-danger">
          <AlertCircle size={12} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <EnterHint className="mr-auto" verb={mode === "create" ? "add" : "save"} />
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-muted hover:text-fg disabled:opacity-50">
            {cancelLabel ?? "Cancel"}
          </button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : mode === "create" ? <FilePlus size={13} /> : <Save size={13} />}
          {uploading ? "Uploading…" : pending ? "Saving…" : submitLabel ?? (mode === "create" ? "Add document" : "Save changes")}
        </Button>
      </div>
    </form>
  );
}
