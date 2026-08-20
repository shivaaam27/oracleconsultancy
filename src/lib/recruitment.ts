// ─────────────────────────────────────────────────────────────────────────────
// THE RECRUITMENT DESK — reading and writing the records (Phase 1).
//
// ⚠️ SERVER-ONLY. This imports `sb`, the service-role Supabase client. A client
// component that value-imports this file drags the service key into the browser
// bundle and every page dies with "SUPABASE_SERVICE_ROLE_KEY is not set". The
// client half is `recruitment-shared.ts` — pure, no imports. That split is a
// hard rule in CLAUDE.md and it has been broken before.
//
// ⚠️ ONE DOOR FOR WRITES. Everything that changes a client, a candidate or a
// job order goes through the `create*`/`update*`/`archive*` functions here. The
// server actions in app/recruitment/actions.ts are thin wrappers over them. A
// second insert path is how a module drifts out of its own audit trail — the
// same reason `createTaskCore` and `postVoucher()` exist.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
import { jobOrderRef, jobOrderRefPrefix, jobOrderRefSequence } from "@/lib/recruitment-shared";

export type WriteResult = { ok: true; id?: number; ref?: string } | { ok: false; error: string };

/* ⚠️ ONE STRING LITERAL, on one line, however long. supabase-js parses these at
   the TYPE level to work out the row shape; split across lines with `+` it
   widens to `string`, the parser gives up, and every row comes back typed as
   `GenericStringError` instead of your columns. */
const CLIENT_COLS = "id,company_id,name,sector,city,contact_name,contact_email,contact_phone,local_employees,foreign_employees,terms_signed_on,dsa_signed_on,notes,archived,created_by,created_at,updated_at";
const CANDIDATE_COLS = "id,company_id,name,title,sector,origin,years_exp,seniority,expected_salary_usd,email,phone,passport_no,passport_expiry,ecnr,id_verified,partner_name,consent_signed_on,engagement_signed_on,notes,archived,created_by,created_at,updated_at";
const ORDER_COLS = "id,company_id,ref,client_id,title,sector,seniority,monthly_gross_usd,stage,opened_on,target_start_on,signed_on,expat_start_year,permit_expiry,notes,archived,created_by,created_at,updated_at";

/** An ISO date string out of whatever a form sent, or null. Empty means null —
 *  never today, and never the epoch. */
function isoDate(v: string | null | undefined): string | null {
  if (!v || !v.trim()) return null;
  const d = new Date(v.length === 10 ? v + "T00:00:00Z" : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A number out of a form field, or null. A blank box is NOT a zero. */
function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function trimOrNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/* ─────────────────────────────────────────────────────────────── clients ── */

export type RecClient = {
  id: number;
  companyId: number;
  name: string;
  sector: string | null;
  city: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  localEmployees: number | null;
  foreignEmployees: number | null;
  termsSignedOn: string | null;
  dsaSignedOn: string | null;
  notes: string | null;
  archived: boolean;
};

export type ClientFields = {
  companyId: number;
  name: string;
  sector?: string | null;
  city?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  localEmployees?: string | number | null;
  foreignEmployees?: string | number | null;
  termsSignedOn?: string | null;
  dsaSignedOn?: string | null;
  notes?: string | null;
};

function clientRow(r: Record<string, unknown>): RecClient {
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    name: r.name as string,
    sector: (r.sector as string) ?? null,
    city: (r.city as string) ?? null,
    contactName: (r.contact_name as string) ?? null,
    contactEmail: (r.contact_email as string) ?? null,
    contactPhone: (r.contact_phone as string) ?? null,
    localEmployees: (r.local_employees as number) ?? null,
    foreignEmployees: (r.foreign_employees as number) ?? null,
    termsSignedOn: (r.terms_signed_on as string) ?? null,
    dsaSignedOn: (r.dsa_signed_on as string) ?? null,
    notes: (r.notes as string) ?? null,
    archived: Boolean(r.archived),
  };
}

export async function listClients(companyId: number, includeArchived = false): Promise<RecClient[]> {
  let q = sb.from("rec_clients").select(CLIENT_COLS).eq("company_id", companyId);
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q.order("name");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(clientRow);
}

export async function getClient(id: number): Promise<RecClient | null> {
  const { data } = await sb.from("rec_clients").select(CLIENT_COLS).eq("id", id).maybeSingle();
  return data ? clientRow(data as unknown as Record<string, unknown>) : null;
}

function clientPatch(f: Partial<ClientFields>) {
  const p: Record<string, unknown> = {};
  if (f.name !== undefined) p.name = f.name.trim();
  if (f.sector !== undefined) p.sector = trimOrNull(f.sector);
  if (f.city !== undefined) p.city = trimOrNull(f.city);
  if (f.contactName !== undefined) p.contact_name = trimOrNull(f.contactName);
  if (f.contactEmail !== undefined) p.contact_email = trimOrNull(f.contactEmail);
  if (f.contactPhone !== undefined) p.contact_phone = trimOrNull(f.contactPhone);
  if (f.localEmployees !== undefined) p.local_employees = numOrNull(f.localEmployees);
  if (f.foreignEmployees !== undefined) p.foreign_employees = numOrNull(f.foreignEmployees);
  if (f.termsSignedOn !== undefined) p.terms_signed_on = isoDate(f.termsSignedOn);
  if (f.dsaSignedOn !== undefined) p.dsa_signed_on = isoDate(f.dsaSignedOn);
  if (f.notes !== undefined) p.notes = trimOrNull(f.notes);
  return p;
}

export async function createClient(f: ClientFields, createdBy = "web-ui"): Promise<WriteResult> {
  const { data, error } = await sb
    .from("rec_clients")
    .insert({ company_id: f.companyId, ...clientPatch(f), created_by: createdBy })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: number }).id };
}

