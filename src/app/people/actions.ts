"use server";

import { GROQ_FAST } from "@/lib/ai-models";
import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import { normalizePersonType } from "@/lib/person-types";
import { ensurePersonRequirements } from "@/lib/requirements";
import { startJourney, AUTO_ONBOARD_TYPES } from "@/lib/onboarding";
import { returnAssetsForPerson } from "@/lib/assets";
import { getGroqKey } from "@/lib/settings";
import { staffIdFor } from "@/lib/staff-id";

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

/** Resolve a department by name, creating it if new. Returns its id (or null). */
async function resolveDepartmentId(formData: FormData): Promise<number | null> {
  const name = s(formData, "department");
  if (!name) return null;
  const { data: existing } = await sb.from("departments").select("id").eq("name", name).maybeSingle();
  if (existing) return existing.id as number;
  const { data: created } = await sb.from("departments").insert({ name }).select("id").single();
  return (created?.id as number | undefined) ?? null;
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
 * Replace a person's secondary (dotted-line) reporting links. The PRIMARY manager
 * lives on people.manager_id and is excluded here to avoid a duplicate solid+dotted
 * line; a person can't report to themselves either.
 */
async function syncReportingLines(personId: number, managerIds: number[], primaryManagerId: number | null) {
  await sb.from("reporting_lines").delete().eq("person_id", personId);
  const seen = new Set<number>();
  const rows = managerIds
    .filter((mid) => mid !== personId && mid !== primaryManagerId && !seen.has(mid) && (seen.add(mid), true))
    .map((mid) => ({ person_id: personId, manager_id: mid }));
  if (rows.length === 0) return;
  await sb.from("reporting_lines").insert(rows);
}

function invalidate() {
  revalidatePath("/people");
  revalidatePath("/outbox");
  updateTag("people");
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
  const apiKey = await getGroqKey();
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
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_FAST,
        messages: [
          { role: "system", content: "You extract structured data and reply with strict JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return { ok: true, fields: rulePersonFields(trimmed), source: "rules" };
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content as string | undefined;
    if (!content) return { ok: true, fields: rulePersonFields(trimmed), source: "rules" };
    const parsed = JSON.parse(content) as Record<string, unknown>;
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
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await syncAssociations(data.id as number, parseAssociations(formData));
  await syncReportingLines(data.id as number, parseSecondaryManagers(formData), n(formData, "managerId"));
  const newType = normalizePersonType(personType(formData));
  // Auto-generate this person's document checklist for their type.
  try { await ensurePersonRequirements(data.id as number, newType); } catch {}
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
  const { data: before } = await sb.from("people").select("company_id,previous_staff_ids").eq("id", id).maybeSingle();
  if (before && before.company_id != null && newCompanyId !== before.company_id) {
    const oldId = await staffIdFor(id);
    if (oldId) {
      const existing = (before.previous_staff_ids as string | null) ?? "";
      previousStaffIds = existing ? `${existing},${oldId}` : oldId;
    }
  }

  const { error } = await sb
    .from("people")
    .update({
      ...(previousStaffIds !== undefined ? { previous_staff_ids: previousStaffIds } : {}),
      name,
      email,
      phone,
      whatsapp,
      preferred_channel: s(formData, "preferredChannel"),
      role: s(formData, "role"),
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
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  await syncAssociations(id, parseAssociations(formData));
  await syncReportingLines(id, parseSecondaryManagers(formData), safeManagerId);
  // Reconcile the checklist to the (possibly changed) type.
  try { await ensurePersonRequirements(id, normalizePersonType(personType(formData))); } catch {}

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

  // Department — resolve by name (create if new), only when currently unset.
  if (fields.department && isEmpty(current.department_id)) {
    const name = fields.department.trim();
    const { data: existing } = await sb.from("departments").select("id").eq("name", name).maybeSingle();
    let deptId = (existing?.id as number | undefined) ?? null;
    if (!deptId) {
      const { data: created } = await sb.from("departments").insert({ name }).select("id").single();
      deptId = (created?.id as number | undefined) ?? null;
    }
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
  const { error } = await sb.from("people").update({ active: nextActive }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Archiving someone kicks off an offboarding checklist (idempotent) and
  // returns any company assets they were holding back to the store.
  if (!nextActive) {
    try { await startJourney(id, "offboarding"); } catch {}
    try { await returnAssetsForPerson(id); } catch {}
  }

  invalidate();
  return { ok: true, active: nextActive };
}

/** Bulk activate/deactivate (archive/restore). Soft — never deletes. */
export async function setPeopleActive(ids: number[], active: boolean): Promise<ActionResult> {
  const clean = [...new Set(ids)].filter((n) => Number.isFinite(n));
  if (!clean.length) return { ok: false, error: "No people selected." };
  const { error } = await sb.from("people").update({ active }).in("id", clean);
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true };
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

  invalidate();
  return { ok: true };
}
