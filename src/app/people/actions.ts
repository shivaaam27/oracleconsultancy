"use server";

import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import { normalizePersonType } from "@/lib/person-types";
import { ensurePersonRequirements } from "@/lib/requirements";
import { startJourney, AUTO_ONBOARD_TYPES } from "@/lib/onboarding";
import { returnAssetsForPerson } from "@/lib/assets";
import { getGroqKey } from "@/lib/settings";

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
};

function str120(v: unknown, max = 120): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/** Rule-based fallback when AI is off — pulls the obvious patterns. */
function rulePersonFields(text: string): PersonProfileFields {
  const f: PersonProfileFields = {};
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (email) f.email = email[0];
  const phone = text.match(/(?:\+?\d[\d\s-]{7,}\d)/);
  if (phone) f.phone = phone[0].replace(/\s+/g, "");
  const passport = text.match(/passport\s*(?:no\.?|number)?[:\s]*([A-Z0-9]{6,10})/i);
  if (passport) f.passportNo = passport[1];
  const nida = text.match(/(?:nida|national\s*id)[:\s]*([\d-]{8,25})/i);
  if (nida) f.nationalId = nida[1];
  const dob = text.match(/(?:d\.?o\.?b\.?|date of birth|born)[:\s]*(\d{4}-\d{2}-\d{2})/i);
  if (dob) f.dateOfBirth = dob[1];
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
Resolve worded dates to YYYY-MM-DD. British English. Do not invent values you cannot see.

MESSAGE:
${trimmed.slice(0, 6000)}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
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
    };
    const dob = str120(parsed.dateOfBirth, 10);
    if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) f.dateOfBirth = dob;
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

  const { error } = await sb
    .from("people")
    .update({
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
  // Reconcile the checklist to the (possibly changed) type.
  try { await ensurePersonRequirements(id, normalizePersonType(personType(formData))); } catch {}

  invalidate();
  return { ok: true, id };
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
