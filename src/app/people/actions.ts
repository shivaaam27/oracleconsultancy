"use server";

import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import { normalizePersonType } from "@/lib/person-types";
import { ensurePersonRequirements } from "@/lib/requirements";
import { startJourney, AUTO_ONBOARD_TYPES } from "@/lib/onboarding";
import { returnAssetsForPerson } from "@/lib/assets";

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
