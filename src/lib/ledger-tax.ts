// ─────────────────────────────────────────────────────────────────────────────
// TAX — the reader, the writer and the adapters (SERVER-ONLY, imports `sb`).
// Phase 3.
//
// ⚠️ Client components import `ledger-tax-shared.ts`, never this file.
//
// Two jobs:
//   1. Manage the `tax_rates` list — the rates a company actually uses.
//   2. **Adapters**: turn the ops documents into the neutral `TaxLine` shape
//      that `vatReturn()` adds up.
//
// ⚠️ WHY THE ADAPTERS EXIST, AND WHAT HAPPENS TO THEM IN PHASE 5.
// Nothing posts to the ledger yet, so the return is built from the DOCUMENTS —
// the invoices, purchases and imports. Once Phase 5 has those documents posting
// themselves, the same return should be built from `gl_entries` instead, by
// writing one more adapter here. **The arithmetic does not change**: `vatReturn`
// takes a list and knows nothing about where it came from, which is exactly why
// it was built that way. Until then this is the one source, and it must not be
// duplicated — two ways of totting up VAT is two answers.
// ─────────────────────────────────────────────────────────────────────────────

import { sb, fetchAllRows } from "@/db/supabase";
import { toTzs } from "@/lib/ops-orders-shared";
import { defaultAccount } from "@/lib/ledger-accounts";
import { num, round2 } from "@/lib/ledger-shared";
import {
  TZ_STANDARD_VAT_PERCENT, splitTax, withholding,
  type TaxLine, type TaxRate, type TaxTreatment, type WhtLine,
} from "@/lib/ledger-tax-shared";

export type WriteResult = { ok: true; id?: number } | { ok: false; error: string };

// ⚠️ One string literal on one line — a split one widens to `string` and
// supabase-js gives up on the row type.
const COLS = "id,company_id,name,kind,percent,applies_to,treatment,account_id,is_default,confirmed,notes,archived,created_by,created_at,updated_at";

function mapRate(r: Record<string, unknown>): TaxRate {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    name: (r.name as string) ?? "",
    kind: (r.kind as string) ?? "VAT",
    percent: s("percent"),
    appliesTo: (r.applies_to as string) ?? "both",
    treatment: (r.treatment as string) ?? "standard",
    accountId: (r.account_id as number | null) ?? null,
    isDefault: Boolean(r.is_default),
    confirmed: Boolean(r.confirmed),
    notes: s("notes"),
    archived: Boolean(r.archived),
  };
}

/* ────────────────────────────────────────────────────────────── reading ─── */

export async function listTaxRates(
  companyId: number, opts: { includeArchived?: boolean; kind?: string } = {},
): Promise<TaxRate[]> {
  const rows = await fetchAllRows((from, to) => {
    let q = sb.from("tax_rates").select(COLS).eq("company_id", companyId);
    if (!opts.includeArchived) q = q.eq("archived", false);
    if (opts.kind) q = q.eq("kind", opts.kind);
    return q.order("kind").order("name").range(from, to);
  });
  return rows.map((r) => mapRate(r as Record<string, unknown>));
}

export async function getTaxRate(id: number): Promise<TaxRate | null> {
  const { data } = await sb.from("tax_rates").select(COLS).eq("id", id).maybeSingle();
  return data ? mapRate(data as Record<string, unknown>) : null;
}

export async function hasTaxRates(companyId: number): Promise<boolean> {
  const { count } = await sb.from("tax_rates")
    .select("id", { count: "exact", head: true }).eq("company_id", companyId);
  return (count ?? 0) > 0;
}

/* ────────────────────────────────────────────────────────────── seeding ─── */

/**
 * The starting list.
 *
 * ⚠️ **ONLY THE STANDARD VAT RATE IS MARKED CONFIRMED.** It is statutory and
 * public. Everything else arrives `confirmed: false` with a note saying what to
 * check and who to ask, because which supplies are zero-rated, which are exempt
 * and what withholding applies to whom are genuinely questions for whoever
 * files the returns — and the plan says in as many words not to guess them.
 *
 * The withholding rates DO carry the commonly quoted figures rather than zero.
 * A rate of 0 would silently withhold nothing, which is a worse failure than a
 * flagged number somebody has to confirm.
 */
