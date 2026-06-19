// Profile suggestions — "the system tells you what to add". When a document is
// filed, the AI's structured read (profile fields + ledger facts) is PROPOSED
// here instead of written silently. The owner accepts/dismisses on the company
// or person profile (always-ask-first). Accept writes through to the real table
// reusing the existing blanks-only enrich helpers and the fact ledger, so the
// behaviour is identical to a manual entry.
//
// Sibling of automation-reactions (which advances PROCESSES); this fills RECORDS.
// Best-effort throughout: a suggestion never blocks a document from filing.

import { sb } from "@/db/supabase";
import { distinctiveTokens, shelfForCategory } from "@/lib/documents-shared";
import { listCustomShelves } from "@/lib/shelves";
import type { ExtractedFields } from "@/app/documents/actions";

export type SuggestionKind = "company-field" | "person-field" | "fact" | "new-shelf";
// pending = awaiting a tap; accepted = applied by a tap; applied = auto-applied on
// a clean read (visible + undoable); dismissed/undone = closed out.
export type SuggestionStatus = "pending" | "accepted" | "applied" | "dismissed" | "undone";

export type ProfileSuggestion = {
  id: number;
  kind: SuggestionKind;
  status: SuggestionStatus;
  documentId: number | null;
  personId: number | null;
  companyId: number | null;
  field: string;
  value: unknown;
  display: string | null;
  summary: string;
  detail: string | null;
  effectiveDate: string | null;
  source: string | null;
  createdAt: string;
};

const COLS =
  "id,kind,status,document_id,person_id,company_id,field,value,display,summary,detail,effective_date,source,created_at";

