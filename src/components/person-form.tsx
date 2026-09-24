"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Save, UserPlus, AlertCircle, Plus, X, Sparkles } from "lucide-react";
import { createPerson, updatePerson, extractPersonFields } from "@/app/people/actions";
import type { PersonProfileFields } from "@/app/people/actions";
import { cn } from "@/lib/cn";
import { submitOnEnterKeyDown, EnterHint, FieldError, invalidFieldClass } from "@/components/form-keys";
import { PERSON_TYPES, PERSON_TYPE_LABELS, PERSON_TYPE_HINTS, normalizePersonType } from "@/lib/person-types";
import { STAFF_CATEGORIES } from "@/lib/staff-id-shared";
import { Combobox } from "@/components/combobox";
import { Button, Select, FieldLabel } from "@/components/ui";
import type { ReactNode } from "react";

/**
 * One titled section of the form — the SAME chrome RecordPage draws around a
 * read-only section (bordered card, grey header strip, quiet uppercase title).
 *
 * The person form used to be 26 fields in a single two-column grid with one
 * divider, so "Also reports to" and "Also works for" sat among plain text boxes
 * and the whole thing read as a wall. It now uses the same five sections the
 * record shows — Identity · Role · Contact · Personal · Links — so reading a
 * person and editing one have identical bones.
 */
function FormSection({ title, children, studio = false, note }: { title: string; children: ReactNode; studio?: boolean; note?: ReactNode }) {
  if (studio) {
    // Studio (the person page's Edit tab): a white card, a sentence-case title.
    return (
      <section className="shrink-0 rounded-[20px] bg-[var(--st-surface)] px-5 py-4">
        <div className="mb-2.5 flex min-h-[22px] items-baseline justify-between gap-3">
          <h2 className="m-0 whitespace-nowrap text-[15px] font-semibold">{title}</h2>
          {note && <span className="truncate text-xs text-[var(--st-muted)]">{note}</span>}
        </div>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">{children}</div>
      </section>
    );
  }
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-bg-elev">
      <div className="border-b border-border bg-bg-subtle px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 px-3 py-3">{children}</div>
    </section>
  );
}

/** Studio groups the sections into columns; the Desk form has no wrapper at all
 *  (a `display: contents` div would swallow the space between its sections). */
function Col({ studio, children }: { studio: boolean; children: ReactNode }) {
  if (!studio) return <>{children}</>;
  // From xl the three columns fit the screen; a column scrolls on its own only
  // if one person has unusually much (a long list of companies).
  return <div className="st-scroll flex min-w-0 flex-col gap-3 xl:min-h-0 xl:overflow-y-auto">{children}</div>;
}
/** A field's help line — on the Desk form it is printed; in Studio it would push
 *  the form past one screen, so it becomes the label's tooltip instead. */
function Hint({ studio, children }: { studio: boolean; children: ReactNode }) {
  if (studio) return null;
  return <p className="mt-1 text-xs text-fg-subtle">{children}</p>;
}

const CHANNELS = ["WHATSAPP", "EMAIL", "SMS"] as const;

type Association = { companyId: number | ""; relationship: string };

