"use server";

import { AI_FAST } from "@/lib/ai-models";
import { callAIJson } from "@/lib/ai-json";
import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import { normalizePersonType, personTypeLabel } from "@/lib/person-types";
import { logPersonEvent, logPersonFieldChanges, type FieldChange } from "@/lib/person-audit";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { startJourney, startJourneyTx, AUTO_ONBOARD_TYPES } from "@/lib/onboarding";
import { returnAssetsForPersonTx, clearCustodianForPersonTx } from "@/lib/assets";
import { getAiKey } from "@/lib/settings";
import { reindexEntity } from "@/lib/index-hooks";
import { staffIdFor } from "@/lib/staff-id";
import { resolveSiteId } from "@/lib/sites";
import { hashPassword } from "@/lib/portal-auth";
import { recordEvent } from "@/lib/system-events";
import { withTx, type Tx } from "@/lib/tx";
import { people, departmentHeads, reportingLines } from "@/db/schema";
import { eq } from "drizzle-orm";

type ActionResult = { ok: true; id?: number; active?: boolean } | { ok: false; error: string };

/* ----------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */
function s(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (v == null) return null;
  const t = String(v).trim();
  return t.length === 0 ? null : t;
}

function n(formData: FormData, key: string): number | null {
  const v = s(formData, key);
  if (!v) return null;
  const parsed = parseInt(v, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function contactStatus(email: string | null, phone: string | null, whatsapp: string | null): string {
  if (email && (phone || whatsapp)) return "Complete";
  if (email || phone || whatsapp) return "Partial";
  return "Pending";
}

function personType(formData: FormData): string {
  return normalizePersonType(s(formData, "personType"));
}

/** Parse a date-only field (YYYY-MM-DD) to a UTC-midnight ISO string, or null. */
function dateField(formData: FormData, key: string): string | null {
  const v = s(formData, key);
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Resolve a department by name, creating it ONLY if it genuinely doesn't exist.
 * Matches case-insensitively (.ilike) so typing "finance" when "Finance" exists
 * re-uses the existing row instead of spawning a duplicate department — the same
 * guard the Companies-hub admin uses. Used by the person form, bulk set-field and
 * intake enrichment so all three stay consistent.
 */
async function resolveDepartmentByName(name: string | null): Promise<number | null> {
  const clean = name?.trim();
  if (!clean) return null;
  const { data: existing } = await sb.from("departments").select("id").ilike("name", clean).maybeSingle();
  if (existing) return existing.id as number;
  const { data: created } = await sb.from("departments").insert({ name: clean }).select("id").single();
  return (created?.id as number | undefined) ?? null;
}

/** Resolve the form's "department" field to an id (creating it if new). */
async function resolveDepartmentId(formData: FormData): Promise<number | null> {
  return resolveDepartmentByName(s(formData, "department"));
}

/** Parse the associations field (JSON array of {companyId, relationship}) submitted by the form. */
function parseAssociations(formData: FormData): Array<{ companyId: number; relationship: string | null }> {
  const raw = s(formData, "associations");
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((a) => ({
        companyId: typeof a?.companyId === "number" ? a.companyId : parseInt(String(a?.companyId), 10),
        relationship: a?.relationship ? String(a.relationship).trim() || null : null,
      }))
      .filter((a) => Number.isInteger(a.companyId));
  } catch {
    return [];
  }
}

/** Replace a person's company associations with the supplied set. */
async function syncAssociations(personId: number, assoc: Array<{ companyId: number; relationship: string | null }>) {
  await sb.from("person_companies").delete().eq("person_id", personId);
  if (assoc.length === 0) return;
  // De-dupe on companyId (composite PK is person_id+company_id).
  const seen = new Set<number>();
  const rows = assoc
    .filter((a) => (seen.has(a.companyId) ? false : (seen.add(a.companyId), true)))
    .map((a) => ({ person_id: personId, company_id: a.companyId, relationship: a.relationship }));
  await sb.from("person_companies").insert(rows);
}

/** Parse the "also reports to" field (JSON array of manager ids) from the form. */
function parseSecondaryManagers(formData: FormData): number[] {
  const raw = s(formData, "secondaryManagers");
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((v) => (typeof v === "number" ? v : parseInt(String(v), 10)))
      .filter((v) => Number.isInteger(v));
  } catch {
    return [];
  }
}

/**
 * Walk up a starting person's PRIMARY-manager chain (people.manager_id) and report
 * whether it reaches `target`. Used to reject a secondary ("also reports to") link
 * that would close a reporting loop (A reports to B while B already reports to A).
 * Bounded so a pre-existing data loop can't spin forever.
 */
async function primaryChainReaches(startId: number, target: number): Promise<boolean> {
  let current: number | null = startId;
  const visited = new Set<number>();
  for (let i = 0; i < 50 && current != null; i++) {
    if (current === target) return true;
    if (visited.has(current)) break; // guard against an existing data loop
    visited.add(current);
    const { data }: { data: { manager_id: number | null } | null } = await sb
      .from("people")
      .select("manager_id")
      .eq("id", current)
      .maybeSingle();
    current = data?.manager_id ?? null;
  }
  return false;
}

/**
 * Replace a person's secondary (dotted-line) reporting links. The PRIMARY manager
 * lives on people.manager_id and is excluded here to avoid a duplicate solid+dotted
 * line; a person can't report to themselves either.
 *
 * Rejects a manager that would create a reporting CYCLE — i.e. a manager who
 * already reports (via their primary chain) to this person. Without this guard the
 * cycle saves and the org chart silently drops the edge, reading as a lost change.
 */
async function syncReportingLines(
  personId: number,
  managerIds: number[],
  primaryManagerId: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const seen = new Set<number>();
  const wanted = managerIds.filter(
    (mid) => mid !== personId && mid !== primaryManagerId && !seen.has(mid) && (seen.add(mid), true)
  );
  for (const mid of wanted) {
    if (await primaryChainReaches(mid, personId)) {
      const { data: mgr } = await sb.from("people").select("name").eq("id", mid).maybeSingle();
      const who = (mgr?.name as string | null) ?? "That manager";
      return {
        ok: false,
        error: `${who} already reports to this person, so adding them as a manager would create a loop. Remove one of the links first.`,
      };
    }
  }
  await sb.from("reporting_lines").delete().eq("person_id", personId);
  const rows = wanted.map((mid) => ({ person_id: personId, manager_id: mid }));
  if (rows.length) await sb.from("reporting_lines").insert(rows);
  return { ok: true };
}

function invalidate() {
  revalidatePath("/people");
  revalidatePath("/outbox");
  // Reporting lines (Director / "also reports to") feed the organogram and the
  // per-company Org tab, so a person edit must refresh those too — otherwise the
  // chart shows stale hierarchy until a hard reload.

  revalidatePath("/companies", "layout");
  updateTag("people");
}

/* ----------------------------------------------------------------------
 * Audit-trail field diffing for updatePerson.
 * ---------------------------------------------------------------------- */
type TrackKind = "text" | "date" | "company" | "person" | "department" | "type" | "site";
const TRACKED_FIELDS: Array<{ col: string; label: string; kind: TrackKind }> = [
  { col: "name", label: "Name", kind: "text" },
  { col: "email", label: "Email", kind: "text" },
  { col: "phone", label: "Phone", kind: "text" },
  { col: "whatsapp", label: "WhatsApp", kind: "text" },
  { col: "role", label: "Role", kind: "text" },
  { col: "staff_category", label: "Staff category", kind: "text" },
  { col: "company_id", label: "Company", kind: "company" },
  { col: "department_id", label: "Department", kind: "department" },
  { col: "start_date", label: "Start date", kind: "date" },
  { col: "date_of_birth", label: "Date of birth", kind: "date" },
  { col: "nationality", label: "Nationality", kind: "text" },
  { col: "national_id", label: "National ID", kind: "text" },
  { col: "passport_no", label: "Passport no.", kind: "text" },
  { col: "address", label: "Address", kind: "text" },
  { col: "emergency_contact_name", label: "Emergency contact", kind: "text" },
  { col: "emergency_contact_phone", label: "Emergency phone", kind: "text" },
  { col: "probation_end_date", label: "Probation end", kind: "date" },
  { col: "manager_id", label: "Manager", kind: "person" },
  { col: "notes", label: "Notes", kind: "text" },
  { col: "person_type", label: "Person type", kind: "type" },
  { col: "related_person_id", label: "Related person", kind: "person" },
  { col: "work_site_id", label: "Work site", kind: "site" },
  { col: "residence_site_id", label: "Residence", kind: "site" },
];

/** Compare before/after column values and return human-readable field changes. */
async function diffPersonChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Promise<FieldChange[]> {
  const companyIds = new Set<number>();
  const personIds = new Set<number>();
  const deptIds = new Set<number>();
  const siteIds = new Set<number>();
  for (const f of TRACKED_FIELDS) {
    const add = (set: Set<number>) => [before[f.col], after[f.col]].forEach((v) => typeof v === "number" && set.add(v));
    if (f.kind === "company") add(companyIds);
    else if (f.kind === "person") add(personIds);
    else if (f.kind === "department") add(deptIds);
    else if (f.kind === "site") add(siteIds);
  }
  const [c, p, d, s] = await Promise.all([
    companyIds.size ? sb.from("companies").select("id,name").in("id", [...companyIds]) : Promise.resolve({ data: [] }),
    personIds.size ? sb.from("people").select("id,name").in("id", [...personIds]) : Promise.resolve({ data: [] }),
    deptIds.size ? sb.from("departments").select("id,name").in("id", [...deptIds]) : Promise.resolve({ data: [] }),
    siteIds.size ? sb.from("sites").select("id,name").in("id", [...siteIds]) : Promise.resolve({ data: [] }),
  ]);
  const cMap = new Map((c.data ?? []).map((r) => [r.id as number, r.name as string]));
  const pMap = new Map((p.data ?? []).map((r) => [r.id as number, r.name as string]));
  const dMap = new Map((d.data ?? []).map((r) => [r.id as number, r.name as string]));
  const sMap = new Map((s.data ?? []).map((r) => [r.id as number, r.name as string]));

  const fmt = (kind: TrackKind, v: unknown): string | null => {
    if (v == null || v === "") return null;
    if (kind === "date") return String(v).slice(0, 10);
    if (kind === "company") return cMap.get(v as number) ?? `#${v}`;
    if (kind === "person") return pMap.get(v as number) ?? `#${v}`;
    if (kind === "department") return dMap.get(v as number) ?? `#${v}`;
    if (kind === "site") return sMap.get(v as number) ?? `#${v}`;
    if (kind === "type") return personTypeLabel(normalizePersonType(String(v)));
    const s = String(v);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  };

  const changes: FieldChange[] = [];
  for (const f of TRACKED_FIELDS) {
    const ov = fmt(f.kind, before[f.col]);
    const nv = fmt(f.kind, after[f.col]);
    if (ov !== nv) changes.push({ field: f.label, oldValue: ov, newValue: nv });
  }
  return changes;
}

/* ----------------------------------------------------------------------
 * Create
 * ---------------------------------------------------------------------- */
/* ----------------------------------------------------------------------
 * AI: extract person-profile fields from pasted text (for "scan to fill").
 * ---------------------------------------------------------------------- */
export type PersonProfileFields = {
  name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  role?: string;
  dateOfBirth?: string;
  nationality?: string;
  nationalId?: string;
  passportNo?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  // HR / company-relationship fields (V3 unified intake).
  startDate?: string; // YYYY-MM-DD — join / start date
  probationEndDate?: string; // YYYY-MM-DD
  department?: string;
  supervisorName?: string; // resolved to manager_id by name when enriching
  companyName?: string; // resolved to company_id by name when enriching
};

function str120(v: unknown, max = 120): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/** Rule-based fallback when AI is off — pulls the obvious patterns. Also acts
 *  as a base layer the AI result merges onto, so a field the model omits but
 *  that is clearly labelled ("Emergency contact: …") still gets filled. */
function rulePersonFields(text: string): PersonProfileFields {
  const f: PersonProfileFields = {};
  // Grab the value after a "Label: value" pair (stops at line end or next field).
  const labelled = (labels: string) => {
    const re = new RegExp(`(?:${labels})\\s*[:\\-]\\s*([^\\n\\r]{1,80})`, "i");
    const m = text.match(re);
    return m ? m[1].trim().replace(/[.,;]+$/, "") : undefined;
  };
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (email) f.email = email[0];
  const phone = text.match(/(?:\+?\d[\d\s-]{7,}\d)/);
  if (phone) f.phone = phone[0].replace(/\s+/g, "");
  const whatsapp = text.match(/(?:whats?app|w\/?app)\s*[:\-]?\s*(\+?\d[\d\s-]{7,}\d)/i);
  if (whatsapp) f.whatsapp = whatsapp[1].replace(/\s+/g, "");
  const passport = text.match(/passport\s*(?:no\.?|number)?[:\s]*([A-Z0-9]{6,10})/i);
  if (passport) f.passportNo = passport[1];
  const nida = text.match(/(?:nida|national\s*id)[:\s]*([\d-]{8,25})/i);
  if (nida) f.nationalId = nida[1];
  const dob = text.match(/(?:d\.?o\.?b\.?|date of birth|born)[:\s]*(\d{4}-\d{2}-\d{2})/i);
  if (dob) f.dateOfBirth = dob[1];
  const start = text.match(/(?:start(?:ing)?\s*date|join(?:ing|ed)?\s*date|date of joining|commence\w*)[:\s]*(\d{4}-\d{2}-\d{2})/i);
  if (start) f.startDate = start[1];
  const prob = text.match(/probation[^:\n]*(?:end|until|ends?)?[:\s]*(\d{4}-\d{2}-\d{2})/i);
  if (prob) f.probationEndDate = prob[1];
  const dept = labelled("department|dept");
  if (dept) f.department = dept;
  // Newly covered labelled fields (the gaps the owner hit on edit).
  const name = labelled("name|full name");
  if (name) f.name = name;
  const role = labelled("role|job title|job|designation|position|title");
  if (role) f.role = role;
  const nationality = labelled("nationality|citizen(?:ship)?");
  if (nationality) f.nationality = nationality;
  const address = labelled("address|residence|residential address");
  if (address) f.address = address;
  // Emergency contact — accept "Name - +255…" or split labels.
  const emName = labelled("emergency contact(?:\\s*name)?|next of kin|emergency");
  if (emName) {
    const split = emName.match(/^(.*?)[\s,–-]+(\+?\d[\d\s-]{6,}\d)\s*$/);
    if (split) { f.emergencyContactName = split[1].trim(); f.emergencyContactPhone = split[2].replace(/\s+/g, ""); }
    else f.emergencyContactName = emName;
  }
  const emPhone = labelled("emergency (?:phone|number|contact number|tel)");
  if (emPhone) {
    const num = emPhone.match(/\+?\d[\d\s-]{6,}\d/);
    if (num) f.emergencyContactPhone = num[0].replace(/\s+/g, "");
  }
  const supervisor = labelled("manager|supervisor|reports? to|reporting (?:to|line)");
  if (supervisor) f.supervisorName = supervisor;
  return f;
}

export async function extractPersonFields(
  text: string
): Promise<{ ok: boolean; fields: PersonProfileFields; source: "ai" | "rules" }> {
  const trimmed = (text ?? "").toString().trim();
  if (!trimmed) return { ok: false, fields: {}, source: "rules" };
  const apiKey = await getAiKey();
  if (!apiKey) return { ok: true, fields: rulePersonFields(trimmed), source: "rules" };

  const prompt = `You are reading a message that describes a PERSON (a staff member or contact), possibly forwarded from WhatsApp or email, in English or Swahili. Extract their details and return ONLY a JSON object with these optional keys (omit any you genuinely cannot find):
- name: full name
- email
- phone
- whatsapp
- role: their job title / designation
- dateOfBirth: YYYY-MM-DD
- nationality
- nationalId: national ID / NIDA number
- passportNo: passport number
- address: residential / physical address
- emergencyContactName
- emergencyContactPhone
- startDate: their employment start / joining date, YYYY-MM-DD
- probationEndDate: when their probation ends, YYYY-MM-DD
- department: the department or team they work in
- supervisorName: the name of their manager / supervisor / reporting line
- companyName: the company / employer they belong to
Resolve worded dates to YYYY-MM-DD. British English. Do not invent values you cannot see.

MESSAGE:
${trimmed.slice(0, 6000)}`;

  try {
    // Shared harness: retry on a brief 429/5xx, timeout, strip-and-parse.
    const result = await callAIJson({
      messages: [
        { role: "system", content: "You extract structured data and reply with strict JSON only." },
        { role: "user", content: prompt },
      ],
      apiKey,
      model: AI_FAST,
      maxTokens: 400,
      temperature: 0,
    });
    if (!result.ok || !result.data) return { ok: true, fields: rulePersonFields(trimmed), source: "rules" };
    const parsed = result.data;
    const f: PersonProfileFields = {
      name: str120(parsed.name),
      email: str120(parsed.email),
      phone: str120(parsed.phone, 40),
      whatsapp: str120(parsed.whatsapp, 40),
      role: str120(parsed.role),
      nationality: str120(parsed.nationality, 60),
      nationalId: str120(parsed.nationalId, 40),
      passportNo: str120(parsed.passportNo, 40),
      address: str120(parsed.address, 300),
      emergencyContactName: str120(parsed.emergencyContactName),
      emergencyContactPhone: str120(parsed.emergencyContactPhone, 40),
      department: str120(parsed.department, 60),
      supervisorName: str120(parsed.supervisorName),
      companyName: str120(parsed.companyName),
    };
    const dob = str120(parsed.dateOfBirth, 10);
    if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) f.dateOfBirth = dob;
    const sd = str120(parsed.startDate, 10);
    if (sd && /^\d{4}-\d{2}-\d{2}$/.test(sd)) f.startDate = sd;
    const ped = str120(parsed.probationEndDate, 10);
    if (ped && /^\d{4}-\d{2}-\d{2}$/.test(ped)) f.probationEndDate = ped;
    // Fill any obvious gaps from the rule extractor.
    const ruled = rulePersonFields(trimmed);
    const merged = { ...ruled, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) };
    return { ok: true, fields: merged, source: "ai" };
  } catch {
    return { ok: true, fields: rulePersonFields(trimmed), source: "rules" };
  }
}