function mapRow(r: Record<string, unknown>): ProfileSuggestion {
  return {
    id: r.id as number,
    kind: r.kind as SuggestionKind,
    status: r.status as SuggestionStatus,
    documentId: (r.document_id as number | null) ?? null,
    personId: (r.person_id as number | null) ?? null,
    companyId: (r.company_id as number | null) ?? null,
    field: r.field as string,
    value: r.value,
    display: (r.display as string | null) ?? null,
    summary: r.summary as string,
    detail: (r.detail as string | null) ?? null,
    effectiveDate: (r.effective_date as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

// Human labels for the profile keys, so summaries read plainly.
const COMPANY_LABELS: Record<string, string> = {
  legalName: "Legal name",
  registrationNo: "Registration no.",
  tin: "TIN",
  vrn: "VRN / VAT",
  incorporationDate: "Incorporation date",
  address: "Address",
  phone: "Phone",
  email: "Email",
};
const PERSON_LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  whatsapp: "WhatsApp",
  role: "Role",
  dateOfBirth: "Date of birth",
  nationality: "Nationality",
  nationalId: "National ID",
  passportNo: "Passport no.",
  address: "Address",
  emergencyContactName: "Emergency contact",
  emergencyContactPhone: "Emergency phone",
  startDate: "Start date",
  probationEndDate: "Probation end",
  department: "Department",
};
// Company profile columns to check for "blank" at enqueue time (blanks-only).
const COMPANY_COL: Record<string, string> = {
  legalName: "legal_name",
  registrationNo: "registration_no",
  tin: "tin",
  vrn: "vrn",
  incorporationDate: "incorporation_date",
  address: "address",
  phone: "phone",
  email: "email",
};
const PERSON_COL: Record<string, string> = {
  email: "email",
  phone: "phone",
  whatsapp: "whatsapp",
  role: "role",
  dateOfBirth: "date_of_birth",
  nationality: "nationality",
  nationalId: "national_id",
  passportNo: "passport_no",
  address: "address",
  emergencyContactName: "emergency_contact_name",
  emergencyContactPhone: "emergency_contact_phone",
  startDate: "start_date",
  probationEndDate: "probation_end_date",
};

const isBlank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");

/** The owner's autonomy mode for the record-filling engine (auto/suggest/off),
 *  read directly from settings to avoid pulling the heavy reaction graph in. */
async function recordsMode(): Promise<"auto" | "suggest" | "off"> {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", "automation.mode.records").maybeSingle();
    const v = data?.value as string | null;
    if (v === "auto" || v === "suggest" || v === "off") return v;
  } catch { /* default below */ }
  return "auto";
}

/** Don't propose the same thing twice if a document is re-filed/re-saved — and,
 *  for a per-document field, don't re-nag something the owner already dismissed
 *  (the learning loop, Part C: a dismissal sticks for that document). */
async function alreadyProposed(
  documentId: number | null,
  kind: SuggestionKind,
  field: string,
  ownerCol: "company_id" | "person_id",
  ownerId: number
): Promise<boolean> {
  // Any prior row for this doc+field (pending/applied/accepted/dismissed/undone)
  // means it's already been handled once — never re-raise it on a re-file.
  let q = sb
    .from("profile_suggestions")
    .select("id")
    .eq("kind", kind)
    .eq("field", field)
    .eq(ownerCol, ownerId)
    .limit(1);
  if (documentId != null) q = q.eq("document_id", documentId);
  const { data } = await q;
  return !!(data && data.length);
}

/** New-shelf proposals are global (a shelf serves every company). Dedup by the
 *  proposed name across any owner/status — once asked (and answered), don't ask
 *  again, even if the type recurs. */
async function shelfAlreadyProposed(name: string): Promise<boolean> {
  const { data } = await sb
    .from("profile_suggestions")
    .select("id")
    .eq("kind", "new-shelf")
    .eq("field", name)
    .limit(1);
  return !!(data && data.length);
}

/** Propose a brand-new shelf when a company document is genuinely uncategorised
 *  yet names a distinct type the eight built-ins don't cover. Ask-first + global
 *  dedup — the owner accepts once and the shelf appears everywhere. */
async function maybeProposeShelf(opts: {
  documentId: number;
  companyId: number;
  category: string | null;
  title: string | null;
  docType: string | null;
}): Promise<boolean> {
  // Only for truly uncategorised docs — a known category already has a home.
  if (opts.category && opts.category !== "Other") return false;
  if (shelfForCategory(opts.category) !== "Operations & Branding") return false;
  const basis = opts.docType || opts.title || "";
  const tokens = distinctiveTokens(basis, 3);
  if (tokens.length === 0) return false;
  // Already covered by an existing custom shelf?
  const custom = await listCustomShelves();
  const hay = `${opts.category ?? ""} ${opts.title ?? ""} ${opts.docType ?? ""}`.toLowerCase();
  if (custom.some((c) => c.keywords.some((k) => k && hay.includes(k)))) return false;
  const name = tokens[0].charAt(0).toUpperCase() + tokens[0].slice(1);
  if (await shelfAlreadyProposed(name)) return false;
  await insert({
    kind: "new-shelf", status: "pending", document_id: opts.documentId, company_id: opts.companyId, person_id: null,
    field: name, value: { name, keywords: tokens }, display: name,
    summary: `Add a “${name}” shelf?`, detail: `“${opts.title ?? basis}” doesn’t fit your eight folders`,
  });
  return true;
}

async function insert(row: Record<string, unknown>): Promise<void> {
  await sb.from("profile_suggestions").insert({ ...row, created_at: new Date().toISOString(), created_by: "ai-intake" });
}

// What a write actually does, shared by Accept (tap) and Smart-auto (clean read)
// so behaviour is identical. Returns true only if something was really written —
// fields are blanks-only, so a field already filled writes nothing (and isn't
// logged as applied). `auto` only changes the fact's createdBy stamp (for undo).
type ApplyPayload = {
  kind: SuggestionKind;
  companyId: number | null;
  personId: number | null;
  field: string;
  value: unknown;
  display: string | null;
  documentId: number | null;
  effectiveDate: string | null;
  source: string | null;
};

async function applyWrite(s: ApplyPayload, auto: boolean): Promise<boolean> {
  if (s.kind === "company-field" && s.companyId) {
    const { enrichCompanyProfile } = await import("@/app/companies/[id]/actions");
    const r = await enrichCompanyProfile(s.companyId, { [s.field]: String(s.value) } as Record<string, string>);
    return r.ok && r.filled.length > 0;
  }
  if (s.kind === "person-field" && s.personId) {
    const { enrichPersonProfile } = await import("@/app/people/actions");
    const r = await enrichPersonProfile(s.personId, { [s.field]: String(s.value) } as Record<string, string>);
    return r.ok && r.filled.length > 0;
  }
  if (s.kind === "fact") {
    const { recordFact } = await import("@/lib/facts");
    const entity = s.companyId ? { type: "company" as const, id: s.companyId } : s.personId ? { type: "person" as const, id: s.personId } : null;
    if (!entity) return false;
    const f = await recordFact({
      entity, field: s.field, value: s.value as never, display: s.display ?? undefined,
      effectiveDate: s.effectiveDate ?? undefined, source: s.source, documentId: s.documentId,
      verified: true, createdBy: auto ? "ai-intake-auto" : "ai-intake-accepted",
    });
    return !!f;
  }
  if (s.kind === "new-shelf") {
    const { createCustomShelf } = await import("@/lib/shelves");
    const v = (s.value ?? {}) as { name?: string; keywords?: string[] };
    const name = v.name ?? s.field;
    const r = await createCustomShelf({ name, keywords: v.keywords ?? [name.toLowerCase()] });
    return r.ok;
  }
  return false;
}

/**
 * Turn a freshly-filed document's AI read into record changes. Smart-auto: when
 * the scan read cleanly, safe + reversible changes (blanks-only profile fields,
 * append-only facts) are APPLIED immediately and logged as "applied" (visible +
 * undoable). New shelves, and everything from a low-confidence read, are left
 * "pending" for a one-tap decision. Blanks-only + de-duped so a re-file never
 * stacks or overwrites. Returns how many suggestions were created.
 */
export async function enqueueDocumentSuggestions(opts: {
  documentId: number;
  companyId: number | null;
  personId: number | null;
  fields: ExtractedFields;
  source: string;
  /** The document read cleanly (not flagged needs-review / awaiting-original).
   *  Only clean reads auto-apply; a shaky scan always waits for a tap. */
  clean?: boolean;
}): Promise<number> {
  const { documentId, companyId, personId, fields, source } = opts;
  // The owner's Autonomy dial (Settings → Automations → "Fill records from
  // documents"): auto = smart-auto on a clean read; suggest = always wait for a
  // tap; off = don't even propose. Default auto.
  const mode = await recordsMode();
  if (mode === "off") return 0;
  const clean = mode === "auto" && (opts.clean ?? false);
  let made = 0;

  // Insert a row, auto-applying first when the read is clean and the kind is safe
  // to apply unattended (everything except a new shelf).
  async function emit(row: Record<string, unknown>, apply: ApplyPayload): Promise<void> {
    let status = "pending";
    let acted: string | null = null;
    if (clean && apply.kind !== "new-shelf") {
      const wrote = await applyWrite(apply, true);
      if (wrote) { status = "applied"; acted = new Date().toISOString(); }
    }
    await insert({ ...row, status, acted_at: acted });
    made++;
  }

  try {
    // ── Company profile fields ──────────────────────────────────────────
    if (companyId && fields.company && Object.keys(fields.company).length) {
      const { data: company } = await sb
        .from("companies")
        .select("name,legal_name,registration_no,tin,vrn,incorporation_date,address,phone,email")
        .eq("id", companyId)
        .maybeSingle();
      const who = (company?.name as string | null) ?? "this company";
      for (const [key, raw] of Object.entries(fields.company)) {
        const val = typeof raw === "string" ? raw.trim() : raw;
        const col = COMPANY_COL[key];
        if (!val || !col) continue;
        if (company && !isBlank((company as Record<string, unknown>)[col])) continue; // blanks-only
        if (await alreadyProposed(documentId, "company-field", key, "company_id", companyId)) continue;
        const label = COMPANY_LABELS[key] ?? key;
        await emit(
          { kind: "company-field", document_id: documentId, company_id: companyId, person_id: null,
            field: key, value: val, display: String(val), source,
            summary: `Add ${label} “${val}” to ${who}`, detail: `Read from “${source}”` },
          { kind: "company-field", companyId, personId: null, field: key, value: val, display: String(val), documentId, effectiveDate: null, source }
        );
      }
    }

    // ── Person profile fields ───────────────────────────────────────────
    if (personId && fields.person && Object.keys(fields.person).length) {
      const { data: person } = await sb
        .from("people")
        .select("name,email,phone,whatsapp,role,date_of_birth,nationality,national_id,passport_no,address,emergency_contact_name,emergency_contact_phone,start_date,probation_end_date")
        .eq("id", personId)
        .maybeSingle();
      const who = (person?.name as string | null) ?? "this person";
      for (const [key, raw] of Object.entries(fields.person)) {
        const val = typeof raw === "string" ? raw.trim() : raw;
        const col = PERSON_COL[key];
        if (!val) continue;
        if (col && person && !isBlank((person as Record<string, unknown>)[col])) continue;
        if (!col && !["department"].includes(key)) continue; // skip name-resolve keys we don't surface
        if (await alreadyProposed(documentId, "person-field", key, "person_id", personId)) continue;
        const label = PERSON_LABELS[key] ?? key;
        await emit(
          { kind: "person-field", document_id: documentId, person_id: personId, company_id: null,
            field: key, value: val, display: String(val), source,
            summary: `Add ${label} “${val}” to ${who}`, detail: `Read from “${source}”` },
          { kind: "person-field", companyId: null, personId, field: key, value: val, display: String(val), documentId, effectiveDate: null, source }
        );
      }
    }

    // ── Ledger facts (salary, directors, shareholding…) ─────────────────
    for (const f of fields.facts ?? []) {
      const ownerCol = f.entityType === "company" ? "company_id" : "person_id";
      const ownerId = f.entityType === "company" ? companyId : personId;
      if (!ownerId) continue;
      if (await alreadyProposed(documentId, "fact", f.field, ownerCol, ownerId)) continue;
      const display = typeof f.value === "string" ? f.value : JSON.stringify(f.value);
      const eff = f.effectiveDate ? new Date(f.effectiveDate).toISOString() : null;
      await emit(
        { kind: "fact", document_id: documentId,
          company_id: f.entityType === "company" ? ownerId : null,
          person_id: f.entityType === "person" ? ownerId : null,
          field: f.field, value: f.value, display, source, effective_date: eff,
          summary: `Record ${f.field}: ${display}`, detail: `Read from “${source}”` },
        { kind: "fact", companyId: f.entityType === "company" ? ownerId : null, personId: f.entityType === "person" ? ownerId : null,
          field: f.field, value: f.value, display, documentId, effectiveDate: eff, source }
      );
    }

    // ── New-shelf proposal (Part D) — always ask, never auto ────────────
    if (companyId) {
      const proposed = await maybeProposeShelf({
        documentId, companyId,
        category: fields.category ?? null, title: fields.title ?? null, docType: fields.docType ?? null,
      });
      if (proposed) made++;
    }
  } catch { /* best-effort — never block the file from being filed */ }
  return made;
}

/** Pending (or any-status) suggestions for an owner, newest first. */
export async function listProfileSuggestions(opts: {
  companyId?: number;
  personId?: number;
  status?: SuggestionStatus;
}): Promise<ProfileSuggestion[]> {
  let q = sb.from("profile_suggestions").select(COLS).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (opts.companyId != null) q = q.eq("company_id", opts.companyId);
  if (opts.personId != null) q = q.eq("person_id", opts.personId);
  q = q.eq("status", opts.status ?? "pending");
  const { data } = await q;
  return (data ?? []).map(mapRow);
}

async function getSuggestion(id: number): Promise<ProfileSuggestion | null> {
  const { data } = await sb.from("profile_suggestions").select(COLS).eq("id", id).maybeSingle();
  return data ? mapRow(data) : null;
}

async function markActed(id: number, status: SuggestionStatus): Promise<void> {
  await sb.from("profile_suggestions").update({ status, acted_at: new Date().toISOString() }).eq("id", id);
}

function payloadOf(s: ProfileSuggestion): ApplyPayload {
  return {
    kind: s.kind, companyId: s.companyId, personId: s.personId, field: s.field,
    value: s.value, display: s.display, documentId: s.documentId, effectiveDate: s.effectiveDate, source: s.source,
  };
}

/**
 * Accept a pending suggestion — write it through to the real record, then mark
 * accepted. Reuses the same blanks-only enrich helpers + append-only ledger as
 * Smart-auto, so a tap and an auto-apply do exactly the same thing.
 */
export async function acceptProfileSuggestion(id: number): Promise<{ ok: boolean; error?: string }> {
  const s = await getSuggestion(id);
  if (!s) return { ok: false, error: "Suggestion not found." };
  if (s.status !== "pending") return { ok: true }; // already actioned — idempotent
  try {
    await applyWrite(payloadOf(s), false);
    await markActed(id, "accepted");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not apply the suggestion." };
  }
}

export async function dismissProfileSuggestion(id: number): Promise<{ ok: boolean }> {
  await markActed(id, "dismissed");
  return { ok: true };
}

/**
 * Undo an auto-applied change. Fields revert to blank (only if the value still
 * matches what we wrote — a value the owner has since edited is left alone); facts
 * delete the auto-recorded ledger row. Safe + idempotent. (New shelves aren't
 * auto-applied, so there's nothing to undo here for them.)
 */
export async function undoProfileSuggestion(id: number): Promise<{ ok: boolean; error?: string }> {
  const s = await getSuggestion(id);
  if (!s) return { ok: false, error: "Not found." };
  if (s.status !== "applied") return { ok: true }; // only auto-applied rows can be undone
  try {
    if (s.kind === "company-field" && s.companyId) {
      const col = COMPANY_COL[s.field];
      if (col) {
        const { data } = await sb.from("companies").select(col).eq("id", s.companyId).maybeSingle();
        const cur = (data as Record<string, unknown> | null)?.[col];
        if (cur != null && String(cur).startsWith(String(s.value))) {
          await sb.from("companies").update({ [col]: null }).eq("id", s.companyId);
        }
      }
    } else if (s.kind === "person-field" && s.personId) {
      const col = PERSON_COL[s.field];
      if (col) {
        const { data } = await sb.from("people").select(col).eq("id", s.personId).maybeSingle();
        const cur = (data as Record<string, unknown> | null)?.[col];
        if (cur != null && String(cur).startsWith(String(s.value))) {
          await sb.from("people").update({ [col]: null }).eq("id", s.personId);
        }
      }
    } else if (s.kind === "fact") {
      const ownerCol = s.companyId ? "company_id" : "person_id";
      const ownerId = s.companyId ?? s.personId;
      if (ownerId && s.documentId != null) {
        await sb.from("facts").delete()
          .eq(ownerCol, ownerId).eq("field", s.field).eq("document_id", s.documentId).eq("created_by", "ai-intake-auto");
      }
    }
    await markActed(id, "undone");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not undo." };
  }
}
