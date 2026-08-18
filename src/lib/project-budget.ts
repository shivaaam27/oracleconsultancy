// ─────────────────────────────────────────────────────────────────────────────
// PROJECT BUDGET — the Bill of Quantities (Phase 2).
//
// ⚠️ SERVER-ONLY (imports `sb`). The client half is `project-budget-shared.ts`.
//
// This is the sheet everything else is measured against. Once a project has a
// budget, the profit figures on the record stop reading "needs the budget" and
// come alive — that is the whole point of Phase 2.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
import { num } from "@/lib/projects-shared";
import { normaliseCode, type BudgetLine } from "@/lib/project-budget-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ One string literal on one line — see the note in lib/projects.ts.
const COLS = "id,project_id,item_code,category,sub_job,description,amount,qty,unit,sort_order,notes,created_by,created_at,updated_at";

function mapRow(r: Record<string, unknown>): BudgetLine {
  return {
    id: r.id as number,
    projectId: r.project_id as number,
    itemCode: r.item_code as string,
    category: r.category as string,
    subJob: (r.sub_job as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    amount: (r.amount as string | null) ?? "0",
    // Present, deliberately unread — see the schema note.
    qty: (r.qty as string | null) ?? null,
    unit: (r.unit as string | null) ?? null,
    sortOrder: (r.sort_order as number | null) ?? 0,
    notes: (r.notes as string | null) ?? null,
  };
}

/** Every budget line for a project, in the builder's order. */
export async function listBudgetLines(projectId: number): Promise<BudgetLine[]> {
  const { data } = await sb
    .from("project_budget_lines")
    .select(COLS)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/**
 * The budget total — the workbook's `BUDGET DATA!C262`, 146,801,556 on Patamela.
 *
 * Summed from the lines on every read rather than stored on the project. A
 * stored total is a second copy of a fact, and the moment someone edits a line
 * without the total being recalculated the two disagree — which is exactly the
 * class of fault that put SAND's budget on the MEALS sheet.
 *
 * Returns **null**, not 0, when a project has no lines at all. "No budget yet"
 * and "a budget of nothing" are different things and must look different: zero
 * would render as a 100% profit margin on the record.
 */
export async function budgetTotal(projectId: number): Promise<number | null> {
  const { data } = await sb
    .from("project_budget_lines")
    .select("amount")
    .eq("project_id", projectId);
  if (!data || data.length === 0) return null;
  return data.reduce((sum, r) => sum + (num(r.amount as string) ?? 0), 0);
}

/** Budget totals for many projects at once — one query for the whole list. */
export async function budgetTotals(projectIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (projectIds.length === 0) return out;
  const { data } = await sb
    .from("project_budget_lines")
    .select("project_id,amount")
    .in("project_id", projectIds);
  for (const r of data ?? []) {
    const id = r.project_id as number;
    out.set(id, (out.get(id) ?? 0) + (num(r.amount as string) ?? 0));
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────── writes ─── */

export type BudgetLineFields = {
  projectId: number;
  itemCode: string;
  category: string;
  subJob?: string | null;
  description?: string | null;
  amount?: string | number | null;
  notes?: string | null;
};

function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Tolerates "175,000" and "175 000.50" — what people actually type. */
function amountOf(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "0";
  const cleaned = typeof v === "string" ? v.replace(/[\s,]/g, "") : String(v);
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : "0";
}

export async function addBudgetLine(f: BudgetLineFields, createdBy = "web-ui"): Promise<WriteResult> {
  const itemCode = normaliseCode(f.itemCode);
  if (!itemCode) return { ok: false, error: "Give the line an item code." };
  const category = normaliseCode(f.category);
  if (!category) return { ok: false, error: "Give the line a category." };

  // Next in the builder's order, so typed lines keep the order they were entered.
  const { data: last } = await sb
    .from("project_budget_lines")
    .select("sort_order")
    .eq("project_id", f.projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = {
    project_id: f.projectId,
    item_code: itemCode,
    category,
    sub_job: text(f.subJob),
    description: text(f.description),
    amount: amountOf(f.amount),
    notes: text(f.notes),
    sort_order: ((last?.sort_order as number | undefined) ?? 0) + 10,
    created_by: createdBy,
  };

  const { data, error } = await sb.from("project_budget_lines").insert(row).select("id").single();
  if (error) {
    console.error("[budget] add failed:", error.message, row);
    // 23505 = unique violation. Say WHICH code clashed; "couldn't save" sends
    // someone hunting through 270 lines.
    if (error.code === "23505") {
      return { ok: false, error: `“${itemCode}” is already on this budget. Edit that line instead.` };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id as number };
}

export async function updateBudgetLine(id: number, patch: Partial<BudgetLineFields>): Promise<WriteResult> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.itemCode !== undefined) row.item_code = normaliseCode(patch.itemCode);
  if (patch.category !== undefined) row.category = normaliseCode(patch.category);
  if (patch.subJob !== undefined) row.sub_job = text(patch.subJob);
  if (patch.description !== undefined) row.description = text(patch.description);
  if (patch.amount !== undefined) row.amount = amountOf(patch.amount);
  if (patch.notes !== undefined) row.notes = text(patch.notes);

  const { error } = await sb.from("project_budget_lines").update(row).eq("id", id);
  if (error) {
    console.error("[budget] update failed:", error.message, row);
    if (error.code === "23505") return { ok: false, error: "Another line on this project already has that item code." };
    return { ok: false, error: error.message };
  }
  return { ok: true, id };
}

/**
 * A budget line IS deleted, not archived — the one place in COS where that is
 * right. Until the requisitions of Phase 3 exist, a line has no history to
 * lose: it is a mis-typed row in a list being entered by hand, and leaving 270
 * archived mistakes lying about would make the budget unreadable.
 *
 * ⚠️ Revisit this in Phase 3. Once requisitions point at an item code, deleting
 * the line they refer to must be refused, not silently allowed.
 */
export async function deleteBudgetLine(id: number): Promise<WriteResult> {
  const { error } = await sb.from("project_budget_lines").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, id };
}