const SEED: Array<Omit<TaxRate, "id" | "companyId" | "archived" | "accountId"> & { role?: string }> = [
  {
    name: `VAT on sales — standard ${TZ_STANDARD_VAT_PERCENT}%`,
    kind: "VAT", percent: String(TZ_STANDARD_VAT_PERCENT), appliesTo: "sales",
    treatment: "standard", isDefault: true, confirmed: true, role: "vat_output",
    notes: "The statutory standard rate. Charged on what we sell.",
  },
  {
    name: `VAT on purchases — standard ${TZ_STANDARD_VAT_PERCENT}%`,
    kind: "VAT", percent: String(TZ_STANDARD_VAT_PERCENT), appliesTo: "purchases",
    treatment: "standard", isDefault: true, confirmed: true, role: "vat_input",
    notes: "The statutory standard rate. Paid on what we buy, and recoverable against the VAT we charge.",
  },
  {
    name: "Zero-rated",
    kind: "VAT", percent: "0", appliesTo: "both", treatment: "zero_rated",
    isDefault: false, confirmed: false, role: "vat_output",
    notes: "⚠️ CONFIRM which supplies qualify. Zero-rated is TAXABLE at 0% and counts in taxable turnover — it is not the same as exempt.",
  },
  {
    name: "Exempt",
    kind: "VAT", percent: "0", appliesTo: "both", treatment: "exempt",
    isDefault: false, confirmed: false,
    notes: "⚠️ CONFIRM which supplies qualify. Exempt supplies sit outside VAT and do NOT count in taxable turnover.",
  },
  {
    name: "Withholding — rent",
    kind: "WHT", percent: "10", appliesTo: "purchases", treatment: "standard",
    isDefault: false, confirmed: false, role: "wht",
    notes: "⚠️ Commonly quoted Tanzanian rate. CONFIRM with whoever files the returns before relying on it.",
  },
  {
    name: "Withholding — professional and service fees (resident)",
    kind: "WHT", percent: "5", appliesTo: "purchases", treatment: "standard",
    isDefault: false, confirmed: false, role: "wht",
    notes: "⚠️ Commonly quoted Tanzanian rate. CONFIRM with whoever files the returns before relying on it.",
  },
  {
    name: "Withholding — services (non-resident)",
    kind: "WHT", percent: "15", appliesTo: "purchases", treatment: "standard",
    isDefault: false, confirmed: false, role: "wht",
    notes: "⚠️ Commonly quoted Tanzanian rate, and residency decides it. CONFIRM before relying on it.",
  },
  {
    name: "Withholding — goods supplied to specified payers",
    kind: "WHT", percent: "2", appliesTo: "purchases", treatment: "standard",
    isDefault: false, confirmed: false, role: "wht",
    notes: "⚠️ Commonly quoted Tanzanian rate, and it only applies to certain payers. CONFIRM before relying on it.",
  },
];

export type SeedResult = { ok: true; added: number } | { ok: false; error: string };

/**
 * Give a company its starting tax rates.
 *
 * ⚠️ A TOP-UP, NOT A RESET — the same rule as the chart of accounts seeder. It
 * adds only names the company does not already have and touches nothing that
 * exists, so it can never undo a correction somebody made on purpose.
 */
export async function seedTaxRates(companyId: number, createdBy = "web-ui"): Promise<SeedResult> {
  const existing = await listTaxRates(companyId, { includeArchived: true });
  const have = new Set(existing.map((r) => r.name));
  const missing = SEED.filter((r) => !have.has(r.name));
  if (missing.length === 0) return { ok: true, added: 0 };

  // Point each rate at the account it will post to in Phase 5, if the chart has
  // one. ⚠️ Null is fine — a rate without an account still computes, it just
  // cannot post yet.
  const roles = [...new Set(missing.map((r) => r.role).filter(Boolean))] as string[];
  const accountByRole = new Map<string, number>();
  for (const role of roles) {
    const acc = await defaultAccount(companyId, role);
    if (acc) accountByRole.set(role, acc.id);
  }

  const payload = missing.map((r) => ({
    company_id: companyId,
    name: r.name,
    kind: r.kind,
    percent: r.percent,
    applies_to: r.appliesTo,
    treatment: r.treatment,
    account_id: r.role ? accountByRole.get(r.role) ?? null : null,
    is_default: r.isDefault,
    confirmed: r.confirmed,
    notes: r.notes,
    created_by: createdBy,
  }));

  const { error } = await sb.from("tax_rates").insert(payload);
  if (error) return { ok: false, error: error.message };
  return { ok: true, added: payload.length };
}

