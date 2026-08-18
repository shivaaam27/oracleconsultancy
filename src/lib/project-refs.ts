// The project's reference lists — server half (Phase 7).
// ⚠️ SERVER-ONLY (imports `sb`). Client half: project-refs-shared.ts.

import { sb } from "@/db/supabase";
import { logProjectChange } from "@/lib/project-audit";
import {
  normaliseRefName, STARTER_LISTS,
  type ProjectRef, type RefKind,
} from "@/lib/project-refs-shared";

export type WriteResult = { ok: true; id?: number; name?: string } | { ok: false; error: string };

// ⚠️ One string literal on one line — see the note in lib/projects.ts.
const COLS = "id,project_id,kind,name,sort_order,active";

function mapRow(r: Record<string, unknown>): ProjectRef {
  return {
    id: r.id as number,
    projectId: r.project_id as number,
    kind: r.kind as string,
    name: r.name as string,
    sortOrder: (r.sort_order as number | null) ?? 0,
    active: Boolean(r.active),
  };
}

export async function listRefs(projectId: number): Promise<ProjectRef[]> {
  const { data } = await sb
    .from("project_refs").select(COLS).eq("project_id", projectId)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/** Just the live names of one list — what a dropdown needs. */
export function namesOf(refs: ProjectRef[], kind: RefKind): string[] {
  return refs.filter((r) => r.kind === kind && r.active).map((r) => r.name);
}

export async function createRef(projectId: number, kind: string, name: string): Promise<WriteResult> {
  const clean = normaliseRefName(kind, name);
  if (!clean) return { ok: false, error: "Give it a name." };

  const { data: last } = await sb
    .from("project_refs").select("sort_order")
    .eq("project_id", projectId).eq("kind", kind)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await sb
    .from("project_refs")
    .insert({
      project_id: projectId, kind, name: clean,
      sort_order: ((last?.sort_order as number | undefined) ?? 0) + 10,
    })
    .select("id").single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: `“${clean}” is already on this list.` };
    console.error("[refs] create failed:", error.message);
    return { ok: false, error: error.message };
  }
  await logProjectChange({
    projectId, entity: "ref", entityId: data?.id as number,
    label: kind, action: "created", newValue: clean,
  });
  return { ok: true, id: data?.id as number, name: clean };
}

/**
 * Rename in place.
 *
 * ⚠️ THIS DOES NOT RE-POINT THE TRANSACTIONS. Budget lines and requisitions
 * store the category and supplier as TEXT, so renaming CEMENT to CEMENT-42
 * leaves every existing line still saying CEMENT. `renameAndRepoint` below does
 * the whole job; this exists only for a list nothing points at yet.
 */
export async function renameRef(id: number, name: string): Promise<WriteResult> {
  const { data: row } = await sb.from("project_refs").select("kind").eq("id", id).maybeSingle();
  const clean = normaliseRefName((row?.kind as string) ?? "", name);
  if (!clean) return { ok: false, error: "Give it a name." };
  const { error } = await sb.from("project_refs").update({ name: clean }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: `“${clean}” is already on this list.` };
    return { ok: false, error: error.message };
  }
  return { ok: true, id };
}

/** Which transaction column each list is written into. */
const POINTS_AT: Partial<Record<string, Array<{ table: string; column: string }>>> = {
  category: [{ table: "project_budget_lines", column: "category" }],
  sub_job: [{ table: "project_budget_lines", column: "sub_job" }],
  supplier: [
    { table: "project_requisitions", column: "supplier" },
    { table: "project_payments", column: "supplier" },
  ],
  route: [
    { table: "project_requisitions", column: "route" },
    { table: "project_payments", column: "route" },
  ],
  float_holder: [{ table: "project_expenditures", column: "payer" }],
  designation: [{ table: "project_site_people", column: "designation" }],
};

/**
 * Rename, and carry every transaction that used the old name with it.
 *
 * The transactions store these as text rather than as a foreign key, which is
 * deliberate — a requisition raised against SHAO must still say SHAO in ten
 * years even if the list changes. The cost is that a rename has to be applied in
 * both places, and that is what this does.
 */
export async function renameAndRepoint(projectId: number, id: number, name: string): Promise<WriteResult> {
  const { data: row } = await sb.from("project_refs").select("kind,name").eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "That entry no longer exists." };
  const kind = row.kind as string;
  const from = row.name as string;
  const to = normaliseRefName(kind, name);
  if (!to) return { ok: false, error: "Give it a name." };
  if (to === from) return { ok: true, id };

  const renamed = await renameRef(id, to);
  if (!renamed.ok) return renamed;

  for (const target of POINTS_AT[kind] ?? []) {
    const { error } = await sb
      .from(target.table).update({ [target.column]: to })
      .eq("project_id", projectId).eq(target.column, from);
    if (error) console.error(`[refs] repoint ${target.table}.${target.column} failed:`, error.message);
  }
  // A rename moves every transaction that named the old value, so it is a
  // change to the books, not just to a dropdown.
  await logProjectChange({
    projectId, entity: "ref", entityId: id, label: kind,
    action: "updated", field: "name", oldValue: from, newValue: to,
  });
  return { ok: true, id };
}