export async function updateClient(id: number, patch: Partial<ClientFields>): Promise<WriteResult> {
  const { error } = await sb
    .from("rec_clients")
    .update({ ...clientPatch(patch), updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, id };
}

/** Archive, never delete — the house rule everywhere in COS. A client's history
 *  is the evidence trail behind every placement made for them. */
export async function archiveClient(id: number, archived = true): Promise<WriteResult> {
  const { error } = await sb
    .from("rec_clients")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, id };
}

/* ──────────────────────────────────────────────────────────── candidates ── */

export type RecCandidate = {
  id: number;
  companyId: number;
  name: string;
  title: string | null;
  sector: string | null;
  origin: string;
  yearsExp: number | null;
  seniority: string | null;
  expectedSalaryUsd: string | null;
  email: string | null;
  phone: string | null;
  passportNo: string | null;
  passportExpiry: string | null;
  ecnr: boolean;
  idVerified: boolean;
  partnerName: string | null;
  consentSignedOn: string | null;
  engagementSignedOn: string | null;
  notes: string | null;
  archived: boolean;
};

export type CandidateFields = {
  companyId: number;
  name: string;
  title?: string | null;
  sector?: string | null;
  origin?: string | null;
  yearsExp?: string | number | null;
  seniority?: string | null;
  expectedSalaryUsd?: string | number | null;
  email?: string | null;
  phone?: string | null;
  passportNo?: string | null;
  passportExpiry?: string | null;
  ecnr?: boolean;
  idVerified?: boolean;
  partnerName?: string | null;
  consentSignedOn?: string | null;
  engagementSignedOn?: string | null;
  notes?: string | null;
};

function candidateRow(r: Record<string, unknown>): RecCandidate {
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    name: r.name as string,
    title: (r.title as string) ?? null,
    sector: (r.sector as string) ?? null,
    origin: (r.origin as string) ?? "india",
    yearsExp: (r.years_exp as number) ?? null,
    seniority: (r.seniority as string) ?? null,
    expectedSalaryUsd: (r.expected_salary_usd as string) ?? null,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    passportNo: (r.passport_no as string) ?? null,
    passportExpiry: (r.passport_expiry as string) ?? null,
    ecnr: Boolean(r.ecnr),
    idVerified: Boolean(r.id_verified),
    partnerName: (r.partner_name as string) ?? null,
    consentSignedOn: (r.consent_signed_on as string) ?? null,
    engagementSignedOn: (r.engagement_signed_on as string) ?? null,
    notes: (r.notes as string) ?? null,
    archived: Boolean(r.archived),
  };
}

export async function listCandidates(companyId: number, includeArchived = false): Promise<RecCandidate[]> {
  let q = sb.from("rec_candidates").select(CANDIDATE_COLS).eq("company_id", companyId);
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q.order("name");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(candidateRow);
}

export async function getCandidate(id: number): Promise<RecCandidate | null> {
  const { data } = await sb.from("rec_candidates").select(CANDIDATE_COLS).eq("id", id).maybeSingle();
  return data ? candidateRow(data as unknown as Record<string, unknown>) : null;
}

function candidatePatch(f: Partial<CandidateFields>) {
  const p: Record<string, unknown> = {};
  if (f.name !== undefined) p.name = f.name.trim();
  if (f.title !== undefined) p.title = trimOrNull(f.title);
  if (f.sector !== undefined) p.sector = trimOrNull(f.sector);
  if (f.origin !== undefined) p.origin = trimOrNull(f.origin) ?? "india";
  if (f.yearsExp !== undefined) p.years_exp = numOrNull(f.yearsExp);
  if (f.seniority !== undefined) p.seniority = trimOrNull(f.seniority);
  if (f.expectedSalaryUsd !== undefined) p.expected_salary_usd = numOrNull(f.expectedSalaryUsd);
  if (f.email !== undefined) p.email = trimOrNull(f.email);
  if (f.phone !== undefined) p.phone = trimOrNull(f.phone);
  if (f.passportNo !== undefined) p.passport_no = trimOrNull(f.passportNo);
  if (f.passportExpiry !== undefined) p.passport_expiry = isoDate(f.passportExpiry);
  if (f.ecnr !== undefined) p.ecnr = !!f.ecnr;
  if (f.idVerified !== undefined) p.id_verified = !!f.idVerified;
  if (f.partnerName !== undefined) p.partner_name = trimOrNull(f.partnerName);
  if (f.consentSignedOn !== undefined) p.consent_signed_on = isoDate(f.consentSignedOn);
  if (f.engagementSignedOn !== undefined) p.engagement_signed_on = isoDate(f.engagementSignedOn);
  if (f.notes !== undefined) p.notes = trimOrNull(f.notes);
  return p;
}

export async function createCandidate(f: CandidateFields, createdBy = "web-ui"): Promise<WriteResult> {
  const { data, error } = await sb
    .from("rec_candidates")
    .insert({ company_id: f.companyId, ...candidatePatch(f), created_by: createdBy })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: number }).id };
}

