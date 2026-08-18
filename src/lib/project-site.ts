// Site people and their days — server half (Phase 6).
// ⚠️ SERVER-ONLY (imports `sb`). Client half: project-site-shared.ts.

import { sb } from "@/db/supabase";
import type { SitePerson, SiteDay } from "@/lib/project-site-shared";
import type { PaymentStage } from "@/lib/project-snapshot-shared";
import { DEFAULT_STAGES } from "@/lib/project-snapshot-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ One string literal on one line — see the note in lib/projects.ts.
const PEOPLE_COLS = "id,project_id,name,designation,kind,daily_rate,phone,meals_eligible,active,sort_order";
const DAYS_COLS = "id,person_id,day,meal,labour_amount";
const STAGE_COLS = "id,project_id,label,threshold_pct,share_pct,amount,invoice_date,invoice_amount,received_date,amount_received,sort_order,notes";

function text(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}
function amount(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = typeof v === "string" ? v.replace(/[\s,]/g, "") : String(v);
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}

/* ─────────────────────────────────────────────────────────── site people ─── */

export async function listSitePeople(projectId: number): Promise<SitePerson[]> {
  const { data } = await sb
    .from("project_site_people").select(PEOPLE_COLS).eq("project_id", projectId)
    .order("sort_order", { ascending: true }).order("id", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as number,
    projectId: r.project_id as number,
    name: r.name as string,
    designation: (r.designation as string | null) ?? null,
    kind: (r.kind as string) ?? "CASUAL LABOUR",
    dailyRate: (r.daily_rate as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    mealsEligible: Boolean(r.meals_eligible),
    active: Boolean(r.active),
    sortOrder: (r.sort_order as number | null) ?? 0,
  }));
}

export async function addSitePerson(f: {
  projectId: number; name: string; designation?: string | null;
  kind?: string | null; dailyRate?: string | number | null;
  phone?: string | null; mealsEligible?: boolean;
}): Promise<WriteResult> {
  if (!f.name?.trim()) return { ok: false, error: "Give the person a name." };
  const { data: last } = await sb
    .from("project_site_people").select("sort_order").eq("project_id", f.projectId)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const row = {
    project_id: f.projectId,
    name: f.name.trim(),
    designation: text(f.designation),
    kind: text(f.kind) ?? "CASUAL LABOUR",
    daily_rate: amount(f.dailyRate),
    phone: text(f.phone),
    meals_eligible: f.mealsEligible ?? true,
    sort_order: ((last?.sort_order as number | undefined) ?? 0) + 10,
  };
  const { data, error } = await sb.from("project_site_people").insert(row).select("id").single();
  if (error) {
    console.error("[site people] create failed:", error.message, row);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id as number };
}

export async function setSitePersonActive(id: number, active: boolean): Promise<WriteResult> {
  const { error } = await sb.from("project_site_people").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, id };
}

/* ─────────────────────────────────────────────────────────────── the days ── */

export async function listSiteDays(projectId: number, from?: string, to?: string): Promise<SiteDay[]> {
  let q = sb.from("project_site_days").select(DAYS_COLS).eq("project_id", projectId);
  if (from) q = q.gte("day", from);
  if (to) q = q.lte("day", to);
  const { data } = await q.order("day", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as number,
    personId: r.person_id as number,
    day: String(r.day).slice(0, 10),
    meal: Boolean(r.meal),
    labourAmount: (r.labour_amount as string | null) ?? null,
  }));
}

/**
 * Mark one square of the grid.
 *
 * ⚠️ Upsert on (person_id, day), which the unique index makes safe. Painting a
 * grid means the same square gets hit repeatedly — a plain insert would either
 * fail or quietly create a second row for the same day, and the totals would
 * then double-count.
 */
export async function setSiteDay(f: {
  projectId: number; personId: number; day: string;
  meal?: boolean; labourAmount?: string | number | null;
}): Promise<WriteResult> {
  const patch: Record<string, unknown> = {
    project_id: f.projectId, person_id: f.personId, day: f.day,
    updated_at: new Date().toISOString(),
  };
  if (f.meal !== undefined) patch.meal = f.meal;
  if (f.labourAmount !== undefined) patch.labour_amount = amount(f.labourAmount);

  const { error } = await sb
    .from("project_site_days")
    .upsert(patch, { onConflict: "person_id,day" });
  if (error) {
    console.error("[site days] upsert failed:", error.message, patch);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/* ────────────────────────────────────────────────────── payment stages ───── */

export async function listPaymentStages(projectId: number): Promise<PaymentStage[]> {
  const { data } = await sb
    .from("project_payment_stages").select(STAGE_COLS).eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as number,
    label: r.label as string,
    thresholdPct: (r.threshold_pct as string | null) ?? null,
    sharePct: (r.share_pct as string | null) ?? null,
    amount: (r.amount as string | null) ?? null,
    invoiceDate: (r.invoice_date as string | null) ?? null,
    invoiceAmount: (r.invoice_amount as string | null) ?? null,
    receivedDate: (r.received_date as string | null) ?? null,
    amountReceived: (r.amount_received as string | null) ?? null,
    sortOrder: (r.sort_order as number | null) ?? 0,
    notes: (r.notes as string | null) ?? null,
  }));
}

/**
 * Lay out the standard 30/25/25/20 plan.
 *
 * ⚠️ Only ever called from a button the owner presses, never automatically —
 * these are the workbook's stages, not necessarily this contract's, and a plan
 * that appeared by itself would be a figure nobody chose.
 */
export async function seedDefaultStages(
  projectId: number,
): Promise<{ ok: true; stages: PaymentStage[] } | { ok: false; error: string }> {
  const existing = await listPaymentStages(projectId);
  if (existing.length > 0) return { ok: false, error: "This project already has a payment plan." };
  const rows = DEFAULT_STAGES.map((s, i) => ({
    project_id: projectId, label: s.label,
    threshold_pct: String(s.thresholdPct), share_pct: String(s.sharePct),
    sort_order: (i + 1) * 10,
  }));
  const { error } = await sb.from("project_payment_stages").insert(rows);
  if (error) return { ok: false, error: error.message };
  // ⚠️ The created rows are RETURNED, not just written. The screen owns its list
  // (see project-budget-sheet.tsx) so a `router.refresh()` alone leaves it
  // showing "no payment plan" while the plan sits in the database — which is
  // exactly what happened the first time this was demoed.
  return { ok: true, stages: await listPaymentStages(projectId) };
}

export async function updatePaymentStage(id: number, patch: {
  label?: string; amount?: string | number | null;
  invoiceDate?: string | null; invoiceAmount?: string | number | null;
  receivedDate?: string | null; amountReceived?: string | number | null;
}): Promise<WriteResult> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.amount !== undefined) row.amount = amount(patch.amount);
  if (patch.invoiceDate !== undefined) row.invoice_date = text(patch.invoiceDate);
  if (patch.invoiceAmount !== undefined) row.invoice_amount = amount(patch.invoiceAmount);
  if (patch.receivedDate !== undefined) row.received_date = text(patch.receivedDate);
  if (patch.amountReceived !== undefined) row.amount_received = amount(patch.amountReceived);
  const { error } = await sb.from("project_payment_stages").update(row).eq("id", id);
  if (error) {
    console.error("[stages] update failed:", error.message, row);
    return { ok: false, error: error.message };
  }
  return { ok: true, id };
}