/** Merge one entry into another, moving every transaction across first. */
export async function mergeRefs(projectId: number, fromId: number, intoId: number): Promise<WriteResult> {
  const { data: rows } = await sb.from("project_refs").select("id,kind,name").in("id", [fromId, intoId]);
  const from = rows?.find((r) => r.id === fromId);
  const into = rows?.find((r) => r.id === intoId);
  if (!from || !into) return { ok: false, error: "One of those entries no longer exists." };
  if (from.kind !== into.kind) return { ok: false, error: "Those are on different lists." };

  for (const target of POINTS_AT[from.kind as string] ?? []) {
    const { error } = await sb
      .from(target.table).update({ [target.column]: into.name })
      .eq("project_id", projectId).eq(target.column, from.name);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await sb.from("project_refs").delete().eq("id", fromId);
  if (error) return { ok: false, error: error.message };
  await logProjectChange({
    projectId, entity: "ref", entityId: intoId, label: from.kind as string,
    action: "updated", field: "name", oldValue: from.name, newValue: into.name,
  });
  return { ok: true, id: intoId };
}

/**
 * Delete — but only if nothing points at it.
 *
 * A list entry with transactions behind it is retired (`active = false`) rather
 * than removed, so the old rows keep meaning what they said. The caller is told
 * which it was.
 */
export async function deleteRef(projectId: number, id: number): Promise<{ ok: true; retired: boolean } | { ok: false; error: string }> {
  const { data: row } = await sb.from("project_refs").select("kind,name").eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "That entry no longer exists." };

  let inUse = 0;
  for (const target of POINTS_AT[row.kind as string] ?? []) {
    const { count } = await sb
      .from(target.table).select("id", { count: "exact", head: true })
      .eq("project_id", projectId).eq(target.column, row.name as string);
    inUse += count ?? 0;
  }

  if (inUse > 0) {
    const { error } = await sb.from("project_refs").update({ active: false }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await logProjectChange({
      projectId, entity: "ref", entityId: id, label: row.kind as string,
      action: "updated", field: "active", oldValue: true, newValue: false,
    });
    return { ok: true, retired: true };
  }
  const { error } = await sb.from("project_refs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logProjectChange({
    projectId, entity: "ref", entityId: id, label: row.kind as string,
    action: "deleted", oldValue: row.name,
  });
  return { ok: true, retired: false };
}

/**
 * The workbook's standard lists, on request.
 *
 * ⚠️ Never called on create. Only from a button. Skips anything already there,
 * so pressing it twice is harmless.
 */
export async function seedStarterLists(projectId: number): Promise<WriteResult> {
  const existing = await listRefs(projectId);
  const have = new Set(existing.map((r) => `${r.kind}|${r.name}`));
  const rows: Array<Record<string, unknown>> = [];
  for (const [kind, names] of Object.entries(STARTER_LISTS)) {
    names.forEach((name, i) => {
      const clean = normaliseRefName(kind, name);
      if (have.has(`${kind}|${clean}`)) return;
      rows.push({ project_id: projectId, kind, name: clean, sort_order: (i + 1) * 10 });
    });
  }
  if (rows.length === 0) return { ok: true };
  const { error } = await sb.from("project_refs").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Copy every list from another project.
 *
 * This is what makes per-project lists workable: set the first villa up
 * properly, then start each new one from it. Anything already present is left
 * alone, so it can be run against a half-built project.
 */
export async function copyRefsFrom(intoProjectId: number, fromProjectId: number): Promise<{ ok: true; copied: number } | { ok: false; error: string }> {
  const [source, existing] = await Promise.all([listRefs(fromProjectId), listRefs(intoProjectId)]);
  const have = new Set(existing.map((r) => `${r.kind}|${r.name}`));
  const rows = source
    .filter((r) => r.active && !have.has(`${r.kind}|${r.name}`))
    .map((r) => ({ project_id: intoProjectId, kind: r.kind, name: r.name, sort_order: r.sortOrder }));
  if (rows.length === 0) return { ok: true, copied: 0 };
  const { error } = await sb.from("project_refs").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, copied: rows.length };
}

/**
 * Throw away every transaction on a project, keeping the project and its lists.
 *
 * Asked for explicitly: while learning, a budget line with a requisition against
 * it cannot be deleted (the database refuses, correctly), which makes it
 * impossible to wipe and try again. This is the way out. It is destructive and
 * belongs behind a typed confirmation.
 */
export async function discardProjectData(projectId: number): Promise<{ ok: true; removed: Record<string, number> } | { ok: false; error: string }> {
  // Order matters: children before the budget lines they point at.
  const order = [
    "project_site_days", "project_site_people", "project_payment_stages",
    "project_expenditures", "project_payments", "project_requisitions",
    "project_budget_lines",
  ];
  const removed: Record<string, number> = {};
  for (const table of order) {
    const { count } = await sb.from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId);
    const { error } = await sb.from(table).delete().eq("project_id", projectId);
    if (error) return { ok: false, error: `${table}: ${error.message}` };
    removed[table] = count ?? 0;
  }
  return { ok: true, removed };
}
