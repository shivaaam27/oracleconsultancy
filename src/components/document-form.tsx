"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, FilePlus, AlertCircle, X, Sparkles, Upload, Link2, Type, UserPlus } from "lucide-react";
import { createDocumentAction, updateDocumentAction, extractDocumentFields, extractDocumentFromFile, findDuplicateDocumentsAction, archiveDocumentAction, type ExtractedFields, type DuplicateMatch, type ExtractedSegment } from "@/app/documents/actions";
import { DocPreview } from "@/components/doc-preview";
import { RelatedDocuments } from "@/components/related-documents";
import { downscaleImage } from "@/lib/downscale-image";
import { createPerson, enrichPersonProfile, type PersonProfileFields } from "@/app/people/actions";
import { enrichCompanyProfile, type CompanyProfileFields } from "@/app/companies/[id]/actions";
import { DOC_CATEGORIES, DEFAULT_LEAD_DAYS, type DocumentRow } from "@/lib/documents-shared";
import { PERSON_TYPES, PERSON_TYPE_LABELS, type PersonType } from "@/lib/person-types";
import { Segmented } from "@/components/macos";
import { Button } from "@/components/ui";
import { submitOnEnterKeyDown, EnterHint } from "@/components/form-keys";
import { cn } from "@/lib/cn";

