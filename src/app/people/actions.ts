"use server";

import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";

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
      manager_id: n(formData, "managerId"),
      notes: s(formData, "notes"),
      active: true,
      contact_status: contactStatus(email, phone, whatsapp),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

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

  const email = s(formData, "email");
  const phone = s(formData, "phone");
  const whatsapp = s(formData, "whatsapp");

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
      manager_id: safeManagerId,
      notes: s(formData, "notes"),
      contact_status: contactStatus(email, phone, whatsapp),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

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

  invalidate();
  return { ok: true, active: nextActive };
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
