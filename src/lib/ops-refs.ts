// ─────────────────────────────────────────────────────────────────────────────
// OPS REFERENCE LISTS — the writer and the reader (SERVER-ONLY, imports `sb`).
//
// Stage 1 of the ops module. Eight lists in one table, scoped to the company
// doing the trading. The client half is `ops-refs-shared.ts`.
//
// The rules are the ones the projects module already proved:
//   · names are tidied on the way in, so one agent cannot become three
//   · a rename RE-POINTS the orders that named the old value (see POINTS_AT)
//   · deleting something in use RETIRES it instead, and says which happened
//   · nothing seeds itself — starter lists are a button the owner presses
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
import {
  normaliseOpsRefName, OPS_STARTER_LISTS,
  type OpsRef,
} from "@/lib/ops-refs-shared";

export type WriteResult = { ok: true; id?: number; name?: string } | { ok: false; error: string };

const COLS = "id,company_id,kind,name,note,sort_order,active,created_by,created_at";

function mapRow(r: Record<string, unknown>): OpsRef {
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    kind: r.kind as string,
    name: r.name as string,
    note: (r.note as string | null) ?? null,
    sortOrder: (r.sort_order as number | null) ?? 0,
    active: Boolean(r.active),
  };
}

/**
 * Where each list is USED, so a rename can follow it.
 *
 * ⚠️ Empty until Stage 2 builds the order line. It is here now, named and
 * documented, because the projects module learned this the expensive way: the
 * transactions store these values as TEXT on purpose — an order raised against
 * ALMOL must still say ALMOL in ten years — so a rename has to be applied in
 * both places or the books quietly disagree with the list.
 *
 * **Add the order tables here the moment they exist.**
 */
const POINTS_AT: Record<string, Array<{ table: string; column: string }>> = {
  client: [],
  cost_centre: [],
  supplier: [],
  clearing_agent: [],
  origin: [],
  delivery_status: [],
  mode: [],
  ageing_bucket: [],
};

/* ──────────────────────────────────────────────────────────────── reads ─── */

export async function listOpsRefs(companyId: number): Promise<OpsRef[]> {
  const { data } = await sb
    .from("ops_refs").select(COLS).eq("company_id", companyId)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/** The names of one list, for a dropdown. Retired entries are left out. */
export function opsNamesOf(refs: OpsRef[], kind: string): string[] {
  return refs.filter((r) => r.kind === kind && r.active).map((r) => r.name);
}

/* ─────────────────────────────────────────────────────────────── writes ─── */

export async function createOpsRef(
  companyId: number, kind: string, name: string, createdBy = "web-ui",
): Promise<WriteResult> {
  const clean = normaliseOpsRefName(kind, name);
  if (!clean) return { ok: false, error: "Give it a name." };

  const { data: last } = await sb
    .from("ops_refs").select("sort_order")
    .eq("company_id", companyId).eq("kind", kind)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await sb
    .from("ops_refs")
    .insert({
      company_id: companyId, kind, name: clean,
      sort_order: ((last?.sort_order as number | undefined) ?? 0) + 10,
      created_by: createdBy,
    })
    .select("id").single();

  if (error) {
    // 23505 = it is already on this list. Say which, or somebody hunts for it.
    if (error.code === "23505") return { ok: false, error: `“${clean}” is already on this list.` };
    console.error("[ops refs] create failed:", error.message);
    return { ok: false, error: error.message };
  }
  // The STORED name is returned, so a box that was typed in lower case shows
  // what was actually saved.
  return { ok: true, id: data?.id as number, name: clean };
}

/**
 * Rename, and move every order that named the old value across with it.
 *
 * Both halves, always. Renaming the list alone leaves the orders pointing at a
 * name that no longer exists on it.
 */
export async function renameOpsRef(id: number, name: string): Promise<WriteResult> {
  const { data: row } = await sb
    .from("ops_refs").select("company_id,kind,name").eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "That entry no longer exists." };

  const kind = row.kind as string;
  const companyId = row.company_id as number;
  const from = row.name as string;
  const to = normaliseOpsRefName(kind, name);
  if (!to) return { ok: false, error: "Give it a name." };
  if (to === from) return { ok: true, id };

  const { error } = await sb.from("ops_refs").update({ name: to }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: `“${to}” is already on this list.` };
    return { ok: false, error: error.message };
  }

  for (const target of POINTS_AT[kind] ?? []) {
    const { error: e } = await sb
      .from(target.table).update({ [target.column]: to })
      .eq("company_id", companyId).eq(target.column, from);
    if (e) console.error(`[ops refs] repoint ${target.table}.${target.column} failed:`, e.message);
  }
  return { ok: true, id, name: to };
}