type CaptureMode = "upload" | "link" | "text";
type OwnerMode = "company" | "person" | "both";

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
  const router = useRouter();
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
  const [newPersonType, setNewPersonType] = useState<PersonType>("local_staff");
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
  // The actual picked File, kept so we can preview it before saving.
  const [chosenFileObj, setChosenFileObj] = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const hasExistingFile = !!doc?.storagePath && !removeExisting;
  // Content hash of the picked file (from extraction) — lets dedup catch the
  // identical file even under a different name/owner.
  const [fileHash, setFileHash] = useState<string | null>(null);

  // Duplicate detection: identical-file / same-reference / similar-title matches.
  const [dupDocs, setDupDocs] = useState<DuplicateMatch[]>([]);
  const [supersedeId, setSupersedeId] = useState<number | null>(null);

  // Expiry intelligence: "yes" = expires, "no" = no expiry by nature. Drives the
  // "No expiry" toggle so a blank expiry on a CV/invoice reads as correct, not missing.
  const [expiryKind, setExpiryKind] = useState<"yes" | "no" | "">(doc?.expiryKind === "yes" || doc?.expiryKind === "no" ? doc.expiryKind : "");

  // Compilation: parts detected in one uploaded file (a multi-document bundle).
  const [segments, setSegments] = useState<ExtractedSegment[]>([]);

  // Person profile enrichment (unified intake): profile details read from the
  // document, offered as a one-tap "update {name}'s profile" (fill-blanks-only).
  const [personProfile, setPersonProfile] = useState<PersonProfileFields | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileFields | null>(null);
  // Intake rewire: facts the scan read (to append to the ledger), the
  // `_NEEDORIG` photo-placeholder flag, and whether the scan was low-confidence
  // (pre-ticks "needs review" so an unsure read isn't silently trusted).
  const [extractedFacts, setExtractedFacts] = useState<NonNullable<ExtractedFields["facts"]>>([]);
  const [needsOriginal, setNeedsOriginal] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
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
        // Refresh the open list so the updated company details show without a reload.
        router.refresh();
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
        // Refresh the open list so the updated person details show without a reload.
        router.refresh();
      } else {
        setEnrichNote(res.error ?? "Couldn't update the profile.");
      }
    } finally {
      setEnriching(false);
    }
  }

  async function recheckDup(hashOverride?: string | null) {
    const form = formRef.current;
    if (!form) return;
    const cat = (form.elements.namedItem("category") as HTMLSelectElement | null)?.value || "";
    const title = (form.elements.namedItem("title") as HTMLInputElement | null)?.value || "";
    const referenceNo = (form.elements.namedItem("referenceNo") as HTMLInputElement | null)?.value || "";
    const companyId = parseInt((form.elements.namedItem("companyId") as HTMLSelectElement | null)?.value || "", 10);
    const personId = parseInt((form.elements.namedItem("personId") as HTMLSelectElement | null)?.value || "", 10);
    // hashOverride lets a just-read file dedup immediately (state hasn't flushed yet).
    const hash = hashOverride !== undefined ? hashOverride : fileHash;
    // Prefer the person as the owner for the title-match leg; the hash and
    // reference legs are owner-independent so cross-owner copies are still caught.
    const owner = !Number.isNaN(personId) ? { kind: "person" as const, id: personId } : !Number.isNaN(companyId) ? { kind: "company" as const, id: companyId } : null;
    // Nothing identifying yet → no check.
    if (!hash && !referenceNo && !(owner && cat)) { setDupDocs([]); setSupersedeId(null); return; }
    const matches = await findDuplicateDocumentsAction({
      fileHash: hash, referenceNo, title, category: cat, owner,
      excludeId: mode === "edit" ? doc?.id ?? null : null,
    });
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
    // Expiry intelligence: reflect the AI's call. "no" means this type doesn't
    // expire — clear any expiry field so a blank reads as correct, not missing.
    if (f.expiryKind === "no") {
      setExpiryKind("no");
      const el = form?.elements.namedItem("expiryDate") as HTMLInputElement | null;
      if (el) el.value = "";
    } else if (f.expiryKind === "yes") {
      setExpiryKind("yes");
    }
    // Compilation: a bundle of several documents detected in this one file.
    // Flag for review — a split is a deliberate, operator-confirmed step.
    if (f.segments && f.segments.length > 1) { setSegments(f.segments); setNeedsReview(true); }
    // Intake rewire: stash facts to record + the photo-placeholder flag.
    if (f.facts && f.facts.length) setExtractedFacts(f.facts);
    if (f.needsOriginal) setNeedsOriginal(true);
    void recheckDup();
    return [f.title, f.category, f.docType, f.issuer, f.referenceNo, f.issueDate, f.expiryDate, f.companyId, f.personId, f.notes]
      .filter((v) => v != null && v !== "").length;
  }

  function noteFor(filled: number, source: string, needsReview?: boolean): string {
    if (filled === 0) return "Couldn't find document details. Fill the fields in manually.";
    const how = source === "vision" ? " from the image" : source === "rules" ? " (AI off — used basic rules)" : "";
    // Confidence gate: when the model flagged the read as unclear, ask for a
    // careful check rather than presenting the guesses as if they were certain.
    if (needsReview) return `Filled ${filled} field${filled === 1 ? "" : "s"}${how}, but the document was unclear — please double-check every field, especially the expiry date.`;
    return `Filled ${filled} field${filled === 1 ? "" : "s"}${how}. Check before saving.`;
  }

  async function runExtract() {
    if (!extractText.trim()) return;
    setExtracting(true);
    setExtractNote(null);
    try {
      const res = await extractDocumentFields(extractText);
      setExtractNote(noteFor(applyFields(res.fields), res.source, res.needsReview));
      flagReview(res.needsReview, res.fields);
    } finally {
      setExtracting(false);
    }
  }

  // Pre-tick "needs review" when the scan was low-confidence OR couldn't match a
  // company/person owner — those are the cases the blueprint routes to review.
  function flagReview(low: boolean | undefined, f: ExtractedFields) {
    if (low || (!f.companyId && !f.personId)) setNeedsReview(true);
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
      // The content hash comes back even on a failed read — keep it for dedup.
      setFileHash(res.fileHash ?? null);
      setChosenFileObj(prepared);
      if (!res.ok) {
        setExtractNote(res.note ?? "Couldn't read that file.");
        // Still dedup on the file hash — an identical file may already be on record.
        void recheckDup(res.fileHash ?? null);
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
      setExtractNote(noteFor(applyFields(res.fields), res.source, res.needsReview) + (res.note ? ` ${res.note}` : ""));
      flagReview(res.needsReview, res.fields);
      void recheckDup(res.fileHash ?? null);
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
      fd.set("personType", newPersonType);
      // Inherit the company chosen on the document form so the new person lands in
      // the right company (and gets the correct checklist), not company-less.
      const cid = selectedCompanyId();
      if (cid) fd.set("companyId", String(cid));
      const res = await createPerson(fd);
      if (res.ok && res.id) {
        setLocalPeople((prev) => [...prev, { id: res.id!, name }].sort((a, b) => a.name.localeCompare(b.name)));
        const el = formRef.current?.elements.namedItem("personId") as HTMLSelectElement | null;
        if (el) el.value = String(res.id);
        setOwnerMode((m) => (m === "company" ? "both" : m === "person" ? "person" : m));
        setCreatingPerson(false);
        setNewPersonName("");
        setNewPersonType("local_staff");
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
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setChosenFile(f.name); setRemoveExisting(false); runExtractFile(f); } }}
            className="hidden" />
          {chosenFile ? (
            <div className="rounded-lg border border-border bg-bg-subtle/60 px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                {/* Click the name (or Preview) to see the picked file before saving. */}
                <DocPreview file={chosenFileObj} fileName={chosenFile} className="flex-1 min-w-0" />
                <button type="button" onClick={() => { setChosenFile(null); setChosenFileObj(null); setFileHash(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="text-fg-muted hover:text-danger shrink-0" title="Clear"><X size={14} /></button>
              </div>
            </div>
          ) : hasExistingFile ? (
            <div className="rounded-lg border border-border bg-bg-subtle/60 px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                {/* Click the name (or Preview/Open) to view the stored file in place. */}
                <DocPreview documentId={doc?.id} fileName={doc?.fileName ?? "Attached file"} className="flex-1 min-w-0" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-accent hover:opacity-80 shrink-0">Replace</button>
                <button type="button" onClick={() => setRemoveExisting(true)} className="text-fg-muted hover:text-danger shrink-0" title="Remove file"><X size={14} /></button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setRemoveExisting(false); fileInputRef.current?.click(); }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent/50 px-3 py-3 text-sm text-accent hover:bg-accent/10 transition-colors">
              <Upload size={15} /> Choose PDF, Word, Excel or photo — read automatically
            </button>
          )}
          {mode === "edit" && doc?.id != null && <RelatedDocuments documentId={doc.id} />}
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

        {/* Compilation: this one file looks like several documents bundled together. */}
        {segments.length > 1 && (
          <div className="rounded-lg bg-accent-soft/40 ring-1 ring-accent/30 p-2.5 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-accent">
              <Sparkles size={13} /> This file looks like {segments.length} separate documents
            </div>
            <ul className="text-fg-muted space-y-0.5">
              {segments.slice(0, 8).map((s, i) => (
                <li key={i}>• {s.title ?? s.category ?? "Document"}{s.category && s.title ? ` · ${s.category}` : ""}{s.pageRange ? ` · p.${s.pageRange}` : ""}</li>
              ))}
            </ul>
            <p className="text-[11px] text-fg-subtle">
              Save it first (it&apos;s flagged for review), then open it from the queue and choose <span className="font-medium">Split into separate documents</span> — each part keeps a link to this same file.
            </p>
          </div>
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
          <select name="companyId" onChange={() => recheckDup()} defaultValue={doc?.companyId ? String(doc.companyId) : initialCompanyId ? String(initialCompanyId) : ""} className={inputCls}>
            <option value="">—</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {ownerMode === "person" && <input type="hidden" name="companyId" value="" />}

        <div className={ownerMode === "company" ? "hidden" : ""}>
          <label className={labelCls}>Person</label>
          <select name="personId" onChange={() => recheckDup()} defaultValue={doc?.personId ? String(doc.personId) : initialPersonId ? String(initialPersonId) : ""} className={inputCls}>
            <option value="">—</option>
            {localPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {creatingPerson ? (
            <div className="mt-1.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreatePerson(); } }}
                  placeholder="New person's name" autoFocus
                  className="flex-1 rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs focus:outline-none focus:border-accent" />
                <select value={newPersonType} onChange={(e) => setNewPersonType(e.target.value as PersonType)}
                  title="What kind of person is this?"
                  className="rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs focus:outline-none focus:border-accent">
                  {PERSON_TYPES.map((t) => <option key={t} value={t}>{PERSON_TYPE_LABELS[t]}</option>)}
                </select>
                <Button type="button" size="xs" onClick={handleCreatePerson} disabled={savingPerson || !newPersonName.trim()}>
                  {savingPerson ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Add
                </Button>
                <button type="button" onClick={() => { setCreatingPerson(false); setNewPersonName(""); }}
                  className="text-fg-muted hover:text-fg p-1"><X size={12} /></button>
              </div>
              <p className="text-[10px] text-fg-subtle">Pick the right type so they get the correct document checklist.</p>
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
              <Button type="button" size="xs" onClick={applyProfile} disabled={enriching || !selectedPersonId()}>
                {enriching ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Update the person's profile
              </Button>
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
              <Button type="button" size="xs" onClick={applyCompanyProfile} disabled={enriching || !selectedCompanyId()}>
                {enriching ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Update the company profile
              </Button>
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

        {supersedeId != null && <input type="hidden" name="supersedesId" value={supersedeId} />}
        {dupDocs.length > 0 && (() => {
          const MATCH_LABEL: Record<DuplicateMatch["matchKind"], string> = {
            "identical-file": "identical file",
            "same-reference": "same reference no.",
            "similar-title": "similar title",
          };
          const hasIdentical = dupDocs.some((d) => d.matchKind === "identical-file");
          return (
            <div className="col-span-2 rounded-lg bg-warn-soft/40 ring-1 ring-warn/30 p-2.5 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-warn">
                <AlertCircle size={13} /> {hasIdentical ? "This exact file is already on record" : `Possible duplicate — ${dupDocs.length} similar document${dupDocs.length === 1 ? "" : "s"} on file`}
              </div>
              <ul className="text-fg-muted space-y-0.5">
                {dupDocs.slice(0, 4).map((d) => (
                  <li key={d.id}>• {d.title}{d.expiryLabel ? ` · ${d.expiryLabel}` : ""} <span className="text-fg-subtle">({MATCH_LABEL[d.matchKind]})</span></li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <button type="button" onClick={() => setSupersedeId(null)}
                  className={cn("rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors", supersedeId === null ? "bg-accent-soft text-accent ring-accent/30" : "bg-bg-subtle text-fg-muted ring-border hover:bg-bg-muted")}>
                  Keep both (add new)
                </button>
                <button type="button" onClick={() => setSupersedeId(dupDocs[0].id)}
                  className={cn("rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors", supersedeId != null ? "bg-warn-soft text-warn ring-warn/30" : "bg-bg-subtle text-fg-muted ring-border hover:bg-bg-muted")}>
                  Replace (archive old)
                </button>
              </div>
              <p className="text-[11px] text-fg-subtle">
                {supersedeId != null
                  ? "On save, the existing copy is archived (kept in history), not deleted."
                  : hasIdentical
                    ? "You may already have this. Only add it again if you mean to keep a separate copy."
                    : "Nothing on file is touched — this is added separately. Choose Replace only if this is genuinely newer."}
              </p>
            </div>
          );
        })()}

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
            disabled={expiryKind === "no"}
            onChange={(e) => { if (dateError) setDateError(null); if (e.target.value) setExpiryKind("yes"); }}
            aria-invalid={!!dateError}
            className={cn(inputCls, expiryKind === "no" && "opacity-50", dateError && "ring-1 ring-danger/60 border-danger/60")} />
          {dateError && <p className="mt-1 text-[11px] text-danger">{dateError}</p>}
          {/* Expiry intelligence — let the operator confirm a document genuinely
              has no expiry (CV, invoice, report) so a blank reads as correct. */}
          <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-fg-muted cursor-pointer">
            <input type="checkbox" checked={expiryKind === "no"}
              onChange={(e) => {
                if (e.target.checked) {
                  setExpiryKind("no");
                  const el = formRef.current?.elements.namedItem("expiryDate") as HTMLInputElement | null;
                  if (el) el.value = "";
                } else { setExpiryKind(""); }
              }}
              className="accent-accent" />
            No expiry — this type of document doesn&apos;t expire
          </label>
          {/* Carry the expiry decision to the server so compliance treats a blank
              expiry on a no-expiry document as complete, not missing. */}
          <input type="hidden" name="expiryKind" value={expiryKind} />
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

      {/* Intake rewire: facts to record + the photo-placeholder / needs-review
          flags. Hidden inputs carry them to the server on save. */}
      {mode === "create" && (
        <>
          <input type="hidden" name="facts" value={extractedFacts.length ? JSON.stringify(extractedFacts) : ""} />
          {needsOriginal && <input type="hidden" name="needsOriginal" value="1" />}
          <input type="hidden" name="reviewStatus" value={needsReview ? "needs_review" : "ok"} />
          {(extractedFacts.length > 0 || needsOriginal || needsReview) && (
            <div className="rounded-xl bg-accent-soft/25 ring-1 ring-accent/20 px-3 py-2.5 space-y-2">
              {extractedFacts.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-accent">Will also record {extractedFacts.length} fact{extractedFacts.length === 1 ? "" : "s"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {extractedFacts.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-bg-subtle px-2 py-0.5 text-[11px] text-fg-muted">
                        <span className="font-medium text-fg">{f.field}:</span> {f.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-1.5 text-[12px] text-fg-muted cursor-pointer">
                <input type="checkbox" checked={needsOriginal} onChange={(e) => setNeedsOriginal(e.target.checked)} className="accent-accent" />
                This is only a photo — official original still to collect
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-fg-muted cursor-pointer">
                <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} className="accent-accent" />
                Mark “needs review” (unsure — confirm later from the queue)
              </label>
            </div>
          )}
        </>
      )}

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
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : mode === "create" ? <FilePlus size={13} /> : <Save size={13} />}
          {pending ? "Saving…" : submitLabel ?? (mode === "create" ? "Add document" : "Save changes")}
        </Button>
      </div>
    </form>
  );
}
