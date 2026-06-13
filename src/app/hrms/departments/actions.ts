"use server";

import { sb } from "@/db/supabase";
import { revalidatePath } from "next/cache";

type Result = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/companies");
  revalidatePath("/hrms/org");
  revalidatePath("/people");
}

/** Create a new department (no-op if the name already exists). */
export async function createDepartment(name: string): Promise<Result> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Enter a department name." };
  const { data: existing } = await sb.from("departments").select("id").ilike("name", clean).maybeSingle();
  if (existing) return { ok: false, error: "A department with that name already exists." };
  const { error } = await sb.from("departments").insert({ name: clean });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Rename a department. */
export async function renameDepartment(id: number, name: string): Promise<Result> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Enter a department name." };
  const { data: clash } = await sb.from("departments").select("id").ilike("name", clean).maybeSingle();
  if (clash && (clash.id as number) !== id) return { ok: false, error: "Another department already uses that name." };
  const { error } = await sb.from("departments").update({ name: clean }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/**
 * Merge one department into another: re-point all people, tasks and per-company
 * heads from `fromId` to `intoId`, then delete the now-empty source. Heads that
 * would collide with an existing head for the same company are dropped (the
 * target keeps its head).
 */
export async function mergeDepartments(fromId: number, intoId: number): Promise<Result> {
  if (fromId === intoId) return { ok: false, error: "Pick two different departments." };

  // Re-point people and tasks.
  const r1 = await sb.from("people").update({ department_id: intoId }).eq("department_id", fromId);
  if (r1.error) return { ok: false, error: r1.error.message };
  const r2 = await sb.from("tasks").update({ department_id: intoId }).eq("department_id", fromId);
  if (r2.error) return { ok: false, error: r2.error.message };

  // Move heads where the target company has none yet; otherwise drop the source row
  // (the unique (company_id, department_id) index forbids two heads per company).
  const { data: fromHeads } = await sb.from("department_heads").select("id,company_id").eq("department_id", fromId);
  const { data: intoHeads } = await sb.from("department_heads").select("company_id").eq("department_id", intoId);
  const taken = new Set((intoHeads ?? []).map((h) => h.company_id as number));
  for (const fh of fromHeads ?? []) {
    if (taken.has(fh.company_id as number)) await sb.from("department_heads").delete().eq("id", fh.id as number);
    else await sb.from("department_heads").update({ department_id: intoId }).eq("id", fh.id as number);
  }

  const { error } = await sb.from("departments").delete().eq("id", fromId);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/**
 * Delete a department. Any people/tasks tagged to it are first set to "no
 * department"; its per-company heads are removed.
 */
export async function deleteDepartment(id: number): Promise<Result> {
  const r1 = await sb.from("people").update({ department_id: null }).eq("department_id", id);
  if (r1.error) return { ok: false, error: r1.error.message };
  const r2 = await sb.from("tasks").update({ department_id: null }).eq("department_id", id);
  if (r2.error) return { ok: false, error: r2.error.message };
  await sb.from("department_heads").delete().eq("department_id", id);
  const { error } = await sb.from("departments").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
