"use server";

import { sb } from "@/db/supabase";
import { db } from "@/db";
import { people, sites, jobTitles } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { reindexEntity } from "@/lib/index-hooks";

type Result = { ok: true } | { ok: false; error: string };

/** Match people whose role text equals `name` ignoring surrounding whitespace and
 *  case — mirrors how getRolesAdmin counts them (lower(trim(role))). A raw ILIKE
 *  would skip padded rows (" Manager "), leaving stale role text after a
 *  rename/merge even though the count promised they'd be touched. */
function roleMatches(name: string) {
  return sql`lower(trim(${people.role})) = ${name.trim().toLowerCase()}`;
}

function revalidate() {
  revalidatePath("/companies");
  revalidatePath("/people");

  revalidatePath("/hrms/assets");
}

/* ------------------------------------------------------------------ */
/* Companies                                                          */
/* ------------------------------------------------------------------ */
/** Add a new portfolio company. Needs a name + a 2-letter task-code prefix
 *  (e.g. "DS" → DS-001). `code` mirrors the prefix and must be unique.
 *  Indexes it for search. */
export async function createCompany(name: string, prefix: string, accentColor?: string): Promise<Result> {
  const cleanName = name.trim();
  const cleanPrefix = prefix.trim().toUpperCase();
  if (!cleanName) return { ok: false, error: "Enter a company name." };
  if (!/^[A-Z0-9]{2,4}$/.test(cleanPrefix)) return { ok: false, error: "Prefix must be 2–4 letters/numbers (e.g. DS)." };

  const { data: nameClash } = await sb.from("companies").select("id").ilike("name", cleanName).maybeSingle();
  if (nameClash) return { ok: false, error: "A company with that name already exists." };
  // Reject a clash on EITHER `code` or `code_prefix`. Task codes are generated from
  // `code_prefix` (`<prefix>-NNN`), so two companies sharing a prefix would collide
  // their task numbering even if their legacy `code` differs (e.g. one on "CO03").
  // cleanPrefix is validated to [A-Z0-9]{2,4} above, so it's safe in the .or() filter.
  const { data: codeClash } = await sb
    .from("companies")
    .select("id")
    .or(`code.eq.${cleanPrefix},code_prefix.eq.${cleanPrefix}`)
    .limit(1);
  if (codeClash && codeClash.length) return { ok: false, error: `The code “${cleanPrefix}” is already in use — pick another prefix.` };

  const { data, error } = await sb.from("companies").insert({
    name: cleanName,
    code: cleanPrefix,
    code_prefix: cleanPrefix,
    accent_color: accentColor?.trim() || null,
    active: true,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };

  const id = data.id as number;
  void reindexEntity("company", id); // best-effort search indexing
  revalidate();
  return { ok: true };
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
  // One atomic transaction: either every person is re-pointed AND the old site is
  // removed, or nothing changes — no half-merged state if a step fails.
  try {
    await db.transaction(async (tx) => {
      await tx.update(people).set({ workSiteId: intoId }).where(eq(people.workSiteId, fromId));
      await tx.update(people).set({ residenceSiteId: intoId }).where(eq(people.residenceSiteId, fromId));
      await tx.delete(sites).where(eq(sites.id, fromId));
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not merge the sites." };
  }
  revalidate();
  return { ok: true };
}

/** Delete a site; anyone based/living there is set to "no site". */
export async function deleteSite(id: number): Promise<Result> {
  try {
    await db.transaction(async (tx) => {
      await tx.update(people).set({ workSiteId: null }).where(eq(people.workSiteId, id));
      await tx.update(people).set({ residenceSiteId: null }).where(eq(people.residenceSiteId, id));
      await tx.delete(sites).where(eq(sites.id, id));
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete the site." };
  }
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
  try {
    await db.transaction(async (tx) => {
      await tx.update(jobTitles).set({ name: clean }).where(eq(jobTitles.id, id));
      if (oldName) await tx.update(people).set({ role: clean }).where(roleMatches(oldName));
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not rename the job title." };
  }
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
  try {
    await db.transaction(async (tx) => {
      if (from?.name && into?.name) {
        await tx.update(people).set({ role: into.name as string }).where(roleMatches(from.name as string));
      }
      await tx.delete(jobTitles).where(eq(jobTitles.id, fromId));
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not merge the job titles." };
  }
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
