"use server";

import { sb } from "@/db/supabase";
import { db } from "@/db";
import { people, tasks, departments, departmentHeads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type Result = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/companies");
  revalidatePath("/hrms/org");
  revalidatePath("/people");
}

/** Wider revalidation for merge/delete: those re-point tasks (which carry a
 *  department) and per-company heads, so the Tasks hub and each company-detail
 *  page must refresh too — not just the reference screens. */
function revalidateRepoint() {
  revalidate();
  revalidatePath("/", "layout"); // Tasks hub + anything reading task departments
  revalidatePath("/companies/[id]", "page"); // per-company detail (Tasks / Org tabs)
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

  // One atomic transaction: re-point people + tasks + heads and remove the source,
  // all-or-nothing — so a mid-way failure can never leave records half-moved.
  try {
    await db.transaction(async (tx) => {
      await tx.update(people).set({ departmentId: intoId }).where(eq(people.departmentId, fromId));
      await tx.update(tasks).set({ departmentId: intoId }).where(eq(tasks.departmentId, fromId));

      // Move heads where the target company has none yet; otherwise drop the source
      // row (the unique (company_id, department_id) index forbids two per company).
      const fromHeads = await tx
        .select({ id: departmentHeads.id, companyId: departmentHeads.companyId })
        .from(departmentHeads)
        .where(eq(departmentHeads.departmentId, fromId));
      const intoHeads = await tx
        .select({ companyId: departmentHeads.companyId })
        .from(departmentHeads)
        .where(eq(departmentHeads.departmentId, intoId));
      const taken = new Set(intoHeads.map((h) => h.companyId));
      for (const fh of fromHeads) {
        if (taken.has(fh.companyId)) await tx.delete(departmentHeads).where(eq(departmentHeads.id, fh.id));
        else await tx.update(departmentHeads).set({ departmentId: intoId }).where(eq(departmentHeads.id, fh.id));
      }

      await tx.delete(departments).where(eq(departments.id, fromId));
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not merge the departments." };
  }
  revalidateRepoint();
  return { ok: true };
}

/**
 * Delete a department. Any people/tasks tagged to it are first set to "no
 * department"; its per-company heads are removed.
 */
export async function deleteDepartment(id: number): Promise<Result> {
  try {
    await db.transaction(async (tx) => {
      await tx.update(people).set({ departmentId: null }).where(eq(people.departmentId, id));
      await tx.update(tasks).set({ departmentId: null }).where(eq(tasks.departmentId, id));
      await tx.delete(departmentHeads).where(eq(departmentHeads.departmentId, id));
      await tx.delete(departments).where(eq(departments.id, id));
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete the department." };
  }
  revalidateRepoint();
  return { ok: true };
}