export async function createPerson(formData: FormData): Promise<ActionResult> {
  const name = s(formData, "name");
  if (!name) return { ok: false, error: "Name is required." };

  // Duplicate-name guard (the column is unique in schema, but a friendly message wins)
  const { data: existing } = await sb.from("people").select("id").eq("name", name).maybeSingle();
  if (existing) return { ok: false, error: `A person named "${name}" already exists.` };

  const email = s(formData, "email");
  const phone = s(formData, "phone");
  const whatsapp = s(formData, "whatsapp");
  const departmentId = await resolveDepartmentId(formData);

  const { data, error } = await sb
    .from("people")
    .insert({
      name,
      email,
      phone,
      whatsapp,
      preferred_channel: s(formData, "preferredChannel"),
      role: s(formData, "role"),
      staff_category: s(formData, "staffCategory"),
      company_id: n(formData, "companyId"),
      department_id: departmentId,
      start_date: dateField(formData, "startDate"),
      date_of_birth: dateField(formData, "dateOfBirth"),
      nationality: s(formData, "nationality"),
      national_id: s(formData, "nationalId"),
      passport_no: s(formData, "passportNo"),
      address: s(formData, "address"),
      emergency_contact_name: s(formData, "emergencyContactName"),
      emergency_contact_phone: s(formData, "emergencyContactPhone"),
      probation_end_date: dateField(formData, "probationEndDate"),
      manager_id: n(formData, "managerId"),
      notes: s(formData, "notes"),
      active: true,
      contact_status: contactStatus(email, phone, whatsapp),
      person_type: personType(formData),
      related_person_id: n(formData, "relatedPersonId"),
      work_site_id: await resolveSiteId(s(formData, "workSite")),
      residence_site_id: await resolveSiteId(s(formData, "residence")),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  // Best-effort semantic index (no-op unless semantic search is enabled).
  void reindexEntity("person", data.id as number);

  await syncAssociations(data.id as number, parseAssociations(formData));
  await syncReportingLines(data.id as number, parseSecondaryManagers(formData), n(formData, "managerId"));
  const newType = normalizePersonType(personType(formData));
  await logPersonEvent(data.id as number, "created", { newValue: name, detail: personTypeLabel(newType) });
  // Auto-start an onboarding checklist for actual hires (local staff / expat).
  if (AUTO_ONBOARD_TYPES.includes(newType)) {
    try { await startJourney(data.id as number, "onboarding"); } catch {}
  }

  invalidate();
  return { ok: true, id: data.id as number };
}

/* ----------------------------------------------------------------------
 * Update
 * ---------------------------------------------------------------------- */
export async function updatePerson(id: number, formData: FormData): Promise<ActionResult> {
  const name = s(formData, "name");
  if (!name) return { ok: false, error: "Name is required." };

  // Guard against renaming onto an existing person
  const { data: dup } = await sb.from("people").select("id").eq("name", name).neq("id", id).maybeSingle();
  if (dup) return { ok: false, error: `A person named "${name}" already exists.` };

  const managerId = n(formData, "managerId");
  // Person cannot be their own manager
  const safeManagerId = managerId === id ? null : managerId;

  // Reject a primary manager that would close a reporting LOOP — i.e. a manager
  // whose own primary chain already reports (directly or indirectly) back to this
  // person (ACTPEOPLE-01). Unlike the org chart, a chain-walker keyed off
  // manager_id (approval routing, payroll sign-off) would spin on a cycle.
  if (safeManagerId != null && (await primaryChainReaches(safeManagerId, id))) {
    const { data: mgr } = await sb.from("people").select("name").eq("id", safeManagerId).maybeSingle();
    const who = (mgr?.name as string | null) ?? "That manager";
    return {
      ok: false,
      error: `${who} already reports to this person, so making them the manager would create a reporting loop. Change one of the reporting lines first.`,
    };
  }

  // A person cannot be related to themselves.
  const relatedPersonId = n(formData, "relatedPersonId");
  const safeRelatedId = relatedPersonId === id ? null : relatedPersonId;

  const email = s(formData, "email");
  const phone = s(formData, "phone");
  const whatsapp = s(formData, "whatsapp");
  const departmentId = await resolveDepartmentId(formData);

  // If the person is moving to a different company, remember their current
  // staff ID so old references (e.g. CZ-E04) stay traceable.
  const newCompanyId = n(formData, "companyId");
  let previousStaffIds: string | undefined;
  const { data: before } = await sb
    .from("people")
    .select(
      "company_id,previous_staff_ids,name,email,phone,whatsapp,role,staff_category,department_id,start_date,date_of_birth,nationality,national_id,passport_no,address,emergency_contact_name,emergency_contact_phone,probation_end_date,manager_id,notes,person_type,related_person_id,work_site_id,residence_site_id"
    )
    .eq("id", id)
    .maybeSingle();
  if (before && before.company_id != null && newCompanyId !== before.company_id) {
    const oldId = await staffIdFor(id);
    if (oldId) {
      const existing = (before.previous_staff_ids as string | null) ?? "";
      previousStaffIds = existing ? `${existing},${oldId}` : oldId;
    }
  }

  const payload = {
    ...(previousStaffIds !== undefined ? { previous_staff_ids: previousStaffIds } : {}),
    name,
    email,
    phone,
    whatsapp,
    preferred_channel: s(formData, "preferredChannel"),
    role: s(formData, "role"),
    staff_category: s(formData, "staffCategory"),
    company_id: n(formData, "companyId"),
    department_id: departmentId,
    start_date: dateField(formData, "startDate"),
    date_of_birth: dateField(formData, "dateOfBirth"),
    nationality: s(formData, "nationality"),
    national_id: s(formData, "nationalId"),
    passport_no: s(formData, "passportNo"),
    address: s(formData, "address"),
    emergency_contact_name: s(formData, "emergencyContactName"),
    emergency_contact_phone: s(formData, "emergencyContactPhone"),
    probation_end_date: dateField(formData, "probationEndDate"),
    manager_id: safeManagerId,
    notes: s(formData, "notes"),
    contact_status: contactStatus(email, phone, whatsapp),
    person_type: personType(formData),
    related_person_id: safeRelatedId,
    work_site_id: await resolveSiteId(s(formData, "workSite")),
    residence_site_id: await resolveSiteId(s(formData, "residence")),
  };

  const { error } = await sb.from("people").update(payload).eq("id", id);

  if (error) return { ok: false, error: error.message };

  // Audit: record each changed profile field (best-effort).
  if (before) {
    try {
      const changes = await diffPersonChanges(before as Record<string, unknown>, payload as Record<string, unknown>);
      await logPersonFieldChanges(id, changes);
    } catch {}
  }

  await syncAssociations(id, parseAssociations(formData));
  const lineRes = await syncReportingLines(id, parseSecondaryManagers(formData), safeManagerId);
  if (!lineRes.ok) return { ok: false, error: lineRes.error };

  const newType = normalizePersonType(personType(formData));

  // Recruit → hire: a Candidate (or other non-onboarding type) changing INTO a
  // staff type starts their onboarding journey, the same as a fresh hire. Without
  // this the standard add-as-candidate-then-promote path never gets a journey.
  const priorType = before ? normalizePersonType(before.person_type as string | null) : null;
  if (
    priorType != null &&
    !AUTO_ONBOARD_TYPES.includes(priorType) &&
    AUTO_ONBOARD_TYPES.includes(newType)
  ) {
    try { await startJourney(id, "onboarding"); } catch {}
  }

  // Best-effort re-index: name/role/staff category/notes may have changed.
  void reindexEntity("person", id);

  invalidate();
  return { ok: true, id };
}

/* ----------------------------------------------------------------------
 * Enrich an existing person's profile from extracted fields — fills BLANKS
 * ONLY (never overwrites a value already on record). Used by the unified
 * intake flow (document upload / inbox) to top up a person's HR profile.
 * Returns the list of human field labels that were actually filled.
 * ---------------------------------------------------------------------- */
export async function enrichPersonProfile(
  personId: number,
  fields: PersonProfileFields
): Promise<{ ok: boolean; filled: string[]; error?: string }> {
  if (!Number.isFinite(personId)) return { ok: false, filled: [], error: "Invalid person." };
  const { data: current, error: readErr } = await sb
    .from("people")
    .select(
      "email,phone,whatsapp,role,date_of_birth,nationality,national_id,passport_no,address,emergency_contact_name,emergency_contact_phone,start_date,probation_end_date,department_id,manager_id,company_id"
    )
    .eq("id", personId)
    .maybeSingle();
  if (readErr) return { ok: false, filled: [], error: readErr.message };
  if (!current) return { ok: false, filled: [], error: "Person not found." };

  const update: Record<string, unknown> = {};
  const filled: string[] = [];
  const isEmpty = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");

  // Simple value columns: only set when the value is present and the column is blank.
  const map: Array<[col: string, val: string | undefined, label: string, date?: boolean]> = [
    ["email", fields.email, "Email"],
    ["phone", fields.phone, "Phone"],
    ["whatsapp", fields.whatsapp, "WhatsApp"],
    ["role", fields.role, "Role"],
    ["date_of_birth", fields.dateOfBirth, "Date of birth", true],
    ["nationality", fields.nationality, "Nationality"],
    ["national_id", fields.nationalId, "National ID"],
    ["passport_no", fields.passportNo, "Passport no."],
    ["address", fields.address, "Address"],
    ["emergency_contact_name", fields.emergencyContactName, "Emergency contact"],
    ["emergency_contact_phone", fields.emergencyContactPhone, "Emergency phone"],
    ["start_date", fields.startDate, "Start date", true],
    ["probation_end_date", fields.probationEndDate, "Probation end", true],
  ];
  for (const [col, val, label, date] of map) {
    if (!val || !isEmpty((current as Record<string, unknown>)[col])) continue;
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) continue;
      const d = new Date(`${val}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) continue;
      update[col] = d.toISOString();
    } else {
      update[col] = val;
    }
    filled.push(label);
  }

  // Department — resolve by name (case-insensitive, create if new), only when
  // currently unset. Shared helper avoids spawning a duplicate "finance"/"Finance".
  if (fields.department && isEmpty(current.department_id)) {
    const deptId = await resolveDepartmentByName(fields.department);
    if (deptId) { update.department_id = deptId; filled.push("Department"); }
  }

  // Supervisor / manager — match an existing person by name (never create).
  if (fields.supervisorName && isEmpty(current.manager_id)) {
    const { data: mgr } = await sb
      .from("people")
      .select("id")
      .ilike("name", fields.supervisorName.trim())
      .neq("id", personId)
      .maybeSingle();
    if (mgr?.id) { update.manager_id = mgr.id as number; filled.push("Manager"); }
  }

  // Company — match an existing company by name (never create).
  if (fields.companyName && isEmpty(current.company_id)) {
    const { data: co } = await sb.from("companies").select("id").ilike("name", fields.companyName.trim()).maybeSingle();
    if (co?.id) { update.company_id = co.id as number; filled.push("Company"); }
  }

  if (filled.length === 0) return { ok: true, filled: [] };

  const { error } = await sb.from("people").update(update).eq("id", personId);
  if (error) return { ok: false, filled: [], error: error.message };

  await logPersonEvent(personId, "enriched", { detail: filled.join(", "), createdBy: "intake" });

  // Best-effort re-index in case a blank-filling enrich set role (indexed field).
  void reindexEntity("person", personId);

  // Profile enrichment fills blank columns only; it never changes person_type,
  // so the document checklist does not need reconciling here.
  invalidate();
  return { ok: true, filled };
}

/* ----------------------------------------------------------------------
 * Archive / restore (toggle active)
 * ---------------------------------------------------------------------- */
export async function togglePersonActive(id: number): Promise<ActionResult> {
  const { data: current } = await sb.from("people").select("active").eq("id", id).maybeSingle();
  if (!current) return { ok: false, error: "Person not found." };

  const nextActive = !current.active;

  // Archive/restore + the whole offboarding side-effect set must be all-or-
  // nothing: flip the active flag, and on archive vacate the leaver's leadership
  // roles AND orphan their direct reports (ACTPEOPLE-03), start the offboarding
  // journey, return their assets and vacate their custodianships — all in one
  // transaction, so a mid-sequence failure can never half-offboard someone
  // (active flag flipped but assets still in their name, or vice-versa).
  let orphanedReports: number[] = [];
  try {
    orphanedReports = await withTx(async (tx) => {
      await tx.update(people).set({ active: nextActive }).where(eq(people.id, id));
      if (!nextActive) {
        const reports = await vacateLeadershipRolesTx(tx, id);
        await startJourneyTx(tx, id, "offboarding");
        await returnAssetsForPersonTx(tx, id);
        await clearCustodianForPersonTx(tx, id);
        return reports;
      }
      return [];
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update this person." };
  }

  await logPersonEvent(id, nextActive ? "restored" : "archived");
  // Cross-process cascade: offboarding just returned all the person's assets, so
  // tick the "Return equipment" offboarding step (logged + undoable). Guarded.
  if (!nextActive) {
    try { const m = await import("@/lib/automation-reactions"); await m.reactToOffboardingAssetsReturned(id); } catch { /* best-effort */ }
  }
  if (orphanedReports.length > 0) {
    await logPersonEvent(id, "updated", {
      field: "Direct reports",
      oldValue: `${orphanedReports.length} report${orphanedReports.length === 1 ? "" : "s"}`,
      newValue: "Manager cleared (archived)",
    });
  }

  // Re-index to re-stamp lifecycle (active ↔ history). We keep archived people
  // searchable, so this is reindexEntity, not removeEntityIndex.
  void reindexEntity("person", id);

  invalidate();
  return { ok: true, active: nextActive };
}

/**
 * On archive, vacate the leaver's leadership roles and orphan their primary
 * reports, inside the caller's transaction (so it commits with the active flag):
 *   - clear any department-head seat they hold;
 *   - drop their secondary ("also reports to") manager edges;
 *   - null out manager_id on their direct reports so org roll-ups + manager-
 *     scoped access never anchor on an archived person (ACTPEOPLE-03).
 * Returns the ids of the reports that were re-pointed, so the caller can log it.
 */
async function vacateLeadershipRolesTx(tx: Tx, personId: number): Promise<number[]> {
  await tx.update(departmentHeads).set({ headPersonId: null }).where(eq(departmentHeads.headPersonId, personId));
  await tx.delete(reportingLines).where(eq(reportingLines.managerId, personId));
  const reports = await tx
    .update(people)
    .set({ managerId: null })
    .where(eq(people.managerId, personId))
    .returning({ id: people.id });
  return reports.map((r) => r.id);
}

/** Bulk activate/deactivate (archive/restore). Soft — never deletes. */
export async function setPeopleActive(ids: number[], active: boolean): Promise<ActionResult> {
  const clean = [...new Set(ids)].filter((n) => Number.isFinite(n));
  if (!clean.length) return { ok: false, error: "No people selected." };

  // Flip every selected person's active flag, and on archive run the SAME full
  // offboarding set as the single-row path — vacate leadership roles + orphan
  // direct reports (ACTPEOPLE-03), start the offboarding journey, return assets,
  // vacate custodianships — all in ONE transaction so the batch is all-or-nothing
  // (no half-offboarded leaver with their laptop still assigned).
  const orphanedByPerson = new Map<number, number[]>();
  try {
    await withTx(async (tx) => {
      for (const pid of clean) {
        await tx.update(people).set({ active }).where(eq(people.id, pid));
        if (!active) {
          orphanedByPerson.set(pid, await vacateLeadershipRolesTx(tx, pid));
          await startJourneyTx(tx, pid, "offboarding");
          await returnAssetsForPersonTx(tx, pid);
          await clearCustodianForPersonTx(tx, pid);
        }
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update these people." };
  }

  await Promise.all(clean.map((pid) => logPersonEvent(pid, active ? "restored" : "archived")));
  await Promise.all(
    [...orphanedByPerson].map(([pid, reports]) =>
      reports.length === 0
        ? Promise.resolve()
        : logPersonEvent(pid, "updated", {
            field: "Direct reports",
            oldValue: `${reports.length} report${reports.length === 1 ? "" : "s"}`,
            newValue: "Manager cleared (archived)",
          })
    )
  );

  // Re-index each person to re-stamp lifecycle (active ↔ history); kept searchable.
  for (const pid of clean) void reindexEntity("person", pid);

  invalidate();
  return { ok: true };
}

/* ----------------------------------------------------------------------
 * Probation — confirm (passed), extend, or create a review task.
 * ---------------------------------------------------------------------- */
/** Set or clear a person's probation end date (clear = "confirmed/passed"). */
export async function setProbationDateAction(personId: number, dateIso: string | null): Promise<ActionResult> {
  const { data: before } = await sb.from("people").select("probation_end_date").eq("id", personId).maybeSingle();
  const newVal = dateIso ? new Date(`${dateIso}T00:00:00Z`).toISOString() : null;
  const { error } = await sb.from("people").update({ probation_end_date: newVal }).eq("id", personId);
  if (error) return { ok: false, error: error.message };

  const oldFmt = before?.probation_end_date ? String(before.probation_end_date).slice(0, 10) : null;
  await logPersonFieldChanges(personId, [
    { field: "Probation end", oldValue: oldFmt, newValue: dateIso ? dateIso.slice(0, 10) : "Confirmed (passed)" },
  ]);

  // Confirming probation passed (date cleared) ticks the matching onboarding
  // journey step so the two surfaces agree. Best-effort — never block the write.
  if (dateIso == null) {
    try {
      const { data: steps } = await sb
        .from("todos")
        .select("id,title,done")
        .eq("person_id", personId)
        .eq("kind", "onboarding");
      const ids = (steps ?? [])
        .filter((t) => !(t.done as boolean | null) && /probation/i.test((t.title as string | null) ?? ""))
        .map((t) => t.id as number);
      if (ids.length) await sb.from("todos").update({ done: true }).in("id", ids);
    } catch {}
  }

  invalidate();
  return { ok: true };
}

/** Create a tracked "Probation review" task in the person's company, due on the
 *  probation end date, owned by their manager when set. */
export async function createProbationReviewTaskAction(
  personId: number
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const { data: p } = await sb
    .from("people")
    .select("name,company_id,manager_id,probation_end_date")
    .eq("id", personId)
    .maybeSingle();
  if (!p) return { ok: false, error: "Person not found." };
  if (!p.company_id) return { ok: false, error: "Assign this person to a company first, then create the review." };

  const { data: company } = await sb.from("companies").select("code,code_prefix").eq("id", p.company_id).maybeSingle();
  const now = new Date();
  try {
    const task = await insertTaskWithUniqueCodeSb(p.company_id as number, (company?.code as string) || "", {
      actionItem: `Probation review: ${p.name}`,
      ownerId: (p.manager_id as number | null) ?? null,
      status: "Not Started",
      priority: "High",
      category: "HR",
      deadline: p.probation_end_date ? new Date(p.probation_end_date as string) : null,
      createdDate: now,
      lastUpdatedAt: now,
      archived: false,
    });
    await sb.from("audit_log").insert({
      task_id: task.id, task_code: task.code, company_id: p.company_id,
      entry_type: "CREATE", field: "Task", old_value: null, new_value: `Probation review: ${p.name}`,
      change_reason: "Created from a probation review", created_at: now.toISOString(), created_by: "web-ui",
    });
    revalidatePath("/people");
    updateTag("tasks");
    return { ok: true, code: task.code };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the review task." };
  }
}

/* ----------------------------------------------------------------------
 * Bulk profile edits — set company / department / manager on many people.
 * ---------------------------------------------------------------------- */
export async function bulkSetPeopleField(
  ids: number[],
  field: "company" | "department" | "manager",
  value: number | string | null
): Promise<ActionResult> {
  const clean = [...new Set(ids)].filter((n) => Number.isFinite(n));
  if (!clean.length) return { ok: false, error: "No people selected." };

  const patch: Record<string, unknown> = {};
  let label = "";
  let display: string | null = null;
  let targets = clean;

  if (field === "company") {
    const cid = value == null ? null : Number(value);
    patch.company_id = cid;
    label = "Company";
    if (cid) {
      const { data } = await sb.from("companies").select("name").eq("id", cid).maybeSingle();
      display = (data?.name as string | null) ?? null;
    }
  } else if (field === "manager") {
    const mid = value == null ? null : Number(value);
    patch.manager_id = mid;
    label = "Manager";
    // A person can't be their own manager — never set that. Also skip anyone the
    // new manager already reports to (directly or indirectly), as that would
    // close a reporting loop (ACTPEOPLE-01); those people keep their manager.
    if (mid) {
      const allowed: number[] = [];
      for (const id of clean) {
        if (id === mid) continue;
        if (await primaryChainReaches(mid, id)) continue; // would loop back to this person
        allowed.push(id);
      }
      targets = allowed;
      const { data } = await sb.from("people").select("name").eq("id", mid).maybeSingle();
      display = (data?.name as string | null) ?? null;
    }
  } else {
    // department — resolve by name (case-insensitive, create if new). Shared
    // helper so "finance" doesn't create a duplicate of "Finance".
    const name = value ? String(value).trim() : "";
    patch.department_id = name ? await resolveDepartmentByName(name) : null;
    label = "Department";
    display = name || null;
  }

  if (targets.length === 0) return { ok: false, error: "Nothing to update." };
  const { error } = await sb.from("people").update(patch).in("id", targets);
  if (error) return { ok: false, error: error.message };

  await Promise.all(targets.map((pid) => logPersonFieldChanges(pid, [{ field: label, oldValue: null, newValue: display }])));
  invalidate();
  return { ok: true };
}

/**
 * Add (or clear) a secondary "also reports to" manager for many people at once —
 * e.g. "everyone in Finance now also reports to the new CFO". Passing managerId
 * = null clears ALL secondary managers for the selected people. Never adds a
 * person as their own manager, nor a duplicate of their primary manager.
 */
export async function bulkAddSecondaryManager(ids: number[], managerId: number | null): Promise<ActionResult> {
  const clean = [...new Set(ids)].filter((n) => Number.isFinite(n));
  if (!clean.length) return { ok: false, error: "No people selected." };

  if (managerId == null) {
    const { error } = await sb.from("reporting_lines").delete().in("person_id", clean);
    if (error) return { ok: false, error: error.message };
    invalidate();
    return { ok: true };
  }

  // Skip the manager themselves and anyone whose PRIMARY manager is already them.
  const { data: primaries } = await sb.from("people").select("id,manager_id").in("id", clean);
  const targets = (primaries ?? [])
    .filter((p) => p.id !== managerId && (p.manager_id as number | null) !== managerId)
    .map((p) => p.id as number);
  if (!targets.length) return { ok: false, error: "Nothing to update." };

  const rows = targets.map((pid) => ({ person_id: pid, manager_id: managerId }));
  const { error } = await sb.from("reporting_lines").upsert(rows, { onConflict: "person_id,manager_id" });
  if (error) return { ok: false, error: error.message };

  const { data: mgr } = await sb.from("people").select("name").eq("id", managerId).maybeSingle();
  await Promise.all(targets.map((pid) => logPersonFieldChanges(pid, [{ field: "Also reports to", oldValue: null, newValue: (mgr?.name as string | null) ?? null }])));
  invalidate();
  return { ok: true };
}

/* ----------------------------------------------------------------------
 * Staff-portal access — manage straight from the People page (drawer Manage
 * tab + bulk bar), no trip to Settings. The quick toggle deliberately offers
 * only Staff/Manager/Director; the every-company "Admin" (hr) role stays in
 * Settings so it can't be granted with a casual tap. Mirrors the Settings
 * actions (setPortalAccess/setPortalRole/revokePortalAccess) but returns an
 * ActionResult and revalidates /people instead of redirecting to /settings.
 * ---------------------------------------------------------------------- */
type QuickRole = "staff" | "manager" | "director";
const asQuickRole = (r: unknown): QuickRole => (r === "manager" ? "manager" : r === "director" ? "director" : "staff");

/** Change a portal user's role without touching their password. Only works for
 *  people who already have access — never grants access via a role change. */
export async function setPortalRoleQuick(personId: number, role: string): Promise<ActionResult> {
  if (!Number.isFinite(personId) || personId <= 0) return { ok: false, error: "Invalid person." };
  const next = asQuickRole(role);
  const { data: row } = await sb.from("people").select("portal_password_hash,portal_role").eq("id", personId).maybeSingle();
  if (!row?.portal_password_hash) return { ok: false, error: "No portal access yet — enable it first." };
  const prev = (row.portal_role as string | null) ?? "staff";
  if (prev === next) return { ok: true };
  // Demoting out of "director" clears any company-scope (a scoped director becoming a
  // manager/staff must not keep a stale director_company_id). This quick control
  // doesn't pick a company, so a director set here is portfolio-wide; scope it in
  // Settings → Staff portal access.
  const { error } = await sb
    .from("people")
    .update({ portal_role: next, ...(next !== "director" ? { director_company_id: null } : {}) })
    .eq("id", personId);
  if (error) return { ok: false, error: error.message };
  if (next !== "director") await sb.from("director_companies").delete().eq("person_id", personId);
  await recordEvent("portal.role.changed", "ok", { personId, from: prev, to: next });
  invalidate();
  return { ok: true };
}

/** Set (or clear) a person's optional portal designation — the display title
 *  shown instead of the plain role label (e.g. "Group Admin Manager"). Empty
 *  string clears it. Cosmetic today; a hook for per-manager tiers later. */
export async function setPortalDesignationQuick(personId: number, designation: string): Promise<ActionResult> {
  if (!Number.isFinite(personId) || personId <= 0) return { ok: false, error: "Invalid person." };
  const value = designation.trim().slice(0, 60) || null;
  const { error } = await sb.from("people").update({ portal_designation: value }).eq("id", personId);
  if (error) return { ok: false, error: error.message };
  await recordEvent("portal.designation.changed", "ok", { personId, designation: value });
  invalidate();
  return { ok: true };
}

/** Enable portal access (set password + role) for a person with none. */
export async function enablePortalAccessQuick(personId: number, role: string, password: string): Promise<ActionResult> {
  if (!Number.isFinite(personId) || personId <= 0) return { ok: false, error: "Invalid person." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const next = asQuickRole(role);
  const { data: before } = await sb.from("people").select("portal_password_hash").eq("id", personId).maybeSingle();
  const wasEnabled = Boolean(before?.portal_password_hash);
  const { error } = await sb.from("people").update({
    portal_password_hash: hashPassword(password),
    portal_enabled_at: new Date().toISOString(),
    portal_role: next,
  }).eq("id", personId);
  if (error) return { ok: false, error: error.message };
  await recordEvent(wasEnabled ? "portal.access.reset" : "portal.access.granted", "ok", { personId, role: next });
  invalidate();
  return { ok: true };
}

/** Revoke portal sign-in. Keeps every record the person created; resets role to
 *  "staff" so a later re-grant never silently restores higher powers. */
export async function revokePortalAccessQuick(personId: number): Promise<ActionResult> {
  if (!Number.isFinite(personId) || personId <= 0) return { ok: false, error: "Invalid person." };
  const { error } = await sb.from("people")
    .update({ portal_password_hash: null, portal_enabled_at: null, portal_role: "staff", director_company_id: null })
    .eq("id", personId);
  if (error) return { ok: false, error: error.message };
  await sb.from("director_companies").delete().eq("person_id", personId);
  await recordEvent("portal.access.revoked", "ok", { personId });
  invalidate();
  return { ok: true };
}

/** Bulk-set the portal role for selected people. Only people who already have
 *  access are changed; those without are reported back as skipped. */
export async function bulkSetPortalRole(ids: number[], role: string): Promise<ActionResult & { updated?: number; skipped?: number }> {
  const clean = [...new Set(ids)].filter((n) => Number.isFinite(n));
  if (!clean.length) return { ok: false, error: "No people selected." };
  const next = asQuickRole(role);
  const { data: rows } = await sb.from("people").select("id,portal_password_hash,portal_role").in("id", clean);
  const eligible = (rows ?? []).filter((r) => r.portal_password_hash);
  const targets = eligible.filter((r) => ((r.portal_role as string | null) ?? "staff") !== next).map((r) => r.id as number);
  const skipped = clean.length - eligible.length;
  if (!targets.length) {
    if (skipped === clean.length) return { ok: false, error: "None of the selected people have portal access yet." };
    return { ok: true, updated: 0, skipped };
  }
  const { error } = await sb.from("people").update({ portal_role: next }).in("id", targets);
  if (error) return { ok: false, error: error.message };
  await Promise.all(targets.map((pid) => recordEvent("portal.role.changed", "ok", { personId: pid, to: next, bulk: true })));
  invalidate();
  return { ok: true, updated: targets.length, skipped };
}

/* ----------------------------------------------------------------------
 * Snooze / unsnooze reminders
 * ---------------------------------------------------------------------- */
export async function snoozePerson(id: number, untilIso: string | null): Promise<ActionResult> {
  // untilIso is "YYYY-MM-DD" from a date input, or null to clear
  const value = untilIso ? new Date(untilIso) : null;
  if (untilIso && Number.isNaN(value?.getTime())) {
    return { ok: false, error: "Invalid date." };
  }

  const { error } = await sb
    .from("people")
    .update({ snoozed_until: value ? value.toISOString() : null })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  await logPersonEvent(id, value ? "snoozed" : "unsnoozed", value ? { detail: `Until ${untilIso}` } : {});

  invalidate();
  return { ok: true };
}