export type Defaults = Partial<{
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
  studio = false,
  fit = false,
  afterRole,
  afterSave,
}: {
  /** The Studio person page: white cards in three columns, Studio controls. */
  studio?: boolean;
  /** Studio from xl: fill the fitted frame (no page scroll). */
  fit?: boolean;
  /** Rendered in the third column after Contact — the Studio page puts Portal access there. */
  afterRole?: ReactNode;
  /** Runs after the person is saved and before onComplete — the Studio page
   *  applies the portal level here, so a Director's "their companies" reach is
   *  worked out from the companies that were JUST saved. */
  afterSave?: () => Promise<{ ok: boolean; error?: string } | void>;
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
    try {
      const res = await extractPersonFields(scanText);
      setScanNote(noteForFill(applyProfileFields(res.fields), res.source));
    } finally {
      setScanning(false);
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
        if (afterSave) {
          const after = await afterSave();
          if (after && !after.ok) { setError(`Saved — but ${after.error ?? "the portal change failed."}`); return; }
        }
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

  const inputCls = studio
    ? "h-8 w-full rounded-[9px] border border-[var(--st-line)] bg-[var(--st-surface)] px-2.5 text-[13px] transition-colors focus:outline-none"
    : cn(
        "w-full rounded-lg border border-border bg-bg-subtle/60 text-sm transition-all",
        compact ? "px-2.5 py-1.5" : "px-3 py-2",
        "focus:outline-none focus:ring-2 focus:ring-accent/40"
      );
  const gap = studio ? "space-y-4" : compact ? "space-y-2.5" : "space-y-4";


  const autofill = (
    <details className={studio ? "group relative" : "rounded-xl border border-border bg-bg-subtle/40 p-3"}>
        <summary className={studio ? "flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-[9px] border border-[var(--st-line)] px-2.5 text-xs hover:bg-[var(--st-page)]" : "flex cursor-pointer list-none items-center gap-2 text-sm font-medium"}>
          <Sparkles size={14} className="text-accent" /> Auto-fill from a message
          {!studio && <span className="ml-auto text-xs font-normal text-fg-subtle">paste &amp; read</span>}
        </summary>
        <div className={studio ? "absolute left-0 top-full z-30 mt-2 w-[min(440px,85vw)] space-y-2 rounded-2xl border border-[var(--st-line)] bg-[var(--st-surface)] p-4 shadow-[0_16px_40px_rgba(17,18,20,0.14)]" : "mt-2.5 space-y-2"}>
          <textarea value={scanText} onChange={(e) => setScanText(e.target.value)} rows={3}
            className={cn(inputCls, studio && "h-auto py-2")} placeholder="Paste what they sent — name, DOB, passport no, address, contacts…" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={scanFill} disabled={scanning || !scanText.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50">
              {scanning ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {scanning ? "Reading…" : "Read & fill empty fields"}
            </button>
          </div>
          <p className="text-xs text-fg-subtle">Fills empty profile fields only — it never overwrites what is already there.</p>
          {scanNote && <p className="text-xs text-fg-muted">{scanNote}</p>}
        </div>
    </details>
  );
  // Related person — e.g. an immigration agent and the expat they help. Studio
  // shows it in Personal, beside Notes, so Identity is two rows.
  const relatedField = (
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
  );
  const errorLine = (
    <div className="flex items-start gap-1.5 text-xs text-danger">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
  );
  const actionBar = (
    <div className={studio ? "flex shrink-0 flex-wrap items-center justify-end gap-2 rounded-2xl bg-[var(--st-surface)] px-3 py-2" : "flex items-center justify-end gap-2 pt-1"}>
          {studio && autofill}
          <EnterHint className={studio ? "mr-auto hidden sm:flex" : "mr-auto"} verb={mode === "create" ? "create" : "save"} />
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
  );

  return (
    <form ref={formRef} action={action} className={studio ? cn("st-person-form flex flex-col gap-3", fit && "h-full min-h-0") : gap}>
      {/* Auto-fill from a pasted message (WhatsApp/email). Fills empty fields only.
          In Studio it opens from the action bar at the top, over the form. */}
      {!studio && autofill}
      {studio && actionBar}
      {studio && error && errorLine}

      <div className={studio ? cn("grid grid-cols-1 items-start gap-3 lg:grid-cols-2 xl:grid-cols-3", fit && "xl:min-h-0 xl:flex-1 xl:items-stretch") : "space-y-3"}>
        <Col studio={studio}>
        <FormSection studio={studio} title="Identity">
          <div className={studio ? undefined : "col-span-2"}>
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
          <div className={cn("col-span-2", studio && "order-last")}>
            <FieldLabel>Type</FieldLabel>
            <input type="hidden" name="personType" value={pType} />
            <div className={studio ? "grid grid-cols-2 gap-1.5 sm:grid-cols-4" : "grid grid-cols-2 gap-1.5"}>
              {PERSON_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPType(t)}
                  title={PERSON_TYPE_HINTS[t]}
                  className={studio
                    ? cn("h-8 truncate rounded-[9px] border px-2 text-xs transition-colors",
                        pType === t ? "border-[var(--st-ink)] bg-[var(--st-ink)] font-medium text-[var(--st-surface)]" : "border-[var(--st-line)] text-[var(--st-sub)] hover:bg-[var(--st-page)]")
                    : cn(
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

          <div className={studio ? undefined : "col-span-2"} title={studio ? "Sets the letter in the staff ID. Leave on Auto to read it from the job title." : undefined}>
            <FieldLabel>Staff ID category</FieldLabel>
            <Select name="staffCategory" defaultValue={defaults?.staffCategory ?? ""}>
              {STAFF_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
            <Hint studio={studio}>Sets the letter in the staff ID (e.g. CZ-<b>D</b>04). Leave on Auto to read it from the job title.</Hint>
          </div>
          {!studio && relatedField}

        </FormSection>
        <FormSection studio={studio} title="Personal">
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
          <div>
            <FieldLabel>Emergency contact</FieldLabel>
            <input name="emergencyContactName" defaultValue={defaults?.emergencyContactName ?? ""} className={inputCls} placeholder="Name" />
          </div>
          <div>
            <FieldLabel>Emergency phone</FieldLabel>
            <input name="emergencyContactPhone" type="tel" defaultValue={defaults?.emergencyContactPhone ?? ""} className={inputCls} placeholder="+255…" />
          </div>
          {studio && relatedField}
          <div className={studio ? undefined : "col-span-2"}>
            <FieldLabel>Notes</FieldLabel>
            <textarea
              name="notes"
              defaultValue={defaults?.notes ?? ""}
              rows={studio ? 1 : 2}
              className={cn(inputCls, studio && "h-auto min-h-8 py-1.5")}
              onKeyDown={submitOnEnterKeyDown}
              placeholder="Internal notes, escalation preferences, etc."
            />
          </div>
        </FormSection>
        </Col>

        <Col studio={studio}>
        <FormSection studio={studio} title="Role &amp; companies" note={studio ? "decides their portal reach" : undefined}>
          <div>
            <FieldLabel>Role / Job title</FieldLabel>
            <Combobox name="role" options={roles} defaultValue={defaults?.role ?? ""} className={inputCls} placeholder="e.g. Operations Manager" />
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
            <Hint studio={studio}>Their home company — it gives them their staff ID. Any others go right below.</Hint>
          </div>

          {/* Also works for — additional companies this person belongs to/serves.
              Feeds person_companies, so they appear under each company in pickers,
              company task lists and KPIs. Relationship label is optional.

              ⚠️ IT IS ALSO WHAT A PORTAL MANAGER SEES. `companyScope()` resolves a
              "their companies" role to main company ∪ these rows, so adding one
              here widens what that person can see in the portal. It used to sit
              in a separate "Links" section below Contact and Personal, which is
              why adding seven companies to somebody did not look like a
              permissions change. Say so on the screen. */}
          <div className="col-span-2">
            <FieldLabel>Also works for</FieldLabel>
            {!studio && <p className="mb-1.5 text-xs text-fg-subtle">
              Other companies they work for or serve — their tasks and records show under each one.
              {" "}If they have a portal sign-in as a <span className="font-medium">Manager</span>, this is also what they can see there.
            </p>}
            <div className={studio ? "st-scroll max-h-[124px] space-y-1.5 overflow-y-auto" : "space-y-2"}>
              {associations.length === 0 && (
                <p className="text-xs text-fg-subtle italic">None yet.</p>
              )}
              {associations.map((row, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Select
                    wrapperClassName="flex-1"
                    value={row.companyId === "" ? "" : String(row.companyId)}
                    onChange={(e) => updateAssociation(i, { companyId: e.target.value === "" ? "" : Number(e.target.value) })}
                  >
                    <option value="">— Company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
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
                    aria-label="Remove this company"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {!studio && <button
                type="button"
                onClick={addAssociation}
                className="tap-target inline-flex items-center gap-1 text-xs text-accent hover:opacity-80 transition-opacity"
              >
                <Plus size={13} /> Add company
              </button>}
            </div>
            {studio && <button type="button" onClick={addAssociation} className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--st-sub)] hover:text-[var(--st-ink)]"><Plus size={13} /> Add company</button>}
          </div>


          <div>
            <FieldLabel>Department</FieldLabel>
            <Combobox name="department" options={departments} defaultValue={defaults?.department ?? ""} className={inputCls} placeholder="e.g. Finance" />
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
            <Hint studio={studio}>Their line manager. Dotted-line ones go beside it.</Hint>
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
                        /* 12×12 without this — an unhittable target on a phone.
                           `tap-target` gives it a 40px hit area on phones only,
                           with no change to how it looks. */
                        className="tap-target text-fg-subtle hover:text-fg"
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
            <FieldLabel>Probation ends</FieldLabel>
            <input name="probationEndDate" type="date" defaultValue={defaults?.probationEndDate ?? ""}
              onChange={() => clearFieldError("probationEndDate")}
              aria-invalid={!!fieldErrors.probationEndDate}
              className={cn(inputCls, fieldErrors.probationEndDate && invalidFieldClass)} />
            <FieldError message={fieldErrors.probationEndDate} />
          </div>
        </FormSection>
        </Col>

        <Col studio={studio}>
        <FormSection studio={studio} title="Contact">
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
            <FieldLabel>Work site</FieldLabel>
            <Combobox name="workSite" options={sites} defaultValue={defaults?.workSite ?? ""} className={inputCls} placeholder="e.g. Matongo" />
          </div>

          <div>
            <FieldLabel>Residence</FieldLabel>
            <Combobox name="residence" options={sites} defaultValue={defaults?.residence ?? ""} className={inputCls} placeholder="e.g. Expat House A" />
          </div>

          <div className="col-span-2">
            <FieldLabel>Address</FieldLabel>
            <input name="address" defaultValue={defaults?.address ?? ""} className={inputCls} placeholder="Residential address" />
          </div>
        </FormSection>
        {afterRole}

        </Col>

      </div>

      {!studio && error && errorLine}
      {!studio && actionBar}
    </form>
  );
}
