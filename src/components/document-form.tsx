"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Save, FilePlus, AlertCircle, Paperclip, X, Sparkles } from "lucide-react";
import { createDocumentAction, updateDocumentAction, extractDocumentFields } from "@/app/documents/actions";
import { DOC_CATEGORIES, DEFAULT_LEAD_DAYS, type DocumentRow } from "@/lib/documents-shared";
import { cn } from "@/lib/cn";

type Result = { ok: true; id?: number } | { ok: false; error: string };

// Date → "YYYY-MM-DD" for <input type="date"> (uses the stored UTC date).
function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function DocumentForm({
  mode,
  doc,
  companies,
  people,
  onComplete,
  onCancel,
  initialExtractText,
}: {
  mode: "create" | "edit";
  doc?: DocumentRow;
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  onComplete?: (res: Result) => void;
  onCancel?: () => void;
  /** When set (e.g. filing an Inbox item), pre-loads the auto-fill panel and runs extraction. */
  initialExtractText?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(doc?.category ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const [showExtract, setShowExtract] = useState(!!initialExtractText);
  const [extractText, setExtractText] = useState(initialExtractText ?? "");
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const autoRan = useRef(false);
  // Track whether the user has touched lead days, so changing category can
  // suggest a default without clobbering an explicit value.
  const [leadTouched, setLeadTouched] = useState(false);
  const [lead, setLead] = useState<string>(doc ? String(doc.reminderLeadDays) : "30");
  // File upload state.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [chosenFile, setChosenFile] = useState<string | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const hasExistingFile = !!doc?.storagePath && !removeExisting;

  const action = (fd: FormData) => {
    setError(null);
    start(async () => {
      const res = mode === "create" ? await createDocumentAction(fd) : await updateDocumentAction(doc!.id, fd);
      if (!res.ok) setError(res.error);
      onComplete?.(res);
    });
  };

  async function runExtract() {
    if (!extractText.trim()) return;
    setExtracting(true);
    setExtractNote(null);
    try {
      const res = await extractDocumentFields(extractText);
      const f = res.fields;
      const form = formRef.current;
      if (form) {
        const setVal = (name: string, val?: string) => {
          if (!val) return;
          const el = form.elements.namedItem(name) as HTMLInputElement | null;
          if (el) el.value = val;
        };
        setVal("title", f.title);
        setVal("docType", f.docType);
        setVal("issuer", f.issuer);
        setVal("referenceNo", f.referenceNo);
        setVal("issueDate", f.issueDate);
        setVal("expiryDate", f.expiryDate);
        if (f.category) {
          setCategory(f.category);
          if (!leadTouched && DEFAULT_LEAD_DAYS[f.category]) setLead(String(DEFAULT_LEAD_DAYS[f.category]));
        }
      }
      const filled = Object.values(f).filter(Boolean).length;
      setExtractNote(filled > 0
        ? `Filled ${filled} field${filled === 1 ? "" : "s"}${res.source === "rules" ? " (AI off — used basic rules)" : ""}. Check before saving.`
        : "Couldn't find document details in that text.");
    } finally {
      setExtracting(false);
    }
  }

  // When filing an Inbox item, run extraction automatically once.
  useEffect(() => {
    if (initialExtractText && !autoRan.current) {
      autoRan.current = true;
      runExtract();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialExtractText]);

  const inputCls = "w-full rounded-lg border border-border bg-bg-subtle/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
  const labelCls = "block text-[10px] uppercase tracking-wider text-fg-subtle mb-1";

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {/* AI auto-fill from pasted text (renewal email, certificate text). */}
      <div className="rounded-lg border border-dashed border-border bg-bg-subtle/40">
        <button type="button" onClick={() => setShowExtract((s) => !s)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg-muted hover:text-fg transition-colors">
          <Sparkles size={14} className="text-accent" />
          <span>Auto-fill from text</span>
          <span className="ml-auto text-xs text-fg-subtle">{showExtract ? "Hide" : "Paste an email or certificate"}</span>
        </button>
        {showExtract && (
          <div className="px-3 pb-3 space-y-2">
            <textarea value={extractText} onChange={(e) => setExtractText(e.target.value)} rows={4}
              className={inputCls} placeholder="Paste the renewal email or the text from the document…" />
            <div className="flex items-center gap-2">
              <button type="button" onClick={runExtract} disabled={extracting || !extractText.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50">
                {extracting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {extracting ? "Reading…" : "Extract details"}
              </button>
              {extractNote && <span className="text-xs text-fg-muted">{extractNote}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-2.5 grid-cols-2">
        <div className="col-span-2">
          <label className={labelCls}>Title <span className="text-danger">*</span></label>
          <input name="title" defaultValue={doc?.title ?? ""} required autoFocus={mode === "create"}
            className={inputCls} placeholder="e.g. Dar Spices Trade Licence" />
        </div>

        <div>
          <label className={labelCls}>Category</label>
          <select name="category" value={category}
            onChange={(e) => {
              const v = e.target.value;
              setCategory(v);
              if (!leadTouched && v && DEFAULT_LEAD_DAYS[v]) setLead(String(DEFAULT_LEAD_DAYS[v]));
            }}
            className={inputCls}>
            <option value="">—</option>
            {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Type</label>
          <input name="docType" defaultValue={doc?.docType ?? ""} className={inputCls}
            placeholder="e.g. Work Permit, TIN" />
        </div>

        <div>
          <label className={labelCls}>Company</label>
          <select name="companyId" defaultValue={doc?.companyId ? String(doc.companyId) : ""} className={inputCls}>
            <option value="">—</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Person (optional)</label>
          <select name="personId" defaultValue={doc?.personId ? String(doc.personId) : ""} className={inputCls}>
            <option value="">—</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Issuer</label>
          <input name="issuer" defaultValue={doc?.issuer ?? ""} className={inputCls}
            placeholder="e.g. BRELA, TRA" />
        </div>

        <div>
          <label className={labelCls}>Reference no.</label>
          <input name="referenceNo" defaultValue={doc?.referenceNo ?? ""} className={inputCls}
            placeholder="Document / certificate number" />
        </div>

        <div>
          <label className={labelCls}>Issue date</label>
          <input name="issueDate" type="date" defaultValue={toDateInput(doc?.issueDate)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Expiry date</label>
          <input name="expiryDate" type="date" defaultValue={toDateInput(doc?.expiryDate)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Remind me (days before)</label>
          <input name="reminderLeadDays" type="number" min={0} value={lead}
            onChange={(e) => { setLead(e.target.value); setLeadTouched(true); }}
            className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>File link (optional)</label>
          <input name="fileUrl" type="url" defaultValue={doc?.fileUrl ?? ""} className={inputCls}
            placeholder="Link to Drive / email" />
        </div>

        {/* Upload the actual file (PDF, photo, Word/Excel) into private storage. */}
        <div className="col-span-2">
          <label className={labelCls}>Upload file (optional)</label>
          {removeExisting && <input type="hidden" name="removeFile" value="1" />}
          <input ref={fileInputRef} name="file" type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx"
            onChange={(e) => setChosenFile(e.target.files?.[0]?.name ?? null)}
            className="hidden" />
          {chosenFile ? (
            <div className="flex items-center gap-2 text-sm rounded-lg border border-border bg-bg-subtle/60 px-3 py-2">
              <Paperclip size={14} className="text-accent shrink-0" />
              <span className="truncate flex-1">{chosenFile}</span>
              <button type="button" onClick={() => { setChosenFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="text-fg-muted hover:text-danger" title="Clear"><X size={14} /></button>
            </div>
          ) : hasExistingFile ? (
            <div className="flex items-center gap-2 text-sm rounded-lg border border-border bg-bg-subtle/60 px-3 py-2">
              <Paperclip size={14} className="text-fg-subtle shrink-0" />
              <span className="truncate flex-1">{doc?.fileName ?? "Attached file"}</span>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="text-xs text-accent hover:opacity-80">Replace</button>
              <button type="button" onClick={() => setRemoveExisting(true)}
                className="text-fg-muted hover:text-danger" title="Remove file"><X size={14} /></button>
            </div>
          ) : (
            <button type="button" onClick={() => { setRemoveExisting(false); fileInputRef.current?.click(); }}
              className="inline-flex items-center gap-1.5 text-sm rounded-lg border border-dashed border-border px-3 py-2 text-fg-muted hover:text-fg hover:border-accent/60 transition-colors w-full">
              <Paperclip size={14} /> Choose a file (max 20 MB)
            </button>
          )}
        </div>

        <div className="col-span-2">
          <label className={labelCls}>Notes</label>
          <textarea name="notes" defaultValue={doc?.notes ?? ""} rows={2} className={inputCls}
            placeholder="Renewal steps, who chases it, conditions…" />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 text-xs text-danger">
          <AlertCircle size={12} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={pending}
            className="px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-50">
            Cancel
          </button>
        )}
        <button type="submit" disabled={pending}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50")}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : mode === "create" ? <FilePlus size={13} /> : <Save size={13} />}
          {pending ? (mode === "create" ? "Saving…" : "Saving…") : mode === "create" ? "Add document" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