export async function updateCandidate(id: number, patch: Partial<CandidateFields>): Promise<WriteResult> {
  const { error } = await sb
    .from("rec_candidates")
    .update({ ...candidatePatch(patch), updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, id };
}

export async function archiveCandidate(id: number, archived = true): Promise<WriteResult> {
  const { error } = await sb
    .from("rec_candidates")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, id };
}

/* ──────────────────────────────────────────────────────────── job orders ── */

export type RecJobOrder = {
  id: number;
  companyId: number;
  ref: string;
  clientId: number | null;
  clientName: string | null;
  title: string;
  sector: string | null;
  seniority: string | null;
  monthlyGrossUsd: string | null;
  stage: string;
  openedOn: string | null;
  targetStartOn: string | null;
  signedOn: string | null;
  expatStartYear: number | null;
  permitExpiry: string | null;
  notes: string | null;
  archived: boolean;
};

export type JobOrderFields = {
  companyId: number;
  /** Null or absent means Oracle is hiring for itself. */
  clientId?: number | null;
  title: string;
  sector?: string | null;
  seniority?: string | null;
  monthlyGrossUsd?: string | number | null;
  stage?: string | null;
  openedOn?: string | null;
  targetStartOn?: string | null;
  signedOn?: string | null;
  expatStartYear?: string | number | null;
  permitExpiry?: string | null;
  notes?: string | null;
};

function orderRow(r: Record<string, unknown>): RecJobOrder {
  /* PostgREST returns an embedded parent as an object, or as an array when it
     cannot tell the relationship is to-one. Handle both rather than trusting
     one shape. */
  const embedded = r.rec_clients as { name?: string } | { name?: string }[] | null | undefined;
  const clientName = Array.isArray(embedded) ? (embedded[0]?.name ?? null) : (embedded?.name ?? null);
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    ref: r.ref as string,
    clientId: (r.client_id as number) ?? null,
    clientName,
    title: r.title as string,
    sector: (r.sector as string) ?? null,
    seniority: (r.seniority as string) ?? null,
    monthlyGrossUsd: (r.monthly_gross_usd as string) ?? null,
    stage: (r.stage as string) ?? "Sourcing",
    openedOn: (r.opened_on as string) ?? null,
    targetStartOn: (r.target_start_on as string) ?? null,
    signedOn: (r.signed_on as string) ?? null,
    expatStartYear: (r.expat_start_year as number) ?? null,
    permitExpiry: (r.permit_expiry as string) ?? null,
    notes: (r.notes as string) ?? null,
    archived: Boolean(r.archived),
  };
}

