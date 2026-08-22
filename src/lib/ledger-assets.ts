import { sb } from "@/db/supabase";
import { listAccounts, hasChart } from "@/lib/ledger-accounts";
import { postVoucher, unpostVoucher, voucherStateOf } from "@/lib/ledger-post";
import type { GlAccount } from "@/lib/ledger-shared";
import {
  depreciationFor, depreciationTo, type FixedAsset,
} from "@/lib/ledger-assets-shared";

/* ------------------------------------------------------------------ *
 * Fixed assets and depreciation — Stage 8, notes page 1 ("Assets ·
 * Depreciation"). The SERVER half.
 *
 * ⚠️ COMPANY-WIDE, NOT COCOZURI'S. Every one of the thirteen companies has
 * things to write down, so this lives in the ledger module and takes a
 * `companyId` like every other ledger function.
 *
 * ⚠️ NOTHING IS STORED THAT CAN BE WORKED OUT. There is no `accumulated` and no
 * `book value` column — both come from the cost, the life and how many months
 * the thing has been in use. The ledger's third rule.
 *
 * ⚠️ AND NOTHING HERE WRITES TO `gl_entries`. Depreciation goes through
 * `postVoucher()` like everything else: one voucher per company per month, filed
 * under a derived id so the same month can never be charged twice.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

export const DEPRECIATION_VOUCHER = "Depreciation";

/** ⚠️ ONE STRING LITERAL — a split one widens to `string` and supabase-js gives
 *  up on the row type. */
const ASSET_COLS = "id,company_id,name,category,acquired_on,cost,residual_value,useful_life_months,method,asset_account_id,accum_account_id,expense_account_id,disposed_on,disposal_proceeds,notes,status";

function toAsset(r: Record<string, unknown>): FixedAsset {
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    name: (r.name as string) ?? "",
    category: (r.category as string | null) ?? null,
    acquiredOn: r.acquired_on as string,
    cost: num(r.cost),
    residualValue: num(r.residual_value),
    usefulLifeMonths: num(r.useful_life_months),
    method: (r.method as string) ?? "straight_line",
    assetAccountId: (r.asset_account_id as number | null) ?? null,
    accumAccountId: (r.accum_account_id as number | null) ?? null,
    expenseAccountId: (r.expense_account_id as number | null) ?? null,
    disposedOn: (r.disposed_on as string | null) ?? null,
    disposalProceeds: r.disposal_proceeds == null ? null : num(r.disposal_proceeds),
    notes: (r.notes as string | null) ?? null,
    status: ((r.status as string) ?? "in_use") as FixedAsset["status"],
  };
}

/* ------------------------------- reading ------------------------------- */

export async function listAssets(companyId: number, opts?: { includeDisposed?: boolean }): Promise<FixedAsset[]> {
  let q = sb.from("fixed_assets").select(ASSET_COLS).eq("company_id", companyId);
  if (!opts?.includeDisposed) q = q.eq("status", "in_use");
  const { data, error } = await q.order("acquired_on", { ascending: false }).order("id", { ascending: false });
  // ⚠️ Said out loud — an empty register and a failed query look identical.
  if (error) {
    console.error("[ledger] listAssets failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => toAsset(r as Record<string, unknown>));
}

export async function getAsset(id: number): Promise<FixedAsset | null> {
  const { data } = await sb.from("fixed_assets").select(ASSET_COLS).eq("id", id).maybeSingle();
  return data ? toAsset(data as Record<string, unknown>) : null;
}

/* ------------------------------- writing ------------------------------- */

export type AssetInput = {
  name: string;
  category?: string | null;
  acquiredOn: string;
  cost: number;
  residualValue?: number;
  usefulLifeMonths: number;
  assetAccountId?: number | null;
  accumAccountId?: number | null;
  expenseAccountId?: number | null;
  notes?: string | null;
};

function validate(input: Partial<AssetInput>): string | null {
  if (input.name !== undefined && !input.name.trim()) return "An asset needs a name.";
  if (input.acquiredOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.acquiredOn)) {
    return "An asset needs the date it was bought.";
  }
  if (input.cost !== undefined && !(num(input.cost) > 0)) return "An asset needs what it cost.";
  if (input.usefulLifeMonths !== undefined && !(num(input.usefulLifeMonths) > 0)) {
    // ⚠️ Zero months would divide by nothing and charge the whole cost the day
    // it was bought, which is an expense, not an asset.
    return "Say how many months it is expected to last. Something with no life is an expense, not an asset.";
  }
  if (input.residualValue !== undefined && input.cost !== undefined
      && num(input.residualValue) >= num(input.cost)) {
    return "What it will be worth at the end has to be less than what it cost.";
  }
  return null;
}

export async function createAsset(
  companyId: number, input: AssetInput, by = "web-ui",
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const bad = validate(input);
  if (bad) return { ok: false, error: bad };
  const { data, error } = await sb.from("fixed_assets").insert({
    company_id: companyId,
    name: input.name.trim(),
    category: input.category?.trim() || null,
    acquired_on: input.acquiredOn,
    cost: num(input.cost),
    residual_value: num(input.residualValue),
    useful_life_months: Math.round(num(input.usefulLifeMonths)),
    asset_account_id: input.assetAccountId ?? null,
    accum_account_id: input.accumAccountId ?? null,
    expense_account_id: input.expenseAccountId ?? null,
    notes: input.notes?.trim() || null,
    created_by: by,
    updated_at: NOW(),
  }).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id as number };
}

