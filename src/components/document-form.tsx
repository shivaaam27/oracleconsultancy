"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Save, FilePlus, AlertCircle, Paperclip, X, Sparkles, Upload, Link2, Type, UserPlus } from "lucide-react";
import { createDocumentAction, updateDocumentAction, extractDocumentFields, extractDocumentFromFile, findOwnerDocuments, archiveDocumentAction, type ExtractedFields, type OwnerDocMatch } from "@/app/documents/actions";
import { createPerson, enrichPersonProfile, type PersonProfileFields } from "@/app/people/actions";
import { enrichCompanyProfile, type CompanyProfileFields } from "@/app/companies/[id]/actions";
import { DOC_CATEGORIES, DEFAULT_LEAD_DAYS, type DocumentRow } from "@/lib/documents-shared";
import { Segmented } from "@/components/macos";
import { submitOnEnterKeyDown, EnterHint } from "@/components/form-keys";
import { cn } from "@/lib/cn";

type CaptureMode = "upload" | "link" | "text";
type OwnerMode = "company" | "person" | "both";

// Downscale large images client-side so they fit Groq's 4 MB base64 limit.
async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= 3.5 * 1024 * 1024) return file;
  try {
    const img = await createImageBitmap(file);
    const maxDim = 2000;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

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
  initialCompanyId,
  initialPersonId,
  initialCategory,
  initialTitle,
  initialVendorId,
  initialFile,
  submitLabel,
  cancelLabel,
}: {
  mode: "create" | "edit";
  doc?: DocumentRow;
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  onComplete?: (res: Result) => void;
  onCancel?: () => void;
  /** When set (e.g. filing an Inbox item), pre-loads the auto-fill panel and runs extraction. */
  initialExtractText?: string;
  initialCompanyId?: number | null;
  initialPersonId?: number | null;
  initialCategory?: string | null;
  initialTitle?: string;
  /** When set (e.g. adding a vendor contract), links the document to a vendor. */
  initialVendorId?: number | null;
  /** A file to attach + auto-read on mount (used by the bulk-add queue). */
  initialFile?: File;
  /** Override the submit / cancel button text (e.g. "Save & next" / "Skip"). */
  submitLabel?: string;
  cancelLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [ownerMode, setOwnerMode] = useState<OwnerMode>(
    doc?.companyId && doc?.personId ? "both" : doc?.personId || initialPersonId ? "person" : "company"
  );
  const [category, setCategory] = useState(doc?.category ?? initialCategory ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  // People list can grow if you create someone on the spot for an unknown owner.
  const [localPeople, setLocalPeople] = useState(people);
  useEffect(() => { setLocalPeople(people); }, [people]);
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [savingPerson, setSavingPerson] = useState(false);
  // Unified capture: Upload · Link · Paste text. Default depends on what's there.
  const [capMode, setCapMode] = useState<CaptureMode>(
    initialExtractText ? "text" : doc?.fileUrl && !doc?.storagePath ? "link" : "upload"
  );
  const [extractText, setExtractText] = useState(initialExtractText ?? "");
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const autoRan = useRef(false);
  // Track whether the user has touched lead days, so changing category can
  // suggest a default without clobbering an explicit value.
  const [leadTouched, setLeadTouched] = useState(false);
  const [lead, setLead] = useState<string>(
    doc ? String(doc.reminderLeadDays) : initialCategory && DEFAULT_LEAD_DAYS[initialCategory] ? String(DEFAULT_LEAD_DAYS[initialCategory]) : "30"
  );
  // File upload state.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [chosenFile, setChosenFile] = useState<string | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const hasExistingFile = !!doc?.storagePath && !removeExisting;

  // Duplicate detection: existing docs for this owner + category.
  const [dupDocs, setDupDocs] = useState<OwnerDocMatch[]>([]);
  const [supersedeId, setSupersedeId] = useState<number | null>(null);

  // Person profile enrichment (unified intake): profile details read from the
  // document, offered as a one-tap "update {name}'s profile" (fill-blanks-only).
  const [personProfile, setPersonProfile] = useState<PersonProfileFields | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileFields | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichNote, setEnrichNote] = useState<string | null>(null);

  // Human labels for the profile fields we found, for the review banner.
  const PROFILE_LABELS: Record<keyof PersonProfileFields, string> = {
    name: "Name", email: "Email", phone: "Phone", whatsapp: "WhatsApp", role: "Role",
    dateOfBirth: "Date of birth", nationality: "Nationality", nationalId: "National ID",
    passportNo: "Passport no.", address: "Address", emergencyContactName: "Emergency contact",
    emergencyContactPhone: "Emergency phone", startDate: "Start date", probationEndDate: "Probation end",
    department: "Department", supervisorName: "Manager", companyName: "Company",
  };
  function profileSummary(p: PersonProfileFields): string {
    return (Object.keys(p) as Array<keyof PersonProfileFields>)
      .filter((k) => p[k]).map((k) => PROFILE_LABELS[k]).join(", ");
  }

  function selectedPersonId(): number | null {
    const v = (formRef.current?.elements.namedItem("personId") as HTMLSelectElement | null)?.value;
    const n = parseInt(v || "", 10);
    return Number.isNaN(n) ? null : n;
  }

  const COMPANY_PROFILE_LABELS: Record<keyof CompanyProfileFields, string> = {
    legalName: "Legal name", registrationNo: "Registration no.", tin: "TIN", vrn: "VRN / VAT",
    incorporationDate: "Incorporation date", address: "Address", phone: "Phone", email: "Email",
  };
  function companyProfileSummary(c: CompanyProfileFields): string {
    return (Object.keys(c) as Array<keyof CompanyProfileFields>)
      .filter((k) => c[k]).map((k) => COMPANY_PROFILE_LABELS[k]).join(", ");
  }
  function selectedCompanyId(): number | null {
    const v = (formRef.current?.elements.namedItem("companyId") as HTMLSelectElement | null)?.value;
    const n = parseInt(v || "", 10);
    return Number.isNaN(n) ? null : n;
  }

  async function applyCompanyProfile() {
    const cid = selectedCompanyId();
    if (!cid || !companyProfile) return;
    setEnriching(true);
    try {
      const res = await enrichCompanyProfile(cid, companyProfile);
      if (res.ok) {
        setEnrichNote(res.filled.length ? `Updated ${res.filled.length} company field${res.filled.length === 1 ? "" : "s"}: ${res.filled.join(", ")}.` : "Company profile already had those details — nothing changed.");
        setCompanyProfile(null);
      } else {
        setEnrichNote(res.error ?? "Couldn't update the company profile.");
      }
    } finally {
      setEnriching(false);
    }
  }

  async function applyProfile() {
    const pid = selectedPersonId();
    if (!pid || !personProfile) return;
    setEnriching(true);
    try {
      const res = await enrichPersonProfile(pid, personProfile);
      if (res.ok) {
        setEnrichNote(res.filled.length ? `Updated ${res.filled.length} profile field${res.filled.length === 1 ? "" : "s"}: ${res.filled.join(", ")}.` : "Profile already had those details — nothing changed.");
        setPersonProfile(null);
      } else {
        setEnrichNote(res.error ?? "Couldn't update the profile.");
      }
    } finally {
      setEnriching(false);
    }
  }

  async function recheckDup() {
    const form = formRef.current;
    if (!form || mode !== "create") return;
    const cat = (form.elements.namedItem("category") as HTMLSelectElement | null)?.value || "";
    const companyId = parseInt((form.elements.namedItem("companyId") as HTMLSelectElement | null)?.value || "", 10);
    const personId = parseInt((form.elements.namedItem("personId") as HTMLSelectElement | null)?.value || "", 10);
    const owner = !Number.isNaN(personId) ? { kind: "person" as const, id: personId }
      : !Number.isNaN(companyId) ? { kind: "company" as const, id: companyId } : null;
    if (!owner || !cat) { setDupDocs([]); setSupersedeId(null); return; }
    const matches = await findOwnerDocuments(owner, cat);
    setDupDocs(matches);
    setSupersedeId(null); // default: add as new (never auto-replace)
  }

  const action = (fd: FormData) => {
    setError(null);
    setDateError(null);
    // Cross-field check the browser can't do: expiry must not predate issue.
    const issue = (fd.get("issueDate") || "").toString();
    const expiry = (fd.get("expiryDate") || "").toString();
    if (issue && expiry && expiry < issue) {
      setDateError("Expiry date can't be before the issue date.");
      (formRef.current?.elements.namedItem("expiryDate") as HTMLInputElement | null)?.focus();
      return;
    }
    start(async () => {
      const res = mode === "create" ? await createDocumentAction(fd) : await updateDocumentAction(doc!.id, fd);
      if (res.ok && supersedeId) {
        // User chose to replace: archive the superseded document (kept as history).
        try { await archiveDocumentAction(supersedeId, true); } catch { /* best effort */ }
      }
      if (!res.ok) setError(res.error);
      onComplete?.(res);
    });
  };

  // Apply extracted fields to the form; returns how many meaningful fields filled.
  function applyFields(f: ExtractedFields): number {
    const form = formRef.current;
    if (form) {
      const setVal = (name: string, val?: string | number) => {
        if (val == null || val === "") return;
        const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
        if (el) el.value = String(val);
      };
      setVal("title", f.title);
      setVal("docType", f.docType);
      setVal("issuer", f.issuer);
      setVal("referenceNo", f.referenceNo);
      setVal("issueDate", f.issueDate);
      setVal("expiryDate", f.expiryDate);
      setVal("companyId", f.companyId);
      setVal("personId", f.personId);
      if (f.category) {
        setCategory(f.category);
        if (!leadTouched && DEFAULT_LEAD_DAYS[f.category]) setLead(String(DEFAULT_LEAD_DAYS[f.category]));
      }
      // Reflect the detected owner in the segmented control so the right
      // field(s) are visible (company / person / both).
      if (f.companyId && f.personId) setOwnerMode("both");
      else if (f.personId) setOwnerMode("person");
      else if (f.companyId) setOwnerMode("company");
      // Overflow → Notes: append anything that didn't map to a labelled field,
      // without overwriting what's already there or duplicating it.
      if (f.notes) {
        const el = form.elements.namedItem("notes") as HTMLTextAreaElement | null;
        if (el) {
          const existing = el.value.trim();
          if (!existing.includes(f.notes)) el.value = existing ? `${existing}\n${f.notes}` : f.notes;
        }
      }
    }
    // Stash any person profile details the document revealed, for the
    // "also update {name}'s profile" review banner (only when a person owner).
    if (f.person && Object.keys(f.person).length) {
      setPersonProfile(f.person);
      setEnrichNote(null);
    }
    // Stash company identity details for the "also update {company}'s profile" banner.
    if (f.company && Object.keys(f.company).length) {
      setCompanyProfile(f.company);
      setEnrichNote(null);
    }
    void recheckDup();
    return [f.title, f.category, f.docType, f.issuer, f.referenceNo, f.issueDate, f.expiryDate, f.companyId, f.personId, f.notes]
      .filter((v) => v != null && v !== "").length;
  }

  function noteFor(filled: number, source: string): string {
    if (filled === 0) return "Couldn't find document details. Fill the fields in manually.";
    const how = source === "vision" ? " from the image" : source === "rules" ? " (AI off — used basic rules)" : "";
    return `Filled ${filled} field${filled === 1 ? "" : "s"}${how}. Check before saving.`;
  }

  async function runExtract() {
    if (!extractText.trim()) return;
    setExtracting(true);
    setExtractNote(null);
    try {
      const res = await extractDocumentFields(extractText);
      setExtractNote(noteFor(applyFields(res.fields), res.source));
    } finally {
      setExtracting(false);
    }
  }

  // Read a PDF/image/office file: extract fields AND attach the file to the document so it
  // isn't uploaded twice.
  async function runExtractFile(file: File) {
    setExtracting(true);
    setExtractNote(null);
    try {
      const prepared = await downscaleImage(file);
      const fd = new FormData();
      fd.set("file", prepared);
      const res = await extractDocumentFromFile(fd);
      if (!res.ok) {
        setExtractNote(res.note ?? "Couldn't read that file.");
        return;
      }
      // Attach the (prepared) file to the document's upload field.
      try {
        const dt = new DataTransfer();
        dt.items.add(prepared);
        if (fileInputRef.current) fileInputRef.current.files = dt.files;
        setChosenFile(prepared.name);
        setRemoveExisting(false);
      } catch { /* attachment is best-effort */ }
      setExtractNote(noteFor(applyFields(res.fields), res.source) + (res.note ? ` ${res.note}` : ""));
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

  // Bulk queue: attach + auto-read the given file once on mount.
  const autoRanFile = useRef(false);
  useEffect(() => {
    if (initialFile && !autoRanFile.current) {
      autoRanFile.current = true;
      setCapMode("upload");
      runExtractFile(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  async function handleCreatePerson() {
    const name = newPersonName.trim();
    if (!name) return;
    setSavingPerson(true);
    try {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("personType", "local_staff");
      const res = await createPerson(fd);
      if (res.ok && res.id) {
        setLocalPeople((prev) => [...prev, { id: res.id!, name }].sort((a, b) => a.name.localeCompare(b.name)));
        const el = formRef.current?.elements.namedItem("personId") as HTMLSelectElement | null;
        if (el) el.value = String(res.id);
        setOwnerMode((m) => (m === "company" ? "both" : m === "person" ? "person" : m));
        setCreatingPerson(false);
        setNewPersonName("");
      } else if (!res.ok) {
        setError(res.error);
      }
    } finally {
      setSavingPerson(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-border bg-bg-subtle/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
  const labelCls = "block text-[10px] uppercase tracking-wider text-fg-subtle mb-1";

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {/* Vendor contract link — only present when adding a contract for a vendor,
          so normal document edits never disturb an existing vendor link. */}
      {initialVendorId != null && <input type="hidden" name="vendorId" value={String(initialVendorId)} />}
      {/* Unified capture — Upload · Link · Paste text. Upload and Paste text are
          read by AI to auto-fill the fields below; Link is just a reference. The
          actual form inputs (file, fileUrl) stay mounted so switching tabs never
          loses what you've added. */}
      <div className="rounded-xl border border-border bg-bg-subtle/40 p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles size={14} className="text-accent" />
          <span className="text-sm font-medium">Add the document</span>
          <div className="ml-auto">
            <Segmented<CaptureMode> size="sm" value={capMode} onChange={setCapMode}
              options={[
                { value: "upload", label: "Upload", icon: <Upload size={13} /> },
                { value: "link", label: "Link", icon: <Link2 size={13} /> },
                { value: "text", label: "Paste text", icon: <Type size={13} /> },
              ]} />
          </div>
        </div>

        {/* Kept outside the tabs so a pending file removal still submits even if
            you switch capture modes. */}
        {removeExisting && <input type="hidden" name="removeFile" value="1" />}

        {/* Upload — the file is stored AND read automatically (PDF, Word, Excel, photo, scan). */}
        <div className={capMode === "upload" ? "" : "hidden"}>
          <input ref={fileInputRef} name="file" type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setChosenFile(f.name); setRemoveExisting(false); runExtractFile(f); } }}
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
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-accent hover:opacity-80">Replace</button>
              <button type="button" onClick={() => setRemoveExisting(true)} className="text-fg-muted hover:text-danger" title="Remove file"><X size={14} /></button>
            </div>
          ) : (
            <button type="button" onClick={() => { setRemoveExisting(false); fileInputRef.current?.click(); }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent/50 px-3 py-3 text-sm text-accent hover:bg-accent/10 transition-colors">
              <Upload size={15} /> Choose PDF, Word, Excel or photo — read automatically
            </button>
          )}
          <p className="text-[11px] text-fg-subtle mt-1.5">Max 20 MB. Supports PDF, DOCX, Excel/CSV, scans, photos and handwritten notes.</p>
        </div>

        {/* Link — a reference to where the file lives (not read by AI). */}
        <div className={capMode === "link" ? "" : "hidden"}>
          <input name="fileUrl" type="url" defaultValue={doc?.fileUrl ?? ""} className={inputCls}
            placeholder="https:// link to Drive, email, etc." />
          <p className="text-[11px] text-fg-subtle mt-1.5">A link to where the file is kept. Not read automatically.</p>
        </div>

        {/* Paste text — read by AI to fill the fields. */}
        <div className={capMode === "text" ? "" : "hidden"}>
          <textarea value={extractText} onChange={(e) => setExtractText(e.target.value)} rows={3}
            className={inputCls} placeholder="Paste the renewal email or the text from the document…" />
          <button type="button" onClick={runExtract} disabled={extracting || !extractText.trim()}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50">
            {extracting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {extracting ? "Reading…" : "Read & fill"}
          </button>
        </div>

        {(extracting || extractNote) && (
          <p className="text-xs text-fg-muted flex items-center gap-1.5">
            {extracting && <Loader2 size={12} className="animate-spin" />}
            {extracting ? "Reading…" : extractNote}
          </p>
        )}
      </div>

      <div className="grid gap-2.5 grid-cols-2">
        <div className="col-span-2">
          <label className={labelCls}>Title <span className="text-danger">*</span></label>
          <input name="title" defaultValue={doc?.title ?? initialTitle ?? ""} required autoFocus={mode === "create"}
            className={inputCls} placeholder="e.g. Dar Spices Trade Licence" />
        </div>

        <div className="col-span-2">
          <label className={labelCls}>This document is for</label>
          <Segmented<OwnerMode> value={ownerMode} onChange={setOwnerMode}
            options={[
              { value: "company", label: "Company" },
              { value: "person", label: "Person" },
              { value: "both", label: "Company + Person" },
            ]} />
        </div>

        <div>
          <label className={labelCls}>Category</label>
          <select name="category" value={category}
            onChange={(e) => {
              const v = e.target.value;
              setCategory(v);
              if (!leadTouched && v && DEFAULT_LEAD_DAYS[v]) setLead(String(DEFAULT_LEAD_DAYS[v]));
              void recheckDup();
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

        <div className={ownerMode === "person" ? "hidden" : ""}>
          <label className={labelCls}>Company</label>
          <select name="companyId" onChange={recheckDup} defaultValue={doc?.companyId ? String(doc.companyId) : initialCompanyId ? String(initialCompanyId) : ""} className={inputCls}>
            <option value="">—</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {ownerMode === "person" && <input type="hidden" name="companyId" value="" />}

        <div className={ownerMode === "company" ? "hidden" : ""}>
          <label className={labelCls}>Person</label>
          <select name="personId" onChange={recheckDup} defaultValue={doc?.personId ? String(doc.personId) : initialPersonId ? String(initialPersonId) : ""} className={inputCls}>
            <option value="">—</option>
            {localPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {creatingPerson ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreatePerson(); } }}
                placeholder="New person's name" autoFocus
                className="flex-1 rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs focus:outline-none focus:border-accent" />
              <button type="button" onClick={handleCreatePerson} disabled={savingPerson || !newPersonName.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-accent text-accent-fg px-2 py-1 text-[11px] disabled:opacity-50">
                {savingPerson ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Add
              </button>
              <button type="button" onClick={() => { setCreatingPerson(false); setNewPersonName(""); }}
                className="text-fg-muted hover:text-fg p-1"><X size={12} /></button>
            </div>
          ) : (
            <button type="button" onClick={() => setCreatingPerson(true)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
              <UserPlus size={11} /> New person
            </button>
          )}
        </div>
        {ownerMode === "company" && <input type="hidden" name="personId" value="" />}

        {/* Unified intake: profile details found in the document → offer to fill
            the person's blank profile fields (always reviewed, never overwrites). */}
        {ownerMode !== "company" && personProfile && (
          <div className="col-span-2 rounded-lg bg-accent-soft/40 ring-1 ring-accent/30 p-2.5 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-accent">
              <Sparkles size={13} /> Also found profile details in this document
            </div>
            <p className="text-fg-muted">{profileSummary(personProfile)}.</p>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button type="button" onClick={applyProfile} disabled={enriching || !selectedPersonId()}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-fg px-2.5 py-1 text-[11px] font-medium disabled:opacity-50">
                {enriching ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Update the person's profile
              </button>
              <button type="button" onClick={() => { setPersonProfile(null); setEnrichNote(null); }}
                className="rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg">Dismiss</button>
            </div>
            <p className="text-[11px] text-fg-subtle">
              {selectedPersonId() ? "Only empty fields are filled — nothing already on record is changed." : "Pick the person above first, then update their profile."}
            </p>
          </div>
        )}
        {/* Company intake: identity details found in the document → offer to fill
            the company's blank profile fields (always reviewed, never overwrites). */}
        {ownerMode !== "person" && companyProfile && (
          <div className="col-span-2 rounded-lg bg-accent-soft/40 ring-1 ring-accent/30 p-2.5 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-accent">
              <Sparkles size={13} /> Also found company details in this document
            </div>
            <p className="text-fg-muted">{companyProfileSummary(companyProfile)}.</p>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button type="button" onClick={applyCompanyProfile} disabled={enriching || !selectedCompanyId()}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-fg px-2.5 py-1 text-[11px] font-medium disabled:opacity-50">
                {enriching ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Update the company profile
              </button>
              <button type="button" onClick={() => { setCompanyProfile(null); setEnrichNote(null); }}
                className="rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg">Dismiss</button>
            </div>
            <p className="text-[11px] text-fg-subtle">
              {selectedCompanyId() ? "Only empty fields are filled — nothing already on record is changed." : "Pick the company above first, then update its profile."}
            </p>
          </div>
        )}
        {enrichNote && (
          <p className="col-span-2 text-xs text-success flex items-center gap-1.5"><Sparkles size={12} /> {enrichNote}</p>
        )}

        {dupDocs.length > 0 && (
          <div className="col-span-2 rounded-lg bg-warn-soft/40 ring-1 ring-warn/30 p-2.5 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-warn">
              <AlertCircle size={13} /> Already on file: {dupDocs.length} {category} document{dupDocs.length === 1 ? "" : "s"}
            </div>
            <ul className="text-fg-muted space-y-0.5">
              {dupDocs.slice(0, 3).map((d) => (
                <li key={d.id}>• {d.title}{d.expiryLabel ? ` · ${d.expiryLabel}` : ""} <span className="text-fg-subtle">({d.status})</span></li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <button type="button" onClick={() => setSupersedeId(null)}
                className={cn("rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors", supersedeId === null ? "bg-accent-soft text-accent ring-accent/30" : "bg-bg-subtle text-fg-muted ring-border hover:bg-bg-muted")}>
                Keep both (add new)
              </button>
              <button type="button" onClick={() => setSupersedeId(dupDocs[0].id)}
                className={cn("rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors", supersedeId != null ? "bg-warn-soft text-warn ring-warn/30" : "bg-bg-subtle text-fg-muted ring-border hover:bg-bg-muted")}>
                Replace newest (archive old)
              </button>
            </div>
            <p className="text-[11px] text-fg-subtle">
              {supersedeId != null
                ? "On save, the existing copy is archived (kept in history), not deleted."
                : "Nothing on file is touched — this is added as a separate document. Only choose Replace if this is genuinely newer."}
            </p>
          </div>
        )}

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
          <input name="issueDate" type="date" defaultValue={toDateInput(doc?.issueDate)} className={inputCls}
            onChange={() => dateError && setDateError(null)} />
        </div>

        <div>
          <label className={labelCls}>Expiry date</label>
          <input name="expiryDate" type="date" defaultValue={toDateInput(doc?.expiryDate)}
            onChange={() => dateError && setDateError(null)}
            aria-invalid={!!dateError}
            className={cn(inputCls, dateError && "ring-1 ring-danger/60 border-danger/60")} />
          {dateError && <p className="mt-1 text-[11px] text-danger">{dateError}</p>}
        </div>

        <div>
          <label className={labelCls}>Remind me (days before)</label>
          <input name="reminderLeadDays" type="number" min={0} value={lead}
            onChange={(e) => { setLead(e.target.value); setLeadTouched(true); }}
            className={inputCls} />
        </div>

        <div className="col-span-2">
          <label className={labelCls}>Notes</label>
          <textarea name="notes" defaultValue={doc?.notes ?? ""} rows={2} className={inputCls}
            onKeyDown={submitOnEnterKeyDown}
            placeholder="Renewal steps, who chases it, conditions…" />
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
            className="px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-50">
            {cancelLabel ?? "Cancel"}
          </button>
        )}
        <button type="submit" disabled={pending}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50")}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : mode === "create" ? <FilePlus size={13} /> : <Save size={13} />}
          {pending ? "Saving…" : submitLabel ?? (mode === "create" ? "Add document" : "Save changes")}
        </button>
      </div>
    </form>
  );
}