/* ────────────────────────────────────────────────────────────── writing ─── */

export type TaxRateFields = {
  companyId: number;
  name: string;
  kind?: string;
  percent?: string | number | null;
  appliesTo?: string;
  treatment?: string;
  accountId?: number | null;
  isDefault?: boolean;
  confirmed?: boolean;
  notes?: string | null;
  createdBy?: string;
};

function validate(f: Partial<TaxRateFields>): string | null {
  if (f.name !== undefined && !f.name.trim()) return "A rate needs a name.";
  if (f.percent !== undefined && f.percent !== null && f.percent !== "") {
    const p = num(f.percent as string);
    if (p === null) return "That rate is not a number.";
    if (p < 0) return "A tax rate cannot be negative.";
    // ⚠️ Not a legal limit — a sanity rail. Somebody typing 1800 meaning 18.00
    // would otherwise raise a tax bill a hundred times too big.
    if (p > 100) return "That rate is over 100% — check whether you meant a percentage.";
  }
  return null;
}

export async function createTaxRate(f: TaxRateFields): Promise<WriteResult> {
  const bad = validate(f);
  if (bad) return { ok: false, error: bad };

  const { data, error } = await sb.from("tax_rates").insert({
    company_id: f.companyId,
    name: f.name.trim(),
    kind: f.kind ?? "VAT",
    percent: String(num(f.percent as string) ?? 0),
    applies_to: f.appliesTo ?? "both",
    treatment: f.treatment ?? "standard",
    account_id: f.accountId ?? null,
    is_default: f.isDefault ?? false,
    confirmed: f.confirmed ?? false,
    notes: f.notes?.trim() || null,
    created_by: f.createdBy ?? "web-ui",
  }).select("id").maybeSingle();

  if (error) return { ok: false, error: friendly(error.message) };
  const id = (data as { id: number } | null)?.id;
  if (id && f.isDefault) await clearOtherDefaults(f.companyId, id, f.kind ?? "VAT", f.appliesTo ?? "both");
  return { ok: true, id };
}

export async function updateTaxRate(id: number, patch: Partial<TaxRateFields>): Promise<WriteResult> {
  const bad = validate(patch);
  if (bad) return { ok: false, error: bad };

  const current = await getTaxRate(id);
  if (!current) return { ok: false, error: "That rate no longer exists." };

  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.percent !== undefined) set.percent = String(num(patch.percent as string) ?? 0);
  if (patch.appliesTo !== undefined) set.applies_to = patch.appliesTo;
  if (patch.treatment !== undefined) set.treatment = patch.treatment;
  if (patch.accountId !== undefined) set.account_id = patch.accountId;
  if (patch.isDefault !== undefined) set.is_default = patch.isDefault;
  if (patch.confirmed !== undefined) set.confirmed = patch.confirmed;
  if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;

  const { error } = await sb.from("tax_rates").update(set).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };

  if (patch.isDefault) {
    await clearOtherDefaults(current.companyId, id, patch.kind ?? current.kind, patch.appliesTo ?? current.appliesTo);
  }
  return { ok: true, id };
}

/** Only one default per kind and side, or a new document has two answers. */
async function clearOtherDefaults(companyId: number, keepId: number, kind: string, appliesTo: string): Promise<void> {
  await sb.from("tax_rates")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("company_id", companyId).eq("kind", kind).eq("applies_to", appliesTo).neq("id", keepId);
}

export async function archiveTaxRate(id: number, archived: boolean): Promise<WriteResult> {
  const { error } = await sb.from("tax_rates")
    .update({ archived, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, id };
}

/**
 * Delete a rate outright.
 *
 * ⚠️ Only ever a typo-eraser, and only while nothing has used it. A document
 * keeps its own frozen `tax_percent`, so deleting a rate would not change any
 * figure — but it WOULD lose the name the return groups by, so a rate in use is
 * archived rather than removed.
 */
export async function deleteTaxRate(id: number): Promise<WriteResult> {
  const used = await rateUsage(id);
  if (used > 0) {
    return { ok: false, error: `This rate is used on ${used} document${used === 1 ? "" : "s"} and cannot be deleted. Archive it instead.` };
  }
  const { error } = await sb.from("tax_rates").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, id };
}