export async function updateAsset(id: number, input: Partial<AssetInput>): Promise<{ ok: boolean; error?: string }> {
  const existing = await getAsset(id);
  if (!existing) return { ok: false, error: "That asset does not exist." };
  const bad = validate({ cost: existing.cost, ...input });
  if (bad) return { ok: false, error: bad };

  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (input.acquiredOn !== undefined) patch.acquired_on = input.acquiredOn;
  if (input.cost !== undefined) patch.cost = num(input.cost);
  if (input.residualValue !== undefined) patch.residual_value = num(input.residualValue);
  if (input.usefulLifeMonths !== undefined) patch.useful_life_months = Math.round(num(input.usefulLifeMonths));
  if (input.assetAccountId !== undefined) patch.asset_account_id = input.assetAccountId ?? null;
  if (input.accumAccountId !== undefined) patch.accum_account_id = input.accumAccountId ?? null;
  if (input.expenseAccountId !== undefined) patch.expense_account_id = input.expenseAccountId ?? null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { error } = await sb.from("fixed_assets").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * ⚠️ DISPOSING OF SOMETHING DOES NOT DELETE IT. The months it was in use really
 * happened and the depreciation charged for them is in the books; removing the
 * row would leave those postings pointing at nothing.
 */
export async function disposeAsset(
  id: number, on: string, proceeds: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const asset = await getAsset(id);
  if (!asset) return { ok: false, error: "That asset does not exist." };
  if (asset.status === "disposed") return { ok: false, error: `${asset.name} has already been disposed of.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return { ok: false, error: "Say when it went." };
  if (on < asset.acquiredOn) return { ok: false, error: "It cannot have gone before it was bought." };
  const { error } = await sb.from("fixed_assets").update({
    status: "disposed", disposed_on: on,
    disposal_proceeds: proceeds == null ? null : num(proceeds),
    updated_at: NOW(),
  }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ------------------------------ the books ------------------------------ */

const PPE_NUMBER = "1210";
const ACCUM_NUMBER = "1220";
const DEPN_NUMBER = "6600";

export type ResolveDepnResult =
  | { ok: true; accounts: { accum: number; expense: number }; all: GlAccount[] }
  | { ok: false; error: string; needsChart?: boolean };

/** ⚠️ Found by type, then by number, and it REFUSES rather than guesses. */
export async function resolveDepreciationAccounts(companyId: number): Promise<ResolveDepnResult> {
  if (!(await hasChart(companyId))) {
    return { ok: false, needsChart: true, error: "This company has no chart of accounts yet." };
  }
  const all = await listAccounts(companyId, { includeArchived: false });
  const accum =
    all.find((a) => !a.isGroup && a.accountType === "Accumulated Depreciation") ??
    all.find((a) => !a.isGroup && a.number === ACCUM_NUMBER) ?? null;
  const expense =
    all.find((a) => !a.isGroup && a.accountType === "Depreciation") ??
    all.find((a) => !a.isGroup && a.number === DEPN_NUMBER) ?? null;
  if (!accum) return { ok: false, error: `No accumulated-depreciation account (type "Accumulated Depreciation", or numbered ${ACCUM_NUMBER}).` };
  if (!expense) return { ok: false, error: `No depreciation expense account (type "Depreciation", or numbered ${DEPN_NUMBER}).` };
  return { ok: true, all, accounts: { accum: accum.id, expense: expense.id } };
}

/** `202608` — one voucher per company per month, so it can never post twice. */
export function depreciationVoucherId(year: number, month: number): number {
  return year * 100 + month;
}

export type DepreciationRun = {
  year: number;
  month: number;
  lines: { assetId: number; name: string; charge: number }[];
  total: number;
};

/** What one month's depreciation comes to, per asset. Derived, never stored. */
export async function depreciationRun(companyId: number, year: number, month: number): Promise<DepreciationRun> {
  const assets = await listAssets(companyId, { includeDisposed: true });
  const lines = assets
    .map((a) => ({ assetId: a.id, name: a.name, charge: depreciationFor(a, year, month) }))
    .filter((l) => l.charge > 0);
  return { year, month, lines, total: Math.round(lines.reduce((t, l) => t + l.charge, 0) * 100) / 100 };
}

/**
 * Charge one month's depreciation: **Dr 6600 Depreciation · Cr 1220 Accumulated.**
 *
 * ⚠️ A MONTH WITH NOTHING TO CHARGE IS NOT POSTED AT ALL. An empty voucher in
 * the books is a row somebody has to read and dismiss for ever.
 */
export async function postDepreciation(
  companyId: number, year: number, month: number, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const run = await depreciationRun(companyId, year, month);
  if (run.total <= 0) {
    return { ok: false, error: `Nothing was being depreciated in ${year}-${String(month).padStart(2, "0")}.` };
  }
  const res = await resolveDepreciationAccounts(companyId);
  if (!res.ok) return { ok: false, error: res.error };

  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return postVoucher({
    companyId,
    voucherType: DEPRECIATION_VOUCHER,
    voucherId: depreciationVoucherId(year, month),
    voucherNo: `DEP-${year}-${String(month).padStart(2, "0")}`,
    postingDate: `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
    lines: [
      { accountId: res.accounts.expense, debit: run.total, credit: 0, remarks: `${run.lines.length} asset${run.lines.length === 1 ? "" : "s"}` },
      { accountId: res.accounts.accum, debit: 0, credit: run.total },
    ],
    remarks: `Depreciation for ${year}-${String(month).padStart(2, "0")}`,
    createdBy: by,
    accounts: res.all,
  });
}

