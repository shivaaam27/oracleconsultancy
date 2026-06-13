"use server";

import { sb } from "@/db/supabase";
import { revalidatePath } from "next/cache";

type Result = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/companies");
  revalidatePath("/people");
  revalidatePath("/hrms/org");
  revalidatePath("/hrms/assets");
}

/* ------------------------------------------------------------------ */
/* Sites / locations                                                  */
/* ------------------------------------------------------------------ */
export async function createSite(name: string): Promise<Result> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Enter a site name." };
  const { data: existing } = await sb.from("sites").select("id").ilike("name", clean).maybeSingle();
  if (existing) return { ok: false, error: "That site already exists." };
  const { error } = await sb.from("sites").insert({ name: clean });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function renameSite(id: number, name: string): Promise<Result> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Enter a site name." };
  const { data: clash } = await sb.from("sites").select("id").ilike("name", clean).maybeSingle();
  if (clash && (clash.id as number) !== id) return { ok: false, error: "Another site already uses that name." };
  const { error } = await sb.from("sites").update({ name: clean }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Merge one site into another: re-point people's work-site and residence, then delete the source. */
export async function mergeSites(fromId: number, intoId: number): Promise<Result> {
  if (fromId === intoId) return { ok: false, error: "Pick two different sites." };
  const a = await sb.from("people").update({ work_site_id: intoId }).eq("work_site_id", fromId);
  if (a.error) return { ok: false, error: a.error.message };
  const b = await sb.from("people").update({ residence_site_id: intoId }).eq("residence_site_id", fromId);
  if (b.error) return { ok: false, error: b.error.message };
  const { error } = await sb.from("sites").delete().eq("id", fromId);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Delete a site; anyone based/living there is set to "no site". */
export async function deleteSite(id: number): Promise<Result> {
  const a = await sb.from("people").update({ work_site_id: null }).eq("work_site_id", id);
  if (a.error) return { ok: false, error: a.error.message };
  const b = await sb.from("people").update({ residence_site_id: null }).eq("residence_site_id", id);
  if (b.error) return { ok: false, error: b.error.message };
  const { error } = await sb.from("sites").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Roles / job titles  (people.role is free text — rename re-points it) */
/* ------------------------------------------------------------------ */
export async function createRole(name: string): Promise<Result> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Enter a job title." };
  const { data: existing } = await sb.from("job_titles").select("id").ilike("name", clean).maybeSingle();
  if (existing) return { ok: false, error: "That job title already exists." };
  const { error } = await sb.from("job_titles").insert({ name: clean });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Rename a job title AND re-point every person whose role text matches the old name. */
export async function renameRole(id: number, name: string): Promise<Result> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Enter a job title." };
  const { data: current } = await sb.from("job_titles").select("name").eq("id", id).maybeSingle();
  const oldName = current?.name as string | undefined;
  const { data: clash } = await sb.from("job_titles").select("id").ilike("name", clean).maybeSingle();
  if (clash && (clash.id as number) !== id) return { ok: false, error: "Another job title already uses that name." };
  const { error } = await sb.from("job_titles").update({ name: clean }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (oldName) await sb.from("people").update({ role: clean }).ilike("role", oldName);
  revalidate();
  return { ok: true };
}

/** Merge one job title into another: re-point people's role text, then delete the source title. */
export async function mergeRoles(fromId: number, intoId: number): Promise<Result> {
  if (fromId === intoId) return { ok: false, error: "Pick two different job titles." };
  const [{ data: from }, { data: into }] = await Promise.all([
    sb.from("job_titles").select("name").eq("id", fromId).maybeSingle(),
    sb.from("job_titles").select("name").eq("id", intoId).maybeSingle(),
  ]);
  if (from?.name && into?.name) await sb.from("people").update({ role: into.name as string }).ilike("role", from.name as string);
  const { error } = await sb.from("job_titles").delete().eq("id", fromId);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Remove a job title from the managed list (people keep their current role text). */
export async function deleteRole(id: number): Promise<Result> {
  const { error } = await sb.from("job_titles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