/** How many documents point at this rate. */
export async function rateUsage(id: number): Promise<number> {
  const counts = await Promise.all([
    sb.from("ops_invoices").select("id", { count: "exact", head: true }).eq("tax_rate_id", id),
    sb.from("ops_order_lines").select("id", { count: "exact", head: true }).eq("purchase_tax_rate_id", id),
    sb.from("ops_payments").select("id", { count: "exact", head: true }).eq("wht_rate_id", id),
  ]);
  return counts.reduce((t, c) => t + (c.count ?? 0), 0);
}

function friendly(message: string): string {
  if (message.includes("tax_rates_name_unique")) return "A rate with that name already exists in this company.";
  return message;
}

/* ══════════════════════════════════════════════════════════ the adapters ═══ */

const treatmentOf = (v: string | null | undefined): TaxTreatment =>
  v === "zero_rated" || v === "exempt" ? v : "standard";

export type TaxPeriod = { from?: string | null; to?: string | null };

function inWindow(date: string | null, p: TaxPeriod): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  if (p.from && d < p.from) return false;
  if (p.to && d > p.to) return false;
  return true;
}

/**
 * **Every taxable thing in a period, from the ops documents.**
 *
 * Three sources, and each one is honest about what it does not know:
 *
 *   · **Sales** — `ops_invoices`. Net and tax split from the invoice value using
 *     the frozen percent and the inclusive flag. An invoice with no rate, or a
 *     foreign one with no exchange rate, comes back **unknown** rather than nil.
 *   · **Purchases** — `ops_order_lines`, on the purchase side of the line.
 *   · **Imports** — `ops_shipments.vat_amount`, the VAT paid at customs.
 *     ⚠️ The customs VALUE is not recorded anywhere, so the net is reported as
 *     nil while the TAX is exact. The return's payable figure is therefore
 *     right and its input-net understates; the screen says so. ⚠️ Whether import
 *     VAT is recoverable at all is one of the questions still to be confirmed,
 *     so these lines are marked unconfirmed.
 */