/** Merge one entry into another, moving the orders across first. */
export async function mergeOpsRefs(fromId: number, intoId: number): Promise<WriteResult> {
  const { data: rows } = await sb
    .from("ops_refs").select("id,company_id,kind,name").in("id", [fromId, intoId]);
  const from = rows?.find((r) => r.id === fromId);
  const into = rows?.find((r) => r.id === intoId);
  if (!from || !into) return { ok: false, error: "One of those entries no longer exists." };
  if (from.kind !== into.kind) return { ok: false, error: "Those are on different lists." };

  for (const target of POINTS_AT[from.kind as string] ?? []) {
    const { error } = await sb
      .from(target.table).update({ [target.column]: into.name })
      .eq("company_id", from.company_id as number).eq(target.column, from.name as string);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await sb.from("ops_refs").delete().eq("id", fromId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: intoId, name: into.name as string };
}

/**
 * Delete — but only if nothing points at it, and say which happened.
 *
 * An entry with orders behind it is retired (`active = false`) so the old rows
 * keep meaning what they said.
 */
export async function deleteOpsRef(
  id: number,
): Promise<{ ok: true; retired: boolean } | { ok: false; error: string }> {
  const { data: row } = await sb
    .from("ops_refs").select("company_id,kind,name").eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "That entry no longer exists." };

  let inUse = 0;
  for (const target of POINTS_AT[row.kind as string] ?? []) {
    const { count } = await sb
      .from(target.table).select("id", { count: "exact", head: true })
      .eq("company_id", row.company_id as number).eq(target.column, row.name as string);
    inUse += count ?? 0;
  }

  if (inUse > 0) {
    const { error } = await sb.from("ops_refs").update({ active: false }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, retired: true };
  }
  const { error } = await sb.from("ops_refs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, retired: false };
}

/** Bring a retired entry back into the dropdowns. */
export async function restoreOpsRef(id: number): Promise<WriteResult> {
  const { error } = await sb.from("ops_refs").update({ active: true }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, id };
}

/**
 * The system's own vocabulary — statuses, modes, ageing bands — on request.
 *
 * ⚠️ Never called on create, only from a button. Skips anything already there,
 * so pressing it twice is harmless. It deliberately does NOT add clients,
 * suppliers, agents or origins: those are the owner's data, not ours.
 */
export async function seedOpsStarterLists(
  companyId: number,
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const existing = await listOpsRefs(companyId);
  const have = new Set(existing.map((r) => `${r.kind}::${r.name}`));

  const rows: Array<Record<string, unknown>> = [];
  for (const [kind, names] of Object.entries(OPS_STARTER_LISTS)) {
    names.forEach((raw, i) => {
      const name = normaliseOpsRefName(kind, raw);
      if (have.has(`${kind}::${name}`)) return;
      rows.push({ company_id: companyId, kind, name, sort_order: (i + 1) * 10 });
    });
  }
  if (rows.length === 0) return { ok: true, added: 0 };

  const { error } = await sb.from("ops_refs").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, added: rows.length };
}

/** Copy every list from another company — set one up properly, then reuse it. */
export async function copyOpsRefsFrom(
  intoCompanyId: number, fromCompanyId: number,
): Promise<{ ok: true; copied: number } | { ok: false; error: string }> {
  if (intoCompanyId === fromCompanyId) return { ok: false, error: "That is the same company." };
  const [source, existing] = await Promise.all([
    listOpsRefs(fromCompanyId), listOpsRefs(intoCompanyId),
  ]);
  const have = new Set(existing.map((r) => `${r.kind}::${r.name}`));
  const rows = source
    .filter((r) => r.active && !have.has(`${r.kind}::${r.name}`))
    .map((r) => ({
      company_id: intoCompanyId, kind: r.kind, name: r.name,
      note: r.note, sort_order: r.sortOrder,
    }));
  if (rows.length === 0) return { ok: true, copied: 0 };

  const { error } = await sb.from("ops_refs").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, copied: rows.length };
}
