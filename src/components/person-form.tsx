"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Save, UserPlus, AlertCircle, Plus, X, Sparkles, Upload, FileCheck } from "lucide-react";
import { createPerson, updatePerson, extractPersonFields } from "@/app/people/actions";
import { extractDocumentFromFile, createDocumentAction } from "@/app/documents/actions";
import type { PersonProfileFields } from "@/app/people/actions";
import { cn } from "@/lib/cn";
import { submitOnEnterKeyDown, EnterHint, FieldError, invalidFieldClass } from "@/components/form-keys";
import { PERSON_TYPES, PERSON_TYPE_LABELS, PERSON_TYPE_HINTS, normalizePersonType } from "@/lib/person-types";
import { STAFF_CATEGORIES } from "@/lib/staff-id-shared";
import { Combobox } from "@/components/combobox";
import { Button, Select, FieldLabel } from "@/components/ui";

const CHANNELS = ["WHATSAPP", "EMAIL", "SMS"] as const;

type Association = { companyId: number | ""; relationship: string };

type Defaults = Partial<{
  name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferredChannel: string | null;
  role: string | null;
  staffCategory: string | null;
  companyId: number | null;
  department: string | null;
  startDate: string | null;
  managerId: number | null;
  secondaryManagerIds: number[];
  workSite: string | null;
  residence: string | null;
  notes: string | null;
  personType: string | null;
  relatedPersonId: number | null;
  associations: Array<{ companyId: number; relationship: string | null }>;
  // Profile details
  dateOfBirth: string | null;
  nationality: string | null;
  nationalId: string | null;
  passportNo: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  probationEndDate: string | null;
}>;

type Result =
  | { ok: true; id?: number }
  | { ok: false; error: string };