export async function taxLinesFromDocuments(companyId: number, p: TaxPeriod = {}): Promise<TaxLine[]> {
  const rates = await listTaxRates(companyId, { includeArchived: true });
  const byId = new Map(rates.map((r) => [r.id, r]));
  const out: TaxLine[] = [];

  /* ── sales ─────────────────────────────────────────────────────────────── */
  const invoices = await fetchAllRows((from, to) =>
    sb.from("ops_invoices")
      .select("id,invoice_no,invoice_date,invoice_value,invoice_currency,ex_rate,client,tax_rate_id,tax_percent,tax_inclusive,archived")
      .eq("company_id", companyId).eq("archived", false).range(from, to));

  for (const row of invoices as Array<Record<string, unknown>>) {
    const date = (row.invoice_date as string | null) ?? null;
    if (!inWindow(date, p)) continue;
    const rate = row.tax_rate_id ? byId.get(row.tax_rate_id as number) : undefined;

    // ⚠️ Into shillings FIRST, at the rate frozen on the invoice. A foreign
    // invoice with no rate becomes null here and is reported as unknown.
    const base = toTzs(
      num(row.invoice_value as string),
      (row.invoice_currency as string | null),
      num(row.ex_rate as string),
    );
    const split = splitTax(base, row.tax_percent as string | null, row.tax_inclusive as boolean | null);

    out.push({
      side: "output",
      treatment: treatmentOf(rate?.treatment),
      net: split ? split.net : null,
      tax: split ? split.tax : null,
      date,
      source: `Invoice ${(row.invoice_no as string) || `#${row.id}`}`,
      party: (row.client as string | null) ?? null,
      rateName: rate?.name ?? null,
      confirmed: rate?.confirmed ?? false,
    });
  }

  /* ── purchases ─────────────────────────────────────────────────────────── */
  const lines = await fetchAllRows((from, to) =>
    sb.from("ops_order_lines")
      .select("id,po_no,description,supplier,purchase_date,purchase_qty,purchase_unit_price,purchase_currency,ex_rate,purchase_tax_rate_id,purchase_tax_percent,purchase_tax_inclusive,archived")
      .eq("company_id", companyId).eq("archived", false).range(from, to));

  for (const row of lines as Array<Record<string, unknown>>) {
    // ⚠️ Only lines that actually carry a purchase tax rate. Without this every
    // untaxed line in the book would land in the return as an unknown and bury
    // the ones that genuinely need looking at.
    if (row.purchase_tax_rate_id === null || row.purchase_tax_rate_id === undefined) continue;
    const date = (row.purchase_date as string | null) ?? null;
    if (!inWindow(date, p)) continue;
    const rate = byId.get(row.purchase_tax_rate_id as number);

    const qty = num(row.purchase_qty as string);
    const price = num(row.purchase_unit_price as string);
    const value = qty !== null && price !== null ? round2(qty * price) : null;
    const base = toTzs(value, (row.purchase_currency as string | null), num(row.ex_rate as string));
    const split = splitTax(base, row.purchase_tax_percent as string | null, row.purchase_tax_inclusive as boolean | null);

    out.push({
      side: "input",
      treatment: treatmentOf(rate?.treatment),
      net: split ? split.net : null,
      tax: split ? split.tax : null,
      date,
      source: `Purchase ${(row.po_no as string) || `line #${row.id}`}`,
      party: (row.supplier as string | null) ?? null,
      rateName: rate?.name ?? null,
      confirmed: rate?.confirmed ?? false,
    });
  }

  /* ── imports ───────────────────────────────────────────────────────────── */
  const shipments = await fetchAllRows((from, to) =>
    sb.from("ops_shipments")
      .select("id,bl_no,vat_amount,cost_currency,ex_rate,assessment_date,cleared_date,bl_date,supplier,archived")
      .eq("company_id", companyId).eq("archived", false).range(from, to));

  for (const row of shipments as Array<Record<string, unknown>>) {
    const vat = num(row.vat_amount as string);
    if (vat === null || vat === 0) continue;
    // The tax point for import VAT is when customs assessed it; fall back
    // through the dates the shipment actually has.
    const date = ((row.assessment_date ?? row.cleared_date ?? row.bl_date) as string | null) ?? null;
    if (!inWindow(date, p)) continue;

    const tax = toTzs(vat, (row.cost_currency as string | null), num(row.ex_rate as string));
    out.push({
      side: "input",
      treatment: "standard",
      // ⚠️ The customs value is not recorded anywhere in the system, so the net
      // is nil and only the tax is exact. Reported, not guessed.
      net: tax === null ? null : 0,
      tax,
      date,
      source: `Import ${(row.bl_no as string) || `#${row.id}`} — VAT at customs`,
      party: (row.supplier as string | null) ?? null,
      rateName: "Import VAT (paid at customs)",
      // ⚠️ Whether import VAT is recoverable here is still to be confirmed.
      confirmed: false,
    });
  }

  return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

/** What was withheld from suppliers in a period. */
export async function whtLinesFromPayments(companyId: number, p: TaxPeriod = {}): Promise<WhtLine[]> {
  const rates = await listTaxRates(companyId, { includeArchived: true });
  const byId = new Map(rates.map((r) => [r.id, r]));

  const payments = await fetchAllRows((from, to) =>
    sb.from("ops_payments")
      .select("id,payee,paid_date,reference,currency,ex_rate,wht_rate_id,wht_percent,wht_base,archived")
      .eq("company_id", companyId).eq("archived", false).range(from, to));

  const out: WhtLine[] = [];
  for (const row of payments as Array<Record<string, unknown>>) {
    if (row.wht_rate_id === null || row.wht_rate_id === undefined) continue;
    const date = (row.paid_date as string | null) ?? null;
    if (!inWindow(date, p)) continue;
    const rate = byId.get(row.wht_rate_id as number);

    const base = toTzs(num(row.wht_base as string), (row.currency as string | null), num(row.ex_rate as string));
    const w = withholding(base, row.wht_percent as string | null);

    out.push({
      base: w ? w.base : null,
      tax: w ? w.tax : null,
      date,
      source: `Payment ${(row.reference as string) || `#${row.id}`}`,
      party: (row.payee as string | null) ?? null,
      rateName: rate?.name ?? null,
      confirmed: rate?.confirmed ?? false,
    });
  }
  return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}