export async function listJobOrders(companyId: number, includeArchived = false): Promise<RecJobOrder[]> {
  let q = sb
    .from("rec_job_orders")
    .select(`${ORDER_COLS},rec_clients(name)`)
    .eq("company_id", companyId);
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q.order("opened_on", { ascending: true, nullsFirst: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(orderRow);
}

export async function getJobOrder(companyId: number, ref: string): Promise<RecJobOrder | null> {
  const { data } = await sb
    .from("rec_job_orders")
    .select(`${ORDER_COLS},rec_clients(name)`)
    .eq("company_id", companyId)
    .eq("ref", ref)
    .maybeSingle();
  return data ? orderRow(data as unknown as Record<string, unknown>) : null;
}

/**
 * The next free reference for the month a job order is opened in.
 *
 * Read-then-write, which is not watertight under concurrency — but this is a
 * single-operator desk, and the unique index on (company, ref) is the real
 * guard: a collision fails the insert rather than quietly producing two
 * JO-2608-04s. `createJobOrder` retries once.
 */
async function nextRef(companyId: number, opened: Date): Promise<string> {
  const prefix = jobOrderRefPrefix(opened);
  const { data } = await sb
    .from("rec_job_orders")
    .select("ref")
    .eq("company_id", companyId)
    .like("ref", `${prefix}%`);
  const highest = ((data ?? []) as { ref: string }[])
    .reduce((max, r) => Math.max(max, jobOrderRefSequence(r.ref)), 0);
  return jobOrderRef(opened, highest + 1);
}

function orderPatch(f: Partial<JobOrderFields>) {
  const p: Record<string, unknown> = {};
  if (f.clientId !== undefined) p.client_id = f.clientId ?? null;
  if (f.title !== undefined) p.title = f.title.trim();
  if (f.sector !== undefined) p.sector = trimOrNull(f.sector);
  if (f.seniority !== undefined) p.seniority = trimOrNull(f.seniority);
  if (f.monthlyGrossUsd !== undefined) p.monthly_gross_usd = numOrNull(f.monthlyGrossUsd);
  if (f.stage !== undefined && f.stage) p.stage = f.stage;
  if (f.openedOn !== undefined) p.opened_on = isoDate(f.openedOn);
  if (f.targetStartOn !== undefined) p.target_start_on = isoDate(f.targetStartOn);
  if (f.signedOn !== undefined) p.signed_on = isoDate(f.signedOn);
  if (f.expatStartYear !== undefined) p.expat_start_year = numOrNull(f.expatStartYear);
  if (f.permitExpiry !== undefined) p.permit_expiry = isoDate(f.permitExpiry);
  if (f.notes !== undefined) p.notes = trimOrNull(f.notes);
  return p;
}

export async function createJobOrder(f: JobOrderFields, createdBy = "web-ui"): Promise<WriteResult> {
  const openedIso = isoDate(f.openedOn) ?? new Date().toISOString();
  const opened = new Date(openedIso);

  for (let attempt = 0; attempt < 2; attempt++) {
    const ref = await nextRef(f.companyId, opened);
    const { data, error } = await sb
      .from("rec_job_orders")
      .insert({
        company_id: f.companyId,
        ref,
        ...orderPatch({ ...f, openedOn: openedIso }),
        created_by: createdBy,
      })
      .select("id,ref")
      .single();
    if (!error) {
      const row = data as { id: number; ref: string };
      return { ok: true, id: row.id, ref: row.ref };
    }
    // 23505 = unique violation: somebody took that reference between the read
    // and the write. Try once more for the next number, then give up honestly.
    if (error.code !== "23505" || attempt === 1) return { ok: false, error: error.message };
  }
  return { ok: false, error: "Could not allocate a job order reference." };
}

export async function updateJobOrder(id: number, patch: Partial<JobOrderFields>): Promise<WriteResult> {
  const { error } = await sb
    .from("rec_job_orders")
    .update({ ...orderPatch(patch), updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, id };
}

export async function archiveJobOrder(id: number, archived = true): Promise<WriteResult> {
  const { error } = await sb
    .from("rec_job_orders")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, id };
}

/* ─────────────────────────────────────────────────────────── the company ── */

/**
 * Which company runs the desk.
 *
 * It is Oracle Consultancy Ltd, and CLAUDE.md's first rule is that the company
 * list is NEVER hard-coded — so it is looked up by its `code_prefix`, which is
 * the one thing about a company that does not change (both of the renamed
 * companies kept theirs). Falls back to matching the name so a changed prefix
 * cannot take the whole module down.
 */
export async function agencyCompanyId(): Promise<number | null> {
  const { data } = await sb
    .from("companies")
    .select("id,name,code_prefix")
    .or("code_prefix.eq.OC,name.ilike.%Oracle Consultancy%")
    .limit(1)
    .maybeSingle();
  return data ? ((data as { id: number }).id) : null;
}

/* ═══════════════════════════════════════════════════ PHASE 2 — end to end ══ */

const SHORTLIST_COLS = "id,company_id,job_order_id,candidate_id,stage,match_note,decline_reason,sent_to_client_on,notes,created_by,created_at,updated_at";
const INTERVIEW_COLS = "id,company_id,shortlist_id,kind,scheduled_for,outcome,note,created_by,created_at,updated_at";
const PLACEMENT_COLS = "id,company_id,job_order_id,candidate_id,shortlist_id,accepted_on,started_on,monthly_gross_usd,ended_on,ended_reason,fault,replacement_of_id,notes,created_by,created_at,updated_at";
const CHECKIN_COLS = "id,company_id,placement_id,day,party,spoke_on,note,created_by,created_at";

/**
 * PostgREST hands an embedded parent back as an object, or as an ARRAY when it
 * cannot tell the relationship is to-one. Take either, and always hand back a
 * readable bag rather than null — every caller wants a field off it, and a
 * missing embed should read as a missing field, not crash the row.
 */
function one(v: unknown): Record<string, unknown> {
  if (Array.isArray(v)) return (v[0] as Record<string, unknown>) ?? {};
  return (v as Record<string, unknown> | null) ?? {};
}

/* ─────────────────────────────────────────────────────────── shortlist ───── */

export type ShortlistEntry = {
  id: number;
  jobOrderId: number;
  candidateId: number;
  stage: string;
  matchNote: string | null;
  declineReason: string | null;
  sentToClientOn: string | null;
  notes: string | null;
  /** Joined, for the screens. */
  candidateName: string;
  candidateTitle: string | null;
  candidateSector: string | null;
  candidateSeniority: string | null;
  candidateSalaryUsd: string | null;
  candidatePassportExpiry: string | null;
  orderRef: string;
  orderTitle: string;
  orderSeniority: string | null;
  orderSector: string | null;
  orderGrossUsd: string | null;
  clientName: string | null;
};

const SHORTLIST_EMBED =
  `${SHORTLIST_COLS},rec_candidates(name,title,sector,seniority,expected_salary_usd,passport_expiry),rec_job_orders(ref,title,seniority,sector,monthly_gross_usd,rec_clients(name))`;

function shortlistRow(r: Record<string, unknown>): ShortlistEntry {
  const c = one(r.rec_candidates);
  const o = one(r.rec_job_orders);
  const cl = one(o.rec_clients);
  return {
    id: r.id as number,
    jobOrderId: r.job_order_id as number,
    candidateId: r.candidate_id as number,
    stage: (r.stage as string) ?? "Sourced",
    matchNote: (r.match_note as string) ?? null,
    declineReason: (r.decline_reason as string) ?? null,
    sentToClientOn: (r.sent_to_client_on as string) ?? null,
    notes: (r.notes as string) ?? null,
    candidateName: (c.name as string) ?? "",
    candidateTitle: (c.title as string) ?? null,
    candidateSector: (c.sector as string) ?? null,
    candidateSeniority: (c.seniority as string) ?? null,
    candidateSalaryUsd: (c.expected_salary_usd as string) ?? null,
    candidatePassportExpiry: (c.passport_expiry as string) ?? null,
    orderRef: (o.ref as string) ?? "",
    orderTitle: (o.title as string) ?? "",
    orderSeniority: (o.seniority as string) ?? null,
    orderSector: (o.sector as string) ?? null,
    orderGrossUsd: (o.monthly_gross_usd as string) ?? null,
    clientName: (cl.name as string) ?? null,
  };
}

export async function listShortlist(jobOrderId: number): Promise<ShortlistEntry[]> {
  const { data } = await sb
    .from("rec_shortlist")
    .select(SHORTLIST_EMBED)
    .eq("job_order_id", jobOrderId)
    .order("created_at");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(shortlistRow);
}

/** Everything sitting in front of a client, across every order — the chase list. */
export async function listShortlistsWithClient(companyId: number): Promise<ShortlistEntry[]> {
  const { data } = await sb
    .from("rec_shortlist")
    .select(SHORTLIST_EMBED)
    .eq("company_id", companyId)
    .in("stage", ["Shortlisted", "Interviewing", "Offered"])
    .order("sent_to_client_on", { ascending: true, nullsFirst: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(shortlistRow);
}

export type ShortlistFields = {
  stage?: string | null;
  matchNote?: string | null;
  declineReason?: string | null;
  sentToClientOn?: string | null;
  notes?: string | null;
};

/**
 * Put a candidate on a job order's shortlist.
 *
 * ⚠️ The MATCH SCORE is not written anywhere — it is worked out from the
 * candidate and the order whenever either is read. What IS written is the
 * sourcer's reasoning, because that is the thing the client is promised and the
 * thing no formula can produce.
 */
export async function addToShortlist(
  companyId: number, jobOrderId: number, candidateId: number, matchNote?: string | null, createdBy = "web-ui",
): Promise<WriteResult> {
  const { data, error } = await sb
    .from("rec_shortlist")
    .insert({
      company_id: companyId,
      job_order_id: jobOrderId,
      candidate_id: candidateId,
      stage: "Sourced",
      match_note: trimOrNull(matchNote),
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: number }).id };
}

export async function updateShortlist(id: number, patch: ShortlistFields): Promise<WriteResult> {
  const p: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.stage !== undefined && patch.stage) p.stage = patch.stage;
  if (patch.matchNote !== undefined) p.match_note = trimOrNull(patch.matchNote);
  if (patch.declineReason !== undefined) p.decline_reason = trimOrNull(patch.declineReason);
  if (patch.sentToClientOn !== undefined) p.sent_to_client_on = isoDate(patch.sentToClientOn);
  if (patch.notes !== undefined) p.notes = trimOrNull(patch.notes);

  // A stage moving off Declined has to let go of the reason, or the row keeps
  // saying why somebody was turned down who is back in the running.
  if (patch.stage && patch.stage !== "Declined" && patch.declineReason === undefined) p.decline_reason = null;

  const { error } = await sb.from("rec_shortlist").update(p).eq("id", id);
  if (error) return { ok: false, error: error.message };

  /* Typing the date it went to the client IS the candidate reaching the client,
     so the stage follows — the same reasoning as booking an interview moving
     somebody to Interviewing. Without this, "With the client" would count the
     wait on a row it does not list, which is the sort of quiet disagreement
     nobody notices until the figures are wrong. */
  if (patch.stage === undefined && p.sent_to_client_on) {
    await sb.from("rec_shortlist")
      .update({ stage: "Shortlisted", updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("stage", ["Sourced", "Screened"]);
  }
  return { ok: true, id };
}

/**
 * Take a candidate off a shortlist entirely.
 *
 * ⚠️ ONLY while they are still "Sourced" — nobody outside Oracle has seen them,
 * so there is nothing to explain. Once a name has gone to a client the honest
 * record is a DECLINE WITH A REASON, not a deletion: the reason is what a fee
 * dispute is argued in, and the database refuses a Declined row without one.
 */
export async function removeFromShortlist(id: number): Promise<WriteResult> {
  const { data } = await sb.from("rec_shortlist").select("stage").eq("id", id).maybeSingle();
  const stage = (data as { stage?: string } | null)?.stage;
  if (stage && stage !== "Sourced") {
    return { ok: false, error: "This candidate has already gone to the client. Decline them with a reason instead." };
  }
  const { error } = await sb.from("rec_shortlist").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, id };
}

/* ─────────────────────────────────────────────────────────── interviews ──── */

export type Interview = {
  id: number;
  shortlistId: number;
  kind: string;
  scheduledFor: string;
  outcome: string;
  note: string | null;
  candidateName: string;
  orderRef: string;
  orderTitle: string;
  clientName: string | null;
};

const INTERVIEW_EMBED =
  `${INTERVIEW_COLS},rec_shortlist(id,rec_candidates(name),rec_job_orders(ref,title,rec_clients(name)))`;

function interviewRow(r: Record<string, unknown>): Interview {
  const s = one(r.rec_shortlist);
  const c = one(s.rec_candidates);
  const o = one(s.rec_job_orders);
  const cl = one(o.rec_clients);
  return {
    id: r.id as number,
    shortlistId: r.shortlist_id as number,
    kind: (r.kind as string) ?? "Client interview",
    scheduledFor: r.scheduled_for as string,
    outcome: (r.outcome as string) ?? "Pending",
    note: (r.note as string) ?? null,
    candidateName: (c.name as string) ?? "",
    orderRef: (o.ref as string) ?? "",
    orderTitle: (o.title as string) ?? "",
    clientName: (cl.name as string) ?? null,
  };
}

export async function listInterviews(companyId: number): Promise<Interview[]> {
  const { data } = await sb
    .from("rec_interviews")
    .select(INTERVIEW_EMBED)
    .eq("company_id", companyId)
    .order("scheduled_for", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(interviewRow);
}

export async function listInterviewsFor(shortlistIds: number[]): Promise<Interview[]> {
  if (shortlistIds.length === 0) return [];
  const { data } = await sb
    .from("rec_interviews")
    .select(INTERVIEW_EMBED)
    .in("shortlist_id", shortlistIds)
    .order("scheduled_for", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(interviewRow);
}

export async function scheduleInterview(
  companyId: number, shortlistId: number, kind: string, scheduledFor: string, createdBy = "web-ui",
): Promise<WriteResult> {
  const when = isoDate(scheduledFor);
  if (!when) return { ok: false, error: "An interview needs a date and time." };
  const { data, error } = await sb
    .from("rec_interviews")
    .insert({ company_id: companyId, shortlist_id: shortlistId, kind, scheduled_for: when, created_by: createdBy })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  // Booking an interview IS the candidate moving to interviewing — recorded here
  // so the two can never disagree.
  await sb.from("rec_shortlist")
    .update({ stage: "Interviewing", updated_at: new Date().toISOString() })
    .eq("id", shortlistId)
    .in("stage", ["Sourced", "Screened", "Shortlisted"]);
  return { ok: true, id: (data as { id: number }).id };
}

export async function updateInterview(
  id: number, patch: { kind?: string; scheduledFor?: string | null; outcome?: string; note?: string | null },
): Promise<WriteResult> {
  const p: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.kind) p.kind = patch.kind;
  if (patch.scheduledFor !== undefined) {
    const when = isoDate(patch.scheduledFor);
    if (!when) return { ok: false, error: "An interview needs a date and time." };
    p.scheduled_for = when;
  }
  if (patch.outcome) p.outcome = patch.outcome;
  if (patch.note !== undefined) p.note = trimOrNull(patch.note);
  const { error } = await sb.from("rec_interviews").update(p).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, id };
}

/* ─────────────────────────────────────────────────────────── placements ──── */

export type CheckIn = {
  id: number;
  placementId: number;
  day: number;
  party: string;
  spokeOn: string;
  note: string;
};

export type Placement = {
  id: number;
  jobOrderId: number;
  candidateId: number;
  shortlistId: number | null;
  acceptedOn: string;
  startedOn: string | null;
  monthlyGrossUsd: string | null;
  endedOn: string | null;
  endedReason: string | null;
  fault: string | null;
  replacementOfId: number | null;
  notes: string | null;
  candidateName: string;
  orderRef: string;
  orderTitle: string;
  clientName: string | null;
  checkIns: CheckIn[];
};

const PLACEMENT_EMBED =
  `${PLACEMENT_COLS},rec_candidates(name),rec_job_orders(ref,title,rec_clients(name))`;

function placementRow(r: Record<string, unknown>, checkIns: CheckIn[]): Placement {
  const c = one(r.rec_candidates);
  const o = one(r.rec_job_orders);
  const cl = one(o.rec_clients);
  return {
    id: r.id as number,
    jobOrderId: r.job_order_id as number,
    candidateId: r.candidate_id as number,
    shortlistId: (r.shortlist_id as number) ?? null,
    acceptedOn: r.accepted_on as string,
    startedOn: (r.started_on as string) ?? null,
    monthlyGrossUsd: (r.monthly_gross_usd as string) ?? null,
    endedOn: (r.ended_on as string) ?? null,
    endedReason: (r.ended_reason as string) ?? null,
    fault: (r.fault as string) ?? null,
    replacementOfId: (r.replacement_of_id as number) ?? null,
    notes: (r.notes as string) ?? null,
    candidateName: (c.name as string) ?? "",
    orderRef: (o.ref as string) ?? "",
    orderTitle: (o.title as string) ?? "",
    clientName: (cl.name as string) ?? null,
    checkIns,
  };
}

function checkInRow(r: Record<string, unknown>): CheckIn {
  return {
    id: r.id as number,
    placementId: r.placement_id as number,
    day: r.day as number,
    party: r.party as string,
    spokeOn: r.spoke_on as string,
    note: (r.note as string) ?? "",
  };
}

/** Placements with their conversations already attached. */
export async function listPlacements(companyId: number): Promise<Placement[]> {
  const { data } = await sb
    .from("rec_placements")
    .select(PLACEMENT_EMBED)
    .eq("company_id", companyId)
    .order("accepted_on", { ascending: false });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id as number);
  const { data: cis } = await sb.from("rec_checkins").select(CHECKIN_COLS).in("placement_id", ids).order("day");
  const byPlacement = new Map<number, CheckIn[]>();
  for (const raw of (cis ?? []) as unknown as Record<string, unknown>[]) {
    const ci = checkInRow(raw);
    const list = byPlacement.get(ci.placementId) ?? [];
    list.push(ci);
    byPlacement.set(ci.placementId, list);
  }
  return rows.map((r) => placementRow(r, byPlacement.get(r.id as number) ?? []));
}

export async function placementsForOrder(jobOrderId: number): Promise<Placement[]> {
  const { data } = await sb.from("rec_placements").select(PLACEMENT_EMBED).eq("job_order_id", jobOrderId).order("accepted_on");
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as number);
  const { data: cis } = await sb.from("rec_checkins").select(CHECKIN_COLS).in("placement_id", ids).order("day");
  const byPlacement = new Map<number, CheckIn[]>();
  for (const raw of (cis ?? []) as unknown as Record<string, unknown>[]) {
    const ci = checkInRow(raw);
    const list = byPlacement.get(ci.placementId) ?? [];
    list.push(ci);
    byPlacement.set(ci.placementId, list);
  }
  return rows.map((r) => placementRow(r, byPlacement.get(r.id as number) ?? []));
}

/**
 * The candidate accepted the written offer.
 *
 * This is the moment the FEE IS EARNED, so it does three things at once and they
 * belong together — a screen that did them separately could leave the books
 * disagreeing with the pipeline:
 *
 *   1. a placement, with the gross FROZEN as it stood on the job order;
 *   2. this candidate's shortlist row set to Placed;
 *   3. every OTHER candidate still live on that order declined, with the
 *      contract's own wording — "Client chose another candidate";
 *   4. the job order moved to "Offer accepted".
 *
 * ⚠️ Phase 3 adds a fifth step here — raising the invoice and posting it to the
 * ledger through `postVoucher()`. It goes IN THIS FUNCTION, not beside it.
 */
export async function recordAcceptance(
  companyId: number, shortlistId: number, acceptedOn: string, createdBy = "web-ui",
): Promise<WriteResult> {
  const accepted = isoDate(acceptedOn);
  if (!accepted) return { ok: false, error: "When did they accept?" };

  const { data: entry } = await sb
    .from("rec_shortlist")
    .select("id,job_order_id,candidate_id,stage")
    .eq("id", shortlistId)
    .maybeSingle();
  if (!entry) return { ok: false, error: "That shortlist entry no longer exists." };
  const e = entry as { id: number; job_order_id: number; candidate_id: number };

  const { data: order } = await sb
    .from("rec_job_orders")
    .select("id,monthly_gross_usd,client_id")
    .eq("id", e.job_order_id)
    .maybeSingle();
  const o = order as { monthly_gross_usd: string | null; client_id: number | null } | null;

  const { data: created, error } = await sb
    .from("rec_placements")
    .insert({
      company_id: companyId,
      job_order_id: e.job_order_id,
      candidate_id: e.candidate_id,
      shortlist_id: e.id,
      accepted_on: accepted,
      // Frozen here. Editing the order afterwards must not move a fee that has
      // already been earned.
      monthly_gross_usd: o?.monthly_gross_usd ?? null,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const now = new Date().toISOString();
  await sb.from("rec_shortlist").update({ stage: "Placed", updated_at: now }).eq("id", e.id);
  await sb.from("rec_shortlist")
    .update({ stage: "Declined", decline_reason: "Client chose another candidate", updated_at: now })
    .eq("job_order_id", e.job_order_id)
    .neq("id", e.id)
    .not("stage", "in", '("Declined","Placed")');
  await sb.from("rec_job_orders").update({ stage: "Offer accepted", updated_at: now }).eq("id", e.job_order_id);

  return { ok: true, id: (created as { id: number }).id };
}

/**
 * They actually started.
 *
 * The guarantee and the six conversations run from THIS date, not from
 * acceptance — an accepted offer can sit in the client's permit process for
 * weeks, and starting the clock early would give away a month of cover.
 */
export async function recordStart(placementId: number, startedOn: string): Promise<WriteResult> {
  const started = isoDate(startedOn);
  if (!started) return { ok: false, error: "When did they start?" };
  const { data, error } = await sb
    .from("rec_placements")
    .update({ started_on: started, updated_at: new Date().toISOString() })
    .eq("id", placementId)
    .select("job_order_id")
    .single();
  if (error) return { ok: false, error: error.message };
  await sb.from("rec_job_orders")
    .update({ stage: "Placed", updated_at: new Date().toISOString() })
    .eq("id", (data as { job_order_id: number }).job_order_id);
  return { ok: true, id: placementId };
}

/**
 * It went wrong.
 *
 * Recording the fault is not bookkeeping — it decides the remedy. Terms cl. 6:
 * the candidate's or nobody's fault means a free replacement search; the
 * CLIENT'S fault means no replacement is due and a further search is a new Job
 * Order at the full fee. The fee is never refunded either way.
 *
 * The job order is left as it is. A placement that failed still happened, and
 * rewriting the order's stage would erase that.
 */
export async function recordEnd(
  placementId: number, endedOn: string, endedReason: string, fault: string,
): Promise<WriteResult> {
  const ended = isoDate(endedOn);
  if (!ended) return { ok: false, error: "When did it end?" };
  if (!endedReason.trim()) return { ok: false, error: "Say what happened — this is the record it is judged on." };
  const { error } = await sb
    .from("rec_placements")
    .update({ ended_on: ended, ended_reason: endedReason.trim(), fault, updated_at: new Date().toISOString() })
    .eq("id", placementId);
  return error ? { ok: false, error: error.message } : { ok: true, id: placementId };
}

/** Undo an ending recorded by mistake. */
export async function clearEnd(placementId: number): Promise<WriteResult> {
  const { error } = await sb
    .from("rec_placements")
    .update({ ended_on: null, ended_reason: null, fault: null, updated_at: new Date().toISOString() })
    .eq("id", placementId);
  return error ? { ok: false, error: error.message } : { ok: true, id: placementId };
}

/**
 * Write down a conversation.
 *
 * ⚠️ The note is REQUIRED. A check-in with nothing written in it is worthless as
 * evidence, and evidence is the whole reason the first month is logged at all.
 * Recording the same day and side twice replaces the earlier note rather than
 * making a second row.
 */
export async function recordCheckIn(
  companyId: number, placementId: number, day: number, party: string, spokeOn: string, note: string, createdBy = "web-ui",
): Promise<WriteResult> {
  const when = isoDate(spokeOn);
  if (!when) return { ok: false, error: "When did you speak to them?" };
  if (!note.trim()) return { ok: false, error: "Write down what they said — that is the point of the check-in." };
  const { error } = await sb
    .from("rec_checkins")
    .upsert({
      company_id: companyId,
      placement_id: placementId,
      day,
      party,
      spoke_on: when,
      note: note.trim(),
      created_by: createdBy,
    }, { onConflict: "placement_id,day,party" });
  return error ? { ok: false, error: error.message } : { ok: true, id: placementId };
}

/* ═════════════════════════════════════════════════ DELETING, FOR REAL ══════ */

/**
 * Deleting is the exception here, not the rule.
 *
 * COS archives rather than deletes, and for a placement that has been invoiced
 * that is the only defensible answer. But the owner runs this desk himself and
 * has to be able to clear a mistake without asking anybody, so every record type
 * can be permanently removed — with the database itself standing in the way when
 * removal would take real history with it:
 *
 *   · a client with a job order          → refused (job_orders.client_id RESTRICT)
 *   · a candidate on a shortlist         → refused (shortlist/placement RESTRICT)
 *   · a job order with a placement       → refused (placements RESTRICT)
 *   · a job order with only a shortlist  → allowed, and the shortlist goes with
 *                                          it (CASCADE) — nobody was placed
 *   · a placement                        → allowed, its check-ins go with it
 *
 * So the rule is: **you can delete what nothing depends on.** The refusals are
 * translated into English by `deleteBlocked` rather than shown as constraint
 * names.
 */
function deleteBlocked(message: string, what: string, because: string, them = "it"): string {
  if (/violates foreign key constraint|still referenced/i.test(message)) {
    return `This ${what} cannot be deleted because ${because}. Archive ${them} instead — that takes ${them} out of the way and keeps the history.`;
  }
  return `Couldn't delete the ${what}. Please try again.`;
}

export async function deleteClient(id: number): Promise<WriteResult> {
  const { error } = await sb.from("rec_clients").delete().eq("id", id);
  if (error) return { ok: false, error: deleteBlocked(error.message, "client", "there are job orders against it") };
  return { ok: true, id };
}

export async function deleteCandidate(id: number): Promise<WriteResult> {
  const { error } = await sb.from("rec_candidates").delete().eq("id", id);
  if (error) return { ok: false, error: deleteBlocked(error.message, "candidate", "they are on a shortlist or have been placed", "them") };
  return { ok: true, id };
}

export async function deleteJobOrder(id: number): Promise<WriteResult> {
  const { error } = await sb.from("rec_job_orders").delete().eq("id", id);
  if (error) return { ok: false, error: deleteBlocked(error.message, "job order", "somebody was placed on it") };
  return { ok: true, id };
}

export async function deleteInterview(id: number): Promise<WriteResult> {
  const { error } = await sb.from("rec_interviews").delete().eq("id", id);
  return error ? { ok: false, error: "Couldn't remove the interview. Please try again." } : { ok: true, id };
}

/** Deleting a placement takes its check-ins with it — they describe a first
 *  month that, on this telling, never happened. */
export async function deletePlacement(id: number): Promise<WriteResult> {
  const { error } = await sb.from("rec_placements").delete().eq("id", id);
  return error ? { ok: false, error: "Couldn't remove the placement. Please try again." } : { ok: true, id };
}

/** Rub out a conversation recorded against the wrong day or the wrong side. */
export async function deleteCheckIn(id: number): Promise<WriteResult> {
  const { error } = await sb.from("rec_checkins").delete().eq("id", id);
  return error ? { ok: false, error: "Couldn't remove the check-in. Please try again." } : { ok: true, id };
}

/** Correct a placement typed wrongly — the accepted date, the frozen gross, the
 *  note. The gross is editable ON PURPOSE: it is frozen against edits to the
 *  job order, not against the owner noticing he typed 1,500 for 1,550. */
export async function updatePlacement(
  id: number,
  patch: { acceptedOn?: string | null; startedOn?: string | null; monthlyGrossUsd?: string | number | null; notes?: string | null },
): Promise<WriteResult> {
  const p: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.acceptedOn !== undefined) {
    const v = isoDate(patch.acceptedOn);
    if (!v) return { ok: false, error: "A placement needs the date the offer was accepted." };
    p.accepted_on = v;
  }
  if (patch.startedOn !== undefined) p.started_on = isoDate(patch.startedOn);
  if (patch.monthlyGrossUsd !== undefined) p.monthly_gross_usd = numOrNull(patch.monthlyGrossUsd);
  if (patch.notes !== undefined) p.notes = trimOrNull(patch.notes);
  const { error } = await sb.from("rec_placements").update(p).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, id };
}