export async function unpostDepreciation(
  companyId: number, year: number, month: number, reason?: string | null, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  return unpostVoucher({
    companyId,
    voucherType: DEPRECIATION_VOUCHER,
    voucherId: depreciationVoucherId(year, month),
    reason: reason ?? null,
    createdBy: by,
  });
}

export async function depreciationState(companyId: number, year: number, month: number) {
  return voucherStateOf(companyId, DEPRECIATION_VOUCHER, depreciationVoucherId(year, month));
}

/** What the register is worth today — cost less everything written off so far. */
export async function registerValue(companyId: number, asOf: string): Promise<{
  cost: number; accumulated: number; bookValue: number; count: number;
}> {
  const assets = await listAssets(companyId, { includeDisposed: false });
  const cost = assets.reduce((t, a) => t + a.cost, 0);
  const accumulated = assets.reduce((t, a) => t + depreciationTo(a, asOf), 0);
  return {
    cost: round2(cost),
    accumulated: round2(accumulated),
    bookValue: round2(cost - accumulated),
    count: assets.length,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The PPE account, for a screen that wants to name where an asset sits. */
export async function ppeAccount(companyId: number): Promise<GlAccount | null> {
  const all = await listAccounts(companyId, { includeArchived: false });
  return all.find((a) => !a.isGroup && a.number === PPE_NUMBER) ?? null;
}