export function PersonForm({
  mode,
  id,
  defaults,
  companies,
  peopleList,
  departments = [],
  sites = [],
  roles = [],
  onComplete,
  onCancel,
  compact = false,
}: {
  mode: "create" | "edit";
  /** required when mode === "edit" */
  id?: number;
  defaults?: Defaults;
  companies: Array<{ id: number; name: string }>;
  /** Used for manager dropdown. Excludes the person being edited (can't be own manager). */
  peopleList: Array<{ id: number; name: string; active: boolean }>;
  /** Existing department names for the datalist (create-on-the-fly still allowed). */
  departments?: string[];
  /** Existing site/location names for the work-site & residence datalists. */
  sites?: string[];
  /** Managed job-title list for the role suggestions. */
  roles?: string[];
  onComplete?: (result: Result) => void;
  onCancel?: () => void;
  /** Compact mode = tighter spacing for in-drawer rendering. */
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearFieldError = (k: string) => setFieldErrors((p) => { if (!p[k]) return p; const n = { ...p }; delete n[k]; return n; });
  const [pType, setPType] = useState<string>(normalizePersonType(defaults?.personType));
  const formRef = useRef<HTMLFormElement>(null);
  const [scanText, setScanText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const scanFileRef = useRef<HTMLInputElement>(null);
  // After a file scan we keep the file itself so it can ALSO be filed as a
  // document for this person (one tap) — without re-uploading via Documents.
  const [scannedFile, setScannedFile] = useState<{
    file: File;
    title: string;
    category: string | null;
    docType: string | null;
    expiryDate: string | null;
  } | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [docSavedNote, setDocSavedNote] = useState<string | null>(null);

  // Apply extracted profile fields to EMPTY form fields only (never overwrites).
  // Selects (company / manager) are matched by name to an existing option.
  function applyProfileFields(f: PersonProfileFields): number {
    const form = formRef.current;
    if (!form) return 0;
    let filled = 0;
    const setIfEmpty = (name: string, val?: string) => {
      if (!val) return;
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (el && !el.value.trim()) { el.value = val; filled++; }
    };
    setIfEmpty("name", f.name);
    setIfEmpty("email", f.email);
    setIfEmpty("phone", f.phone);
    setIfEmpty("whatsapp", f.whatsapp);
    setIfEmpty("role", f.role);
    setIfEmpty("dateOfBirth", f.dateOfBirth);
    setIfEmpty("nationality", f.nationality);
    setIfEmpty("nationalId", f.nationalId);
    setIfEmpty("passportNo", f.passportNo);
    setIfEmpty("address", f.address);
    setIfEmpty("emergencyContactName", f.emergencyContactName);
    setIfEmpty("emergencyContactPhone", f.emergencyContactPhone);
    setIfEmpty("startDate", f.startDate);
    setIfEmpty("probationEndDate", f.probationEndDate);
    setIfEmpty("department", f.department);
    // Company select — match by name (case-insensitive) to an existing option.
    if (f.companyName) {
      const co = companies.find((c) => c.name.toLowerCase() === f.companyName!.trim().toLowerCase());
      const el = form.elements.namedItem("companyId") as HTMLSelectElement | null;
      if (co && el && !el.value.trim()) { el.value = String(co.id); filled++; }
    }
    // Manager select — match supervisor name to an existing person.
    if (f.supervisorName) {
      const mgr = peopleList.find((p) => p.name.toLowerCase() === f.supervisorName!.trim().toLowerCase());
      const el = form.elements.namedItem("managerId") as HTMLSelectElement | null;
      if (mgr && el && !el.value.trim()) { el.value = String(mgr.id); filled++; }
    }
    return filled;
  }

  function noteForFill(filled: number, source: string, extra = ""): string {
    if (filled === 0) return "Nothing new found, or those fields are already filled.";
    return `Filled ${filled} empty field${filled === 1 ? "" : "s"}${source === "rules" ? " (AI off — basic rules)" : source === "vision" ? " from the file" : ""}.${extra} Check before saving.`;
  }

  // Auto-fill EMPTY fields from a pasted message (never overwrites what's set).
  async function scanFill() {
    if (!scanText.trim()) return;
    setScanning(true);
    setScanNote(null);
    setScannedFile(null); // a text scan has no file to file as a document
    setDocSavedNote(null);
    try {
      const res = await extractPersonFields(scanText);
      setScanNote(noteForFill(applyProfileFields(res.fields), res.source));
    } finally {
      setScanning(false);
    }
  }

  // Auto-fill from an uploaded file / photo (passport, ID, CV, contract…) using
  // the shared document-vision engine, which returns a person profile block.
  async function scanFileFill(file: File) {
    setScanning(true);
    setScanNote(null);
    setDocSavedNote(null);
    setScannedFile(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await extractDocumentFromFile(fd);
      if (!res.ok) { setScanNote(res.note ?? "Couldn't read that file."); return; }
      // The doc engine returns a nested person block plus a top-level role.
      const f: PersonProfileFields = { ...(res.fields.person ?? {}) };
      if (!f.role && res.fields.docType) { /* leave role alone */ }
      const filled = applyProfileFields(f);
      setScanNote(noteForFill(filled, res.source, filled === 0 ? " No personal details were found in this file." : ""));
      // Keep the file so it can ALSO be filed as this person's document — but only
      // when editing a saved person (we need their id to set the owner).
      if (mode === "edit" && id) {
        setScannedFile({
          file,
          title: (res.fields.title || file.name.replace(/\.[^.]+$/, "")).slice(0, 200),
          category: res.fields.category ?? null,
          docType: res.fields.docType ?? null,
          expiryDate: res.fields.expiryDate ?? null,
        });
      }
    } finally {
      setScanning(false);
      if (scanFileRef.current) scanFileRef.current.value = "";
    }
  }

  // One-tap "Also save as a document" — files the scanned file against this
  // person via the existing document flow (re-using the extracted category/title/
  // expiry). Optional + non-blocking; never touches the main person save.
  async function saveScannedAsDocument() {
    if (!scannedFile || !id) return;
    setSavingDoc(true);
    setDocSavedNote(null);
    try {
      const fd = new FormData();
      fd.set("file", scannedFile.file);
      fd.set("title", scannedFile.title);
      fd.set("personId", String(id));
      if (scannedFile.category) fd.set("category", scannedFile.category);
      if (scannedFile.docType) fd.set("docType", scannedFile.docType);
      if (scannedFile.expiryDate) fd.set("expiryDate", scannedFile.expiryDate);
      const res = await createDocumentAction(fd);
      if (res.ok) {
        setDocSavedNote("Saved to this person's documents.");
        setScannedFile(null);
      } else {
        setDocSavedNote(res.error || "Couldn't save the document.");
      }
    } catch {
      setDocSavedNote("Couldn't save the document.");
    } finally {
      setSavingDoc(false);
    }
  }
  const [associations, setAssociations] = useState<Association[]>(
    (defaults?.associations ?? []).map((a) => ({ companyId: a.companyId, relationship: a.relationship ?? "" }))
  );

  const addAssociation = () => setAssociations((a) => [...a, { companyId: "", relationship: "" }]);
  const removeAssociation = (i: number) => setAssociations((a) => a.filter((_, idx) => idx !== i));
  const updateAssociation = (i: number, patch: Partial<Association>) =>
    setAssociations((a) => a.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  // Secondary / dotted-line managers ("also reports to").
  const [secondaryManagers, setSecondaryManagers] = useState<number[]>(defaults?.secondaryManagerIds ?? []);
  const addSecondaryManager = (mid: number) =>
    setSecondaryManagers((s) => (s.includes(mid) ? s : [...s, mid]));
  const removeSecondaryManager = (mid: number) =>
    setSecondaryManagers((s) => s.filter((x) => x !== mid));

  const action = (fd: FormData) => {
    setError(null);

    // Inline field validation the browser can't fully express.
    const errs: Record<string, string> = {};
    const email = (fd.get("email") || "").toString().trim();
    const startDate = (fd.get("startDate") || "").toString();
    const probation = (fd.get("probationEndDate") || "").toString();
    const dob = (fd.get("dateOfBirth") || "").toString();
    const pad = (n: number) => String(n).padStart(2, "0");
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email address.";
    if (startDate && probation && probation < startDate) errs.probationEndDate = "Probation end can't be before the start date.";
    if (dob && dob >= todayStr) errs.dateOfBirth = "Date of birth must be in the past.";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      const first = ["email", "dateOfBirth", "probationEndDate"].find((k) => errs[k]);
      if (first) (formRef.current?.elements.namedItem(first) as HTMLInputElement | null)?.focus();
      return;
    }
    setFieldErrors({});

    // Serialise associations (drop rows with no company selected) into a single JSON field.
    const clean = associations
      .filter((a) => a.companyId !== "")
      .map((a) => ({ companyId: Number(a.companyId), relationship: a.relationship.trim() || null }));
    fd.set("associations", JSON.stringify(clean));
    fd.set("secondaryManagers", JSON.stringify(secondaryManagers));
    start(async () => {
      const res =
        mode === "create"
          ? await createPerson(fd)
          : await updatePerson(id!, fd);
      if (res.ok) {
        onComplete?.(res);
      } else {
        setError(res.error);
        onComplete?.(res);
      }
    });
  };

  // Filter manager candidates: active people, excluding self in edit mode
  const managerCandidates = peopleList.filter(
    (p) => p.active && (mode === "create" || p.id !== id)
  );

  // Keep a currently-saved manager / related person selectable even if they have
  // since been deactivated. Without this their name is missing from the list, the
  // field falls back to "No manager", and saving any other change would silently
  // delete the reporting link (orphaning the person on the org chart).
  const withSaved = (base: typeof managerCandidates, savedId: number | null | undefined) => {
    if (!savedId || base.some((p) => p.id === savedId)) return base;
    const saved = peopleList.find((p) => p.id === savedId);
    return saved ? [{ ...saved, name: `${saved.name} (inactive)` }, ...base] : base;
  };
  const managerOptions = withSaved(managerCandidates, defaults?.managerId);
  const relatedOptions = withSaved(managerCandidates, defaults?.relatedPersonId);

  const inputCls = cn(
    "w-full rounded-lg border border-border bg-bg-subtle/60 text-sm transition-all",
    compact ? "px-2.5 py-1.5" : "px-3 py-2",
    "focus:outline-none focus:ring-2 focus:ring-accent/40"
  );
  const gap = compact ? "space-y-2.5" : "space-y-4";

  return (
    <form ref={formRef} action={action} className={gap}>
      {/* Auto-fill from a pasted message (WhatsApp/email). Fills empty fields only. */}
      <details className="rounded-xl border border-border bg-bg-subtle/40 p-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
          <Sparkles size={14} className="text-accent" /> Auto-fill from a message
          <span className="ml-auto text-[11px] font-normal text-fg-subtle">paste &amp; read</span>
        </summary>
        <div className="mt-2.5 space-y-2">
          <textarea value={scanText} onChange={(e) => setScanText(e.target.value)} rows={3}
            className={inputCls} placeholder="Paste what they sent — name, DOB, passport no, address, contacts…" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={scanFill} disabled={scanning || !scanText.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50">
              {scanning ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {scanning ? "Reading…" : "Read & fill empty fields"}
            </button>
            <span className="text-[11px] text-fg-subtle">or</span>
            <input ref={scanFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) scanFileFill(f); }} className="hidden" />
            <button type="button" onClick={() => scanFileRef.current?.click()} disabled={scanning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-50">
              <Upload size={13} /> Read from a file / photo
            </button>
          </div>
          <p className="text-[11px] text-fg-subtle">Reads a passport, ID, CV or contract and fills empty profile fields only.</p>
          {scanNote && <p className="text-xs text-fg-muted">{scanNote}</p>}
          {scannedFile && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-subtle/40 px-2.5 py-2">
              <span className="text-[11px] text-fg-muted">Keep this file as a document for this person?</span>
              <button type="button" onClick={saveScannedAsDocument} disabled={savingDoc}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50">
                {savingDoc ? <Loader2 size={13} className="animate-spin" /> : <FileCheck size={13} />}
                {savingDoc ? "Saving…" : "Also save as a document"}
              </button>
            </div>
          )}
          {docSavedNote && <p className="text-xs text-fg-muted">{docSavedNote}</p>}
        </div>
      </details>

      <div className="grid gap-2.5 grid-cols-2">
        {/* Name (required, full width) */}
        <div className="col-span-2">
          <FieldLabel>Name <span className="text-danger">*</span></FieldLabel>
          <input
            name="name"
            defaultValue={defaults?.name ?? ""}
            required
            autoFocus={mode === "create"}
            className={inputCls}
            placeholder="Full name"
          />
        </div>

        {/* Person type — drives whether this is an employee or an external/expat contact */}
        <div className="col-span-2">
          <FieldLabel>Type</FieldLabel>
          <input type="hidden" name="personType" value={pType} />
          <div className="grid grid-cols-2 gap-1.5">
            {PERSON_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPType(t)}
                title={PERSON_TYPE_HINTS[t]}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs transition-colors text-left",
                  pType === t
                    ? "border-accent bg-accent/10 text-accent font-medium"
                    : "border-border text-fg-muted hover:text-fg hover:bg-bg-muted/60"
                )}
              >
                {PERSON_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Role / Job title</FieldLabel>
          <Combobox name="role" options={roles} defaultValue={defaults?.role ?? ""} className={inputCls} placeholder="e.g. Operations Manager" />
        </div>

        <div>
          <FieldLabel>Staff ID category</FieldLabel>
          <Select name="staffCategory" defaultValue={defaults?.staffCategory ?? ""}>
            {STAFF_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
          <p className="mt-1 text-[11px] text-fg-subtle">Sets the letter in the staff ID (e.g. CZ-<b>D</b>04). Leave on Auto to read it from the job title.</p>
        </div>

        <div>
          <FieldLabel>Department</FieldLabel>
          <Combobox name="department" options={departments} defaultValue={defaults?.department ?? ""} className={inputCls} placeholder="e.g. Finance" />
        </div>

        <div>
          <FieldLabel>Work site</FieldLabel>
          <Combobox name="workSite" options={sites} defaultValue={defaults?.workSite ?? ""} className={inputCls} placeholder="e.g. Matongo" />
        </div>

        <div>
          <FieldLabel>Residence</FieldLabel>
          <Combobox name="residence" options={sites} defaultValue={defaults?.residence ?? ""} className={inputCls} placeholder="e.g. Expat House A" />
        </div>

        <div>
          <FieldLabel>Start date</FieldLabel>
          <input
            name="startDate"
            type="date"
            defaultValue={defaults?.startDate ?? ""}
            onChange={() => clearFieldError("probationEndDate")}
            className={inputCls}
          />
        </div>

        <div>
          <FieldLabel>Main company</FieldLabel>
          <Select
            name="companyId"
            defaultValue={defaults?.companyId ? String(defaults.companyId) : ""}
          >
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <p className="text-[11px] text-fg-subtle mt-1">Their home company (used for their staff ID). Add any others below.</p>
        </div>

        <div>
          <FieldLabel>Email</FieldLabel>
          <input
            name="email"
            type="email"
            defaultValue={defaults?.email ?? ""}
            onChange={() => clearFieldError("email")}
            aria-invalid={!!fieldErrors.email}
            className={cn(inputCls, fieldErrors.email && invalidFieldClass)}
            placeholder="name@example.com"
          />
          <FieldError message={fieldErrors.email} />
        </div>

        <div>
          <FieldLabel>Phone</FieldLabel>
          <input
            name="phone"
            type="tel"
            defaultValue={defaults?.phone ?? ""}
            className={inputCls}
            placeholder="+254..."
          />
        </div>

        <div>
          <FieldLabel>WhatsApp</FieldLabel>
          <input
            name="whatsapp"
            type="tel"
            defaultValue={defaults?.whatsapp ?? ""}
            className={inputCls}
            placeholder="+254..."
          />
        </div>

        <div>
          <FieldLabel>Preferred channel</FieldLabel>
          <Select
            name="preferredChannel"
            defaultValue={defaults?.preferredChannel ?? ""}
          >
            <option value="">—</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>

        <div>
          <FieldLabel>Reports to</FieldLabel>
          <Select
            name="managerId"
            defaultValue={defaults?.managerId ? String(defaults.managerId) : ""}
          >
            <option value="">— No manager</option>
            {managerOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>

        {/* Also reports to — secondary / dotted-line managers (organogram) */}
        <div>
          <FieldLabel>Also reports to</FieldLabel>
          <Select
            value=""
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (Number.isInteger(v)) addSecondaryManager(v);
              e.target.value = "";
            }}
          >
            <option value="">+ Add a dotted-line manager…</option>
            {managerCandidates
              .filter((p) => !secondaryManagers.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </Select>
          {secondaryManagers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {secondaryManagers.map((mid) => {
                const p = peopleList.find((x) => x.id === mid);
                return (
                  <span
                    key={mid}
                    className="inline-flex items-center gap-1 rounded-full bg-bg-muted/70 px-2.5 py-1 text-xs text-fg"
                  >
                    {p?.name ?? `#${mid}`}
                    <button
                      type="button"
                      onClick={() => removeSecondaryManager(mid)}
                      className="text-fg-subtle hover:text-fg"
                      aria-label={`Remove ${p?.name ?? "manager"}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Related person — e.g. an immigration agent ↔ the expat they're helping */}
        <div>
          <FieldLabel>Related to</FieldLabel>
          <Select
            name="relatedPersonId"
            defaultValue={defaults?.relatedPersonId ? String(defaults.relatedPersonId) : ""}
          >
            <option value="">— None</option>
            {relatedOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>

        {/* Also works for — additional companies this person belongs to/serves.
            Feeds person_companies, so they appear under each company in pickers,
            company task lists and KPIs. Relationship label is optional. */}
        <div className="col-span-2">
          <FieldLabel>Also works for</FieldLabel>
          <div className="space-y-2">
            {associations.length === 0 && (
              <p className="text-xs text-fg-subtle italic">
                None. Add other companies this person works for or serves — their tasks and records show under each one.
              </p>
            )}
            {associations.map((row, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <select
                  value={row.companyId === "" ? "" : String(row.companyId)}
                  onChange={(e) => updateAssociation(i, { companyId: e.target.value === "" ? "" : Number(e.target.value) })}
                  className={cn(inputCls, "flex-1")}
                >
                  <option value="">— Company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input
                  value={row.relationship}
                  onChange={(e) => updateAssociation(i, { relationship: e.target.value })}
                  className={cn(inputCls, "flex-1")}
                  placeholder="role / relationship (optional)"
                />
                <button
                  type="button"
                  onClick={() => removeAssociation(i)}
                  title="Remove"
                  className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md text-fg-muted hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addAssociation}
              className="inline-flex items-center gap-1 text-xs text-accent hover:opacity-80 transition-opacity"
            >
              <Plus size={13} /> Add company
            </button>
          </div>
        </div>

        {/* Profile details — HR master data. All optional; auto-filled from intake where possible. */}
        <div className="col-span-2 mt-1 border-t border-border/60 pt-2.5">
          <div className="text-[10px] uppercase tracking-[0.08em] text-fg-subtle mb-2">Profile details</div>
          <div className="grid gap-2.5 grid-cols-2">
            <div>
              <FieldLabel>Date of birth</FieldLabel>
              <input name="dateOfBirth" type="date" defaultValue={defaults?.dateOfBirth ?? ""}
                onChange={() => clearFieldError("dateOfBirth")}
                aria-invalid={!!fieldErrors.dateOfBirth}
                className={cn(inputCls, fieldErrors.dateOfBirth && invalidFieldClass)} />
              <FieldError message={fieldErrors.dateOfBirth} />
            </div>
            <div>
              <FieldLabel>Nationality</FieldLabel>
              <input name="nationality" defaultValue={defaults?.nationality ?? ""} className={inputCls} placeholder="e.g. Tanzanian" />
            </div>
            <div>
              <FieldLabel>National ID (NIDA)</FieldLabel>
              <input name="nationalId" defaultValue={defaults?.nationalId ?? ""} className={inputCls} placeholder="ID number" />
            </div>
            <div>
              <FieldLabel>Passport number</FieldLabel>
              <input name="passportNo" defaultValue={defaults?.passportNo ?? ""} className={inputCls} placeholder="Passport no." />
            </div>
            <div className="col-span-2">
              <FieldLabel>Address</FieldLabel>
              <input name="address" defaultValue={defaults?.address ?? ""} className={inputCls} placeholder="Residential address" />
            </div>
            <div>
              <FieldLabel>Emergency contact</FieldLabel>
              <input name="emergencyContactName" defaultValue={defaults?.emergencyContactName ?? ""} className={inputCls} placeholder="Name" />
            </div>
            <div>
              <FieldLabel>Emergency phone</FieldLabel>
              <input name="emergencyContactPhone" type="tel" defaultValue={defaults?.emergencyContactPhone ?? ""} className={inputCls} placeholder="+255…" />
            </div>
            <div>
              <FieldLabel>Probation ends</FieldLabel>
              <input name="probationEndDate" type="date" defaultValue={defaults?.probationEndDate ?? ""}
                onChange={() => clearFieldError("probationEndDate")}
                aria-invalid={!!fieldErrors.probationEndDate}
                className={cn(inputCls, fieldErrors.probationEndDate && invalidFieldClass)} />
              <FieldError message={fieldErrors.probationEndDate} />
            </div>
          </div>
        </div>

        <div className="col-span-2">
          <FieldLabel>Notes</FieldLabel>
          <textarea
            name="notes"
            defaultValue={defaults?.notes ?? ""}
            rows={2}
            className={inputCls}
            onKeyDown={submitOnEnterKeyDown}
            placeholder="Internal notes, escalation preferences, etc."
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 text-xs text-danger">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <EnterHint className="mr-auto" verb={mode === "create" ? "create" : "save"} />
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <Button
          type="submit"
          disabled={pending}
          size="md"
        >
          {pending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : mode === "create" ? (
            <UserPlus size={13} />
          ) : (
            <Save size={13} />
          )}
          {pending ? (mode === "create" ? "Creating…" : "Saving…") : mode === "create" ? "Create person" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
