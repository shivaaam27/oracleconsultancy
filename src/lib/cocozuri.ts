import { sb } from "@/db/supabase";
import { todayInDar } from "@/lib/cocozuri-stock-shared";
import { recordEvent } from "@/lib/cocozuri-events";
import {
  ageingSummary, customerAccounts, nextInSeries, outstandingOf, statementRows,
  type CzAgeingKey, type CzCustomer, type CzCustomerAccount, type CzInvoice,
  type CzInvoiceLine, type CzOutstanding, type CzPrice, type CzProduct,
  type CzReceipt, type CzStatementRow,
} from "@/lib/cocozuri-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri Operations — the SERVER half. Phase 1: catalogue and customers.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE. It pulls in `sb`, which drags
 * @/db/supabase into the browser bundle and kills every page with
 * "SUPABASE_SERVICE_ROLE_KEY is not set". The client-safe twin is
 * `cocozuri-shared.ts`.
 *
 * ⚠️ ONE DOOR FOR WRITES. The `create*` / `update*` / `archive*` functions below
 * are the only things that write these tables; the server actions in
 * `app/cocozuri/actions.ts` are thin wrappers over them. Same discipline as
 * `createTaskCore`, `postVoucher()` and the recruitment desk — a second write
 * path is a second set of rules.
 *
 * Read `memory/cocozuri_ops_plan.md` first.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();

/**
 * Cocozuri's own company row — **Furaha Innovation Ltd**, prefix CC.
 *
 * ⚠️ LOOKED UP, NEVER HARD-CODED. CLAUDE.md's first rule: the company list is
 * read from the table. It was seven companies, then thirteen, and two were
 * renamed — this one among them, from "Cocozuri Chocolat". The prefix survived
 * the rename, which is why it is the thing to match on.
 */
export async function cocozuriCompany(): Promise<{ id: number; name: string } | null> {
  const { data } = await sb
    .from("companies")
    .select("id,name,code_prefix")
    .or("code_prefix.eq.CC,name.ilike.%Cocozuri%,name.ilike.%Furaha%")
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as number, name: data.name as string } : null;
}

/**
 * The VAT rate to use when a customer has none of their own.
 *
 * ⚠️ A SETTING, NOT A CONSTANT, and deliberately so. The spreadsheets use 7 on
 * 129 invoices while Tanzania's standard rate is 18, and nobody has yet said
 * which is right (plan §4, question 1). Keeping it in `settings` means the answer
 * is typed on a screen when it comes, and no invoice already raised is touched.
 */
export async function defaultVatRate(): Promise<number> {
  const { data } = await sb.from("settings").select("value").eq("key", "cocozuri.vatRate").maybeSingle();
  const raw = (data?.value as string | null) ?? "";
  // ⚠️ `Number("")` is 0, not NaN — so testing only for a finite number let an
  // unset setting read as "VAT is zero", which is a different and much worse
  // claim than "nobody has said". Check there is something there first.
  if (raw.trim() === "") return 7;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 7;
}

/**
 * Where each number series should carry on from.
 *
 * ⚠️ The business is at CZ-236 in its spreadsheets and those invoices are not in
 * COS, so without this the first invoice raised here would be CZ-1 — and two
 * documents would carry the same number. One settings row, `{"CZ-": 236}`.
 *
 * ⚠️ A FLOOR MAY BE WRITTEN AS A STRING TO FIX THE WIDTH TOO — `{"CZ-CN/": "01"}`
 * means "carry on from 1, and pad to two digits". `nextInSeries` normally takes
 * the width from the numbers already used, and a series with nothing in COS yet
 * has none: the first credit note raised came out `CZ-CN/1` against the paper
 * one's `CZ-CN/01`.
 */
export async function seriesFloor(): Promise<Record<string, number | string>> {
  const { data } = await sb.from("settings").select("value").eq("key", "cocozuri.seriesFloor").maybeSingle();
  try {
    const parsed = JSON.parse((data?.value as string | null) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number | string>) : {};
  } catch {
    return {};
  }
}

export async function setSeriesFloor(series: string, from: number | string): Promise<{ ok: boolean }> {
  const current = await seriesFloor();
  // A string is kept as typed, because its length is the padding.
  const value = typeof from === "string" && /^\d+$/.test(from.trim())
    ? from.trim()
    : Math.max(0, Math.floor(Number(from) || 0));
  const next = { ...current, [series]: value };
  const { error } = await sb
    .from("settings")
    .upsert({ key: "cocozuri.seriesFloor", value: JSON.stringify(next) }, { onConflict: "key" });
  return { ok: !error };
}

export async function setDefaultVatRate(rate: number): Promise<void> {
  await sb.from("settings").upsert({ key: "cocozuri.vatRate", value: String(rate) }, { onConflict: "key" });
}

/* ----------------------------- products ----------------------------- */

const PRODUCT_COLS =
  "id,name,category,brand,uom,pack_size,pack_unit,sku,active,archived,notes,updated_at";

function toProduct(r: Record<string, unknown>): CzProduct {
  return {
    id: r.id as number,
    name: (r.name as string) ?? "",
    category: (r.category as string | null) ?? null,
    brand: (r.brand as string | null) ?? null,
    uom: (r.uom as string) ?? "PCS",
    packSize: r.pack_size == null ? null : Number(r.pack_size),
    packUnit: (r.pack_unit as string | null) ?? null,
    sku: (r.sku as string | null) ?? null,
    active: (r.active as boolean) ?? true,
    archived: (r.archived as boolean) ?? false,
    notes: (r.notes as string | null) ?? null,
    updatedAt: r.updated_at as string,
  };
}

export async function listProducts(opts?: { archived?: boolean }): Promise<CzProduct[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  const { data, error } = await sb
    .from("cz_products")
    .select(PRODUCT_COLS)
    .eq("company_id", company.id)
    .eq("archived", opts?.archived ?? false)
    .order("name");
  // ⚠️ SAID OUT LOUD. A swallowed error here reads on screen as "there are no
  // products" — a far worse claim than "something went wrong", and exactly how
  // the ambiguous embed on `listReceipts` stayed hidden until a payment saved
  // and the list did not move.
  if (error) console.error("[cocozuri] listProducts failed:", error.message);
  return (data ?? []).map(toProduct);
}

export async function getProduct(id: number): Promise<CzProduct | null> {
  const { data } = await sb.from("cz_products").select(PRODUCT_COLS).eq("id", id).maybeSingle();
  return data ? toProduct(data) : null;
}

export type ProductInput = {
  name: string;
  category?: string | null;
  brand?: string | null;
  uom?: string;
  packSize?: number | null;
  packUnit?: string | null;
  sku?: string | null;
  notes?: string | null;
  active?: boolean;
};

export async function createProduct(input: ProductInput, by = "web-ui"): Promise<{ ok: boolean; id?: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A product needs a name." };

  const { data, error } = await sb
    .from("cz_products")
    .insert({
      company_id: company.id,
      name,
      category: input.category?.trim() || null,
      brand: input.brand?.trim() || null,
      uom: input.uom?.trim() || "PCS",
      pack_size: input.packSize ?? null,
      pack_unit: input.packUnit?.trim() || null,
      sku: input.sku?.trim() || null,
      notes: input.notes?.trim() || null,
      active: input.active ?? true,
      created_by: by,
      updated_at: NOW(),
    })
    .select("id")
    .maybeSingle();

  // 23505 = the unique index doing its job: this item is already on the list.
  if (error) return { ok: false, error: error.code === "23505" ? `"${name}" is already on the list.` : error.message };
  return { ok: true, id: data?.id as number };
}

export async function updateProduct(id: number, input: Partial<ProductInput>): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (input.brand !== undefined) patch.brand = input.brand?.trim() || null;
  if (input.uom !== undefined) patch.uom = input.uom?.trim() || "PCS";
  if (input.packSize !== undefined) patch.pack_size = input.packSize;
  if (input.packUnit !== undefined) patch.pack_unit = input.packUnit?.trim() || null;
  if (input.sku !== undefined) patch.sku = input.sku?.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.active !== undefined) patch.active = input.active;
  const { error } = await sb.from("cz_products").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function archiveProduct(id: number, archived: boolean): Promise<{ ok: boolean }> {
  const { error } = await sb.from("cz_products").update({ archived, updated_at: NOW() }).eq("id", id);
  return { ok: !error };
}

/* ----------------------------- customers ----------------------------- */

const CUSTOMER_COLS =
  "id,name,short_name,tin,vat_no,po_box,address,city,country,currency,payment_terms_days,vat_rate,invoice_series,notes,archived,updated_at";

function toCustomer(r: Record<string, unknown>, branches: { id: number; name: string }[]): CzCustomer {
  return {
    id: r.id as number,
    name: (r.name as string) ?? "",
    shortName: (r.short_name as string | null) ?? null,
    tin: (r.tin as string | null) ?? null,
    vatNo: (r.vat_no as string | null) ?? null,
    poBox: (r.po_box as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    country: (r.country as string) ?? "Tanzania",
    currency: (r.currency as string) ?? "TZS",
    paymentTermsDays: (r.payment_terms_days as number) ?? 30,
    vatRate: r.vat_rate == null ? null : Number(r.vat_rate),
    invoiceSeries: (r.invoice_series as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    archived: (r.archived as boolean) ?? false,
    branches,
    updatedAt: r.updated_at as string,
  };
}

export async function listCustomers(opts?: { archived?: boolean }): Promise<CzCustomer[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  const { data, error } = await sb
    .from("cz_customers")
    .select(CUSTOMER_COLS)
    .eq("company_id", company.id)
    .eq("archived", opts?.archived ?? false)
    .order("name");
  if (error) console.error("[cocozuri] listCustomers failed:", error.message);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // One query for every branch, never one per customer.
  const { data: br } = await sb
    .from("cz_branches")
    .select("id,customer_id,name")
    .in("customer_id", rows.map((r) => r.id as number))
    .eq("archived", false)
    .order("name");
  const byCustomer = new Map<number, { id: number; name: string }[]>();
  for (const b of br ?? []) {
    const k = b.customer_id as number;
    byCustomer.set(k, [...(byCustomer.get(k) ?? []), { id: b.id as number, name: b.name as string }]);
  }
  return rows.map((r) => toCustomer(r, byCustomer.get(r.id as number) ?? []));
}

export async function getCustomer(id: number): Promise<CzCustomer | null> {
  const { data } = await sb.from("cz_customers").select(CUSTOMER_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: br } = await sb
    .from("cz_branches").select("id,name").eq("customer_id", id).eq("archived", false).order("name");
  return toCustomer(data, (br ?? []).map((b) => ({ id: b.id as number, name: b.name as string })));
}

export type CustomerInput = {
  name: string;
  shortName?: string | null;
  tin?: string | null;
  vatNo?: string | null;
  poBox?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string;
  currency?: string;
  paymentTermsDays?: number;
  vatRate?: number | null;
  invoiceSeries?: string | null;
  notes?: string | null;
};

export async function createCustomer(input: CustomerInput, by = "web-ui"): Promise<{ ok: boolean; id?: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A customer needs a name." };

  const { data, error } = await sb
    .from("cz_customers")
    .insert({
      company_id: company.id,
      name,
      short_name: input.shortName?.trim() || null,
      tin: input.tin?.trim() || null,
      vat_no: input.vatNo?.trim() || null,
      po_box: input.poBox?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      country: input.country?.trim() || "Tanzania",
      currency: input.currency?.trim() || "TZS",
      payment_terms_days: input.paymentTermsDays ?? 30,
      vat_rate: input.vatRate ?? null,
      invoice_series: input.invoiceSeries?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: by,
      updated_at: NOW(),
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.code === "23505" ? `"${name}" is already a customer.` : error.message };
  return { ok: true, id: data?.id as number };
}

export async function updateCustomer(id: number, input: Partial<CustomerInput>): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = { updated_at: NOW() };
  const map: Record<string, string> = {
    name: "name", shortName: "short_name", tin: "tin", vatNo: "vat_no", poBox: "po_box",
    address: "address", city: "city", country: "country", currency: "currency",
    invoiceSeries: "invoice_series", notes: "notes",
  };
  for (const [k, col] of Object.entries(map)) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined) patch[col] = typeof v === "string" ? v.trim() || null : v;
  }
  if (input.paymentTermsDays !== undefined) patch.payment_terms_days = input.paymentTermsDays;
  if (input.vatRate !== undefined) patch.vat_rate = input.vatRate;
  const { error } = await sb.from("cz_customers").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function archiveCustomer(id: number, archived: boolean): Promise<{ ok: boolean }> {
  const { error } = await sb.from("cz_customers").update({ archived, updated_at: NOW() }).eq("id", id);
  return { ok: !error };
}

/** Replace a customer's branch list. Small enough that replacing beats diffing —
 *  the same reasoning `syncNoteLinks` uses. */
export async function setBranches(customerId: number, names: string[]): Promise<{ ok: boolean }> {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  await sb.from("cz_branches").delete().eq("customer_id", customerId);
  if (clean.length === 0) return { ok: true };
  const { error } = await sb
    .from("cz_branches")
    .insert(clean.map((name) => ({ customer_id: customerId, name })));
  return { ok: !error };
}

/* ------------------------------ prices ------------------------------ */

export async function listPrices(opts?: { productId?: number; customerId?: number | null }): Promise<CzPrice[]> {
  let q = sb.from("cz_prices").select("id,product_id,customer_id,price,currency,effective_from,note");
  if (opts?.productId != null) q = q.eq("product_id", opts.productId);
  if (opts?.customerId !== undefined) {
    q = opts.customerId == null ? q.is("customer_id", null) : q.eq("customer_id", opts.customerId);
  }
  const { data, error } = await q.order("effective_from", { ascending: false });
  if (error) console.error("[cocozuri] listPrices failed:", error.message);
  return (data ?? []).map((r) => ({
    id: r.id as number,
    productId: r.product_id as number,
    customerId: (r.customer_id as number | null) ?? null,
    price: Number(r.price),
    currency: (r.currency as string) ?? "TZS",
    effectiveFrom: r.effective_from as string,
    note: (r.note as string | null) ?? null,
  }));
}

/**
 * Put a price on the list.
 *
 * ⚠️ ALWAYS AN INSERT, NEVER AN UPDATE. A price is a row with a date: changing
 * one in place would rewrite what was charged before it changed. To correct a
 * mistake, add a row with the same date — the newest wins — rather than editing
 * history.
 */
export async function setPrice(input: {
  productId: number;
  customerId?: number | null;
  price: number;
  currency?: string;
  effectiveFrom?: string;
  note?: string | null;
}, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(input.price) || input.price < 0) return { ok: false, error: "That is not a price." };
  const { error } = await sb.from("cz_prices").insert({
    product_id: input.productId,
    customer_id: input.customerId ?? null,
    price: input.price,
    currency: input.currency?.trim() || "TZS",
    effective_from: input.effectiveFrom ?? NOW(),
    note: input.note?.trim() || null,
    created_by: by,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deletePrice(id: number): Promise<{ ok: boolean }> {
  const { error } = await sb.from("cz_prices").delete().eq("id", id);
  return { ok: !error };
}

/* ------------------------------ merging ------------------------------ */

export type MergeResult = {
  ok: boolean;
  error?: string;
  movedPrices?: number;
  movedLines?: number;
  merged?: number;
};

/**
 * Fold duplicate products into one.
 *
 * ⚠️ WHY THIS EXISTS. The spreadsheets type the same bar five different ways —
 * "50% DARK CHOC CASHEW SEA SALT BAR", the same with a typo, the same with
 * "(100GM)" on the end, and so on — and the sales sheet matched items BY NAME,
 * so anything spelled differently silently scored nothing. Measured: about 200
 * units a month unaccounted for. Everything in COS joins by id, so the fault
 * cannot recur; but the duplicates came across on import, and only a person can
 * say which rows are the same product.
 *
 * ⚠️ NOTHING IS DELETED. The losers are ARCHIVED, so a merge done in error can
 * be looked at and undone by hand. Their prices and any invoice lines move to
 * the keeper first, so no history is orphaned.
 *
 * ⚠️ IT REFUSES TO MERGE A PRODUCT INTO ITSELF, or across companies — both would
 * be silent corruption rather than a visible failure.
 */
export async function mergeProducts(keepId: number, mergeIds: number[]): Promise<MergeResult> {
  const losers = [...new Set(mergeIds)].filter((id) => id !== keepId);
  if (losers.length === 0) return { ok: false, error: "Nothing to merge." };

  const { data: rows } = await sb
    .from("cz_products")
    .select("id,company_id,name")
    .in("id", [keepId, ...losers]);
  const all = rows ?? [];
  const keeper = all.find((r) => r.id === keepId);
  if (!keeper) return { ok: false, error: "The product to keep no longer exists." };
  if (all.length !== losers.length + 1) return { ok: false, error: "One of those products no longer exists." };
  if (all.some((r) => r.company_id !== keeper.company_id)) {
    return { ok: false, error: "Those products belong to different companies." };
  }

  // Prices first. They keep their dates, so the keeper inherits the whole price
  // history of everything folded into it — `priceInForce` breaks a same-day tie
  // by id, so the answer stays the same every time it is asked.
  const { data: moved } = await sb
    .from("cz_prices")
    .update({ product_id: keepId })
    .in("product_id", losers)
    .select("id");

  // Then invoice lines. An invoice already sent keeps the words it was printed
  // with (`description` is frozen); only the pointer moves.
  const { data: lines } = await sb
    .from("cz_invoice_lines")
    .update({ product_id: keepId })
    .in("product_id", losers)
    .select("id");

  const { error } = await sb
    .from("cz_products")
    .update({
      archived: true,
      // ⚠️ The DAR day, not the UTC one — before 3am they differ, and a note
      // dated yesterday is a small lie in a permanent record.
      notes: `Merged into "${keeper.name}" on ${todayInDar()}`,
      updated_at: NOW(),
    })
    .in("id", losers);
  if (error) return { ok: false, error: error.message };

  return { ok: true, movedPrices: (moved ?? []).length, movedLines: (lines ?? []).length, merged: losers.length };
}

/* ----------------------------- invoices ----------------------------- */

/* ⚠️ ONE STRING LITERAL, not a concatenation. The Supabase client reads the
   column list at TYPE level to work out the row shape; split it across a `+` and
   it can no longer see it, every row degrades to an error type, and the whole
   file stops compiling for a reason that looks nothing like the cause. */
const INVOICE_COLS = "id,customer_id,branch_id,cz_branches(name),doc_type,applies_to_invoice_id,number,series,issue_date,terms_days,currency,vat_rate,tax_inclusive,customer_name,customer_tin,customer_vat_no,customer_po_box,customer_city,reference,status,notes";

function toInvoice(r: Record<string, unknown>, lines: CzInvoiceLine[]): CzInvoice {
  return {
    id: r.id as number,
    customerId: r.customer_id as number,
    branchId: (r.branch_id as number | null) ?? null,
    // PostgREST returns an embedded row as an object or a one-item array
    // depending on the relationship it infers — both shapes turn up.
    branchName: (() => {
      const b = (r as { cz_branches?: { name?: string } | { name?: string }[] | null }).cz_branches;
      const one = Array.isArray(b) ? b[0] : b;
      return one?.name ?? null;
    })(),
    docType: ((r.doc_type as string) ?? "invoice") as CzInvoice["docType"],
    appliesToInvoiceId: (r.applies_to_invoice_id as number | null) ?? null,
    number: (r.number as string) ?? "",
    series: (r.series as string | null) ?? null,
    issueDate: r.issue_date as string,
    termsDays: (r.terms_days as number) ?? 30,
    currency: (r.currency as string) ?? "TZS",
    vatRate: Number(r.vat_rate ?? 0),
    taxInclusive: (r.tax_inclusive as boolean) ?? true,
    customerName: (r.customer_name as string) ?? "",
    customerTin: (r.customer_tin as string | null) ?? null,
    customerVatNo: (r.customer_vat_no as string | null) ?? null,
    customerPoBox: (r.customer_po_box as string | null) ?? null,
    customerCity: (r.customer_city as string | null) ?? null,
    reference: (r.reference as string | null) ?? null,
    status: ((r.status as string) ?? "draft") as CzInvoice["status"],
    notes: (r.notes as string | null) ?? null,
    lines,
  };
}

function toLine(r: Record<string, unknown>): CzInvoiceLine {
  return {
    id: r.id as number,
    productId: (r.product_id as number | null) ?? null,
    lineNo: (r.line_no as number) ?? 1,
    description: (r.description as string) ?? "",
    brand: (r.brand as string | null) ?? null,
    packSize: r.pack_size == null ? null : Number(r.pack_size),
    packUnit: (r.pack_unit as string | null) ?? null,
    uom: (r.uom as string | null) ?? null,
    qty: Number(r.qty ?? 0),
    unitPrice: Number(r.unit_price ?? 0),
  };
}

export async function listInvoices(opts?: { status?: string; customerId?: number }): Promise<CzInvoice[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_invoices").select(INVOICE_COLS).eq("company_id", company.id);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
  const { data, error } = await q.order("issue_date", { ascending: false }).order("id", { ascending: false });
  if (error) console.error("[cocozuri] listInvoices failed:", error.message);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // One query for every line, never one per invoice.
  const { data: lines } = await sb
    .from("cz_invoice_lines")
    .select("id,invoice_id,product_id,line_no,description,brand,pack_size,pack_unit,uom,qty,unit_price")
    .in("invoice_id", rows.map((r) => r.id as number))
    .order("line_no");
  const byInvoice = new Map<number, CzInvoiceLine[]>();
  for (const l of lines ?? []) {
    const k = l.invoice_id as number;
    byInvoice.set(k, [...(byInvoice.get(k) ?? []), toLine(l)]);
  }
  return rows.map((r) => toInvoice(r, byInvoice.get(r.id as number) ?? []));
}

export async function getInvoiceByNumber(number: string): Promise<CzInvoice | null> {
  const company = await cocozuriCompany();
  if (!company) return null;
  const { data } = await sb
    .from("cz_invoices").select(INVOICE_COLS)
    .eq("company_id", company.id).eq("number", number).maybeSingle();
  if (!data) return null;
  const { data: lines } = await sb
    .from("cz_invoice_lines")
    .select("id,invoice_id,product_id,line_no,description,brand,pack_size,pack_unit,uom,qty,unit_price")
    .eq("invoice_id", data.id as number).order("line_no");
  return toInvoice(data, (lines ?? []).map(toLine));
}

/**
 * Raise an invoice or a credit note.
 *
 * ⚠️ FOUR THINGS ARE FROZEN ONTO IT at this moment, and each for the same reason:
 * an invoice must print what was true the day it was raised.
 *   1. **The customer details** — name, TIN, VAT number, box, city. They move
 *      office; last year paperwork does not.
 *   2. **The VAT rate.** The open question about 7% versus 18% can be answered
 *      later without touching a single invoice already sent.
 *   3. **The payment terms**, so the due date cannot drift.
 *   4. **Each line description**, so renaming a product does not rewrite
 *      paperwork a customer is holding.
 *
 * ⚠️ THE NUMBER IS ALLOCATED AGAINST A UNIQUE INDEX, and a clash is retried. Two
 * people pressing the button in the same second is exactly the case that index
 * exists for; reading "the last number" and adding one is not enough on its own.
 */
export async function createInvoice(input: {
  customerId: number;
  branchId?: number | null;
  docType?: "invoice" | "credit_note";
  /** Which invoice a credit note answers. Ignored on an invoice. */
  appliesToInvoiceId?: number | null;
  issueDate?: string;
  reference?: string | null;
  notes?: string | null;
  lines: Array<{
    productId?: number | null;
    description: string;
    brand?: string | null;
    packSize?: number | null;
    packUnit?: string | null;
    uom?: string | null;
    qty: number;
    unitPrice: number;
  }>;
}, by = "web-ui"): Promise<{ ok: boolean; id?: number; number?: string; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const customer = await getCustomer(input.customerId);
  if (!customer) return { ok: false, error: "That customer no longer exists." };

  const clean = input.lines.filter((l) => l.description.trim() && Number(l.qty) > 0);
  if (clean.length === 0) return { ok: false, error: "An invoice needs at least one line." };
  // ⚠️ A price of zero is allowed (a sample), but a MISSING one is not — that is
  // the "never invent a figure" rule, enforced where it matters.
  if (clean.some((l) => !Number.isFinite(Number(l.unitPrice)))) {
    return { ok: false, error: "Every line needs a price." };
  }

  const docType = input.docType ?? "invoice";
  const series = docType === "credit_note" ? "CZ-CN/" : (customer.invoiceSeries?.trim() || "CZ-");
  const rate = customer.vatRate ?? (await defaultVatRate());

  // Existing numbers in this series, for the next one.
  const { data: used } = await sb
    .from("cz_invoices").select("number").eq("company_id", company.id).like("number", `${series}%`);
  const taken = (used ?? []).map((r) => r.number as string);
  const floor = (await seriesFloor())[series] ?? 0;

  for (let attempt = 0; attempt < 5; attempt++) {
    const number = nextInSeries(series, taken, floor);
    const { data, error } = await sb
      .from("cz_invoices")
      .insert({
        company_id: company.id,
        customer_id: customer.id,
        branch_id: input.branchId ?? null,
        doc_type: docType,
        // ⚠️ Only a credit note answers an invoice. Set on an invoice it would
        // be a quiet nonsense nobody would ever look at.
        applies_to_invoice_id: docType === "credit_note" ? (input.appliesToInvoiceId ?? null) : null,
        number,
        series,
        issue_date: input.issueDate ?? NOW(),
        terms_days: customer.paymentTermsDays,
        currency: customer.currency,
        vat_rate: rate,
        tax_inclusive: true,
        customer_name: customer.name,
        customer_tin: customer.tin,
        customer_vat_no: customer.vatNo,
        customer_po_box: customer.poBox,
        customer_city: customer.city,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        status: "draft",
        created_by: by,
        updated_at: NOW(),
      })
      .select("id,number")
      .maybeSingle();

    if (error) {
      // 23505 = somebody took that number between the read and the write. Ask
      // again — this is what the unique index is FOR.
      if (error.code === "23505") { taken.push(number); continue; }
      return { ok: false, error: error.message };
    }
    if (!data) return { ok: false, error: "The invoice was not created." };

    const invoiceId = data.id as number;
    const { error: lineErr } = await sb.from("cz_invoice_lines").insert(
      clean.map((l, i) => ({
        invoice_id: invoiceId,
        product_id: l.productId ?? null,
        line_no: i + 1,
        description: l.description.trim(),
        brand: l.brand?.trim() || null,
        pack_size: l.packSize ?? null,
        pack_unit: l.packUnit?.trim() || null,
        uom: l.uom?.trim() || null,
        qty: l.qty,
        unit_price: l.unitPrice,
      })),
    );
    if (lineErr) {
      // An invoice with no lines is worse than no invoice — take it back out.
      await sb.from("cz_invoices").delete().eq("id", invoiceId);
      return { ok: false, error: lineErr.message };
    }
    void recordEvent({
      subjectType: "invoice", subjectId: invoiceId, subjectRef: data.number as string,
      kind: "created",
      summary: `Raised as a draft for ${customer.name}, ${clean.length} line${clean.length === 1 ? "" : "s"}.`,
    }, by);
    return { ok: true, id: invoiceId, number: data.number as string };
  }
  return { ok: false, error: "Could not find a free invoice number." };
}

/**
 * Issue it — the point after which it is somebody else paperwork.
 *
 * ⚠️ AN ISSUED INVOICE IS NEVER EDITED. It is corrected with a credit note, which
 * is what the business already does (Garden Market CZ-CN/01). Same rule as the
 * general ledger: a posted entry is reversed, never rewritten.
 *
 * ⚠️ ISSUING IS ALSO THE DESPATCH, AND IT RECORDS WHICH LOTS WENT. An invoice
 * line names a PRODUCT, so until this existed nothing anywhere could answer the
 * second recall question — not "where did this lot go" (the stock ledger has
 * always known that) but "WHO GOT IT". `recordDespatch` writes a lot-by-lot
 * reading of the shelf against each line; it is a suggestion and it is
 * correctable afterwards.
 *
 * ⚠️ AND IT MOVES NO STOCK, WHICH IS WHY IT IS SAFE TO DO HERE. The day sheet
 * owns the quantity; an invoice writing movements too would take the same
 * chocolate off the shelf twice.
 *
 * ⚠️ THE DESPATCH FAILING DOES NOT UNDO THE ISSUE. The invoice is the document
 * somebody is sent and it has been issued; refusing to issue it because a note
 * about lots could not be written would be the tail wagging the dog. It is
 * reported and the record can be filled in by hand.
 */
export async function issueInvoice(id: number): Promise<{ ok: boolean; error?: string; despatchNote?: string }> {
  const { data, error } = await sb
    .from("cz_invoices").update({ status: "issued", updated_at: NOW() })
    .eq("id", id).eq("status", "draft").select("id,doc_type,number").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That invoice is not a draft any more." };

  /* ⚠️ A CREDIT NOTE DESPATCHES NOTHING — it is chocolate coming back, or an
     amount being corrected. Reading the shelf and stamping lots on it would
     record a delivery that never happened. */
  if ((data.doc_type as string) === "credit_note") return { ok: true };

  const { recordDespatch } = await import("@/lib/cocozuri-despatch");
  const despatch = await recordDespatch(id);
  void recordEvent({
    subjectType: "invoice", subjectId: id, subjectRef: (data.number as string) ?? null,
    kind: "issued",
    summary: despatch.ok
      ? "Issued. It cannot be edited now — only answered with a credit note."
      : "Issued, but which lots went out could not be recorded.",
  });
  return despatch.ok
    ? { ok: true }
    : { ok: true, despatchNote: `Issued — but which lots went could not be recorded: ${despatch.error}` };
}

/**
 * **Edit a draft.**
 *
 * ⚠️ A DRAFT ONLY, AND THE CHECK IS THE POINT. An ISSUED invoice is never
 * edited — it is answered with a credit note, which is the business's own habit
 * and the general ledger's second rule at once. A draft has been sent to nobody
 * and acted on by nothing, so cancelling it and typing the whole thing again was
 * never a rule, only a missing screen.
 *
 * ⚠️ THE LINES ARE REPLACED, NOT MERGED. Merging needs a rule for what an
 * absent line means, and "I did not mention it" and "take it off" are different
 * claims nobody could tell apart afterwards. The caller sends the whole invoice
 * as it should now read.
 *
 * ⚠️ THE NUMBER AND THE SERIES NEVER MOVE. A draft already holds a number out
 * of a series, and re-allocating it on an edit would leave a gap somebody would
 * later have to explain to an auditor.
 *
 * ⚠️ CHANGING THE CUSTOMER RE-FREEZES WHAT IS FROZEN. The details, the VAT
 * rate, the terms and the currency all come off the customer at the moment an
 * invoice is raised; moving a draft to a different customer and keeping the old
 * one's VAT rate would print a figure nothing supports.
 */
export async function updateDraftInvoice(id: number, input: {
  customerId?: number;
  branchId?: number | null;
  issueDate?: string;
  reference?: string | null;
  notes?: string | null;
  lines?: Array<{
    productId?: number | null;
    description: string;
    brand?: string | null;
    packSize?: number | null;
    packUnit?: string | null;
    uom?: string | null;
    qty: number;
    unitPrice: number;
  }>;
}): Promise<{ ok: boolean; error?: string }> {
  const { data: existing } = await sb
    .from("cz_invoices").select("id,status,number,customer_id").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "That invoice does not exist." };
  if ((existing.status as string) !== "draft") {
    return {
      ok: false,
      error: `${existing.number} has been issued. It cannot be edited — answer it with a credit note.`,
    };
  }

  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.reference !== undefined) patch.reference = input.reference?.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.issueDate) patch.issue_date = input.issueDate;
  if (input.branchId !== undefined) patch.branch_id = input.branchId ?? null;

  if (input.customerId != null && input.customerId !== (existing.customer_id as number)) {
    const customer = await getCustomer(input.customerId);
    if (!customer) return { ok: false, error: "That customer no longer exists." };
    patch.customer_id = customer.id;
    patch.vat_rate = customer.vatRate ?? (await defaultVatRate());
    patch.terms_days = customer.paymentTermsDays;
    patch.currency = customer.currency;
    patch.customer_name = customer.name;
    patch.customer_tin = customer.tin;
    patch.customer_vat_no = customer.vatNo;
    patch.customer_po_box = customer.poBox;
    patch.customer_city = customer.city;
  }

  if (input.lines) {
    const clean = input.lines.filter((l) => l.description.trim() && Number(l.qty) > 0);
    if (clean.length === 0) return { ok: false, error: "An invoice needs at least one line." };
    // ⚠️ A price of zero is allowed (a sample), a MISSING one is not.
    if (clean.some((l) => !Number.isFinite(Number(l.unitPrice)))) {
      return { ok: false, error: "Every line needs a price." };
    }
    /* ⚠️ THE LINES GO FIRST AND THE HEADER ONLY IF THEY LANDED. The other
       order can leave an invoice addressed to a new customer carrying the old
       one's lines — and there is no transaction here to fall back on. */
    const { error: delErr } = await sb.from("cz_invoice_lines").delete().eq("invoice_id", id);
    if (delErr) return { ok: false, error: delErr.message };
    const { error: lineErr } = await sb.from("cz_invoice_lines").insert(
      clean.map((l, i) => ({
        invoice_id: id,
        product_id: l.productId ?? null,
        line_no: i + 1,
        description: l.description.trim(),
        brand: l.brand?.trim() || null,
        pack_size: l.packSize ?? null,
        pack_unit: l.packUnit?.trim() || null,
        uom: l.uom?.trim() || null,
        qty: l.qty,
        unit_price: l.unitPrice,
      })),
    );
    if (lineErr) return { ok: false, error: lineErr.message };
  }

  const { error } = await sb.from("cz_invoices").update(patch).eq("id", id).eq("status", "draft");
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Cancel a DRAFT. An issued one stays, and is answered with a credit note. */
export async function cancelInvoice(id: number): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await sb
    .from("cz_invoices").update({ status: "cancelled", updated_at: NOW() })
    .eq("id", id).eq("status", "draft").select("id,number").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Only a draft can be cancelled — issue a credit note instead." };
  void recordEvent({
    subjectType: "invoice", subjectId: id, subjectRef: (data.number as string) ?? null,
    kind: "cancelled", summary: "Cancelled as a draft — it had been sent to nobody.",
  });
  return { ok: true };
}

/* ================================================================== *
 * CocoZuri — Phase 3: the money that comes back in.
 *
 * ⚠️ EVERY FIGURE ON THESE SCREENS IS DERIVED. Nothing here stores a balance, an
 * age or a band; the invoices, the credit notes and the receipts are the facts
 * and the arithmetic lives in `cocozuri-shared.ts`, where it is tested. That is
 * the ledger's rule, and it is the difference between this and the workbook's
 * DEBTOR MASTER — a hand-typed month-end snapshot that was wrong the moment a
 * payment arrived.
 * ================================================================== */

/**
 * ⚠️ `companies!received_into_company_id(name)` — NAMED, not a bare
 * `companies(name)`.
 *
 * `cz_receipts` has TWO foreign keys to `companies`: the company that raised the
 * invoice, and the one whose account actually took the money. PostgREST cannot
 * guess which an embed means, so it refuses the WHOLE query — and because a
 * failed select comes back as `data: null`, the page showed "no payments yet"
 * over rows that were sitting in the table. Found by recording a payment and
 * watching it not appear; there is nothing in the code to see.
 *
 * ⚠️ ONE STRING LITERAL. Split across a `+` and the Supabase client can no
 * longer read it at type level, every row degrades to an error type, and the
 * file stops compiling for a reason that looks unrelated (Phase 2's second bug).
 */
const RECEIPT_COLS =
  "id,customer_id,invoice_id,cz_invoices(number),received_on,amount,currency,method,reference,received_into_company_id,companies!received_into_company_id(name),notes";

function toReceipt(r: Record<string, unknown>): CzReceipt {
  // PostgREST returns an embedded row as an object or a one-item array
  // depending on the relationship it infers — both shapes turn up.
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    (Array.isArray(v) ? v[0] : v) ?? null;
  return {
    id: r.id as number,
    customerId: r.customer_id as number,
    invoiceId: r.invoice_id as number,
    invoiceNumber: one((r as { cz_invoices?: { number?: string } | { number?: string }[] }).cz_invoices)?.number ?? null,
    receivedOn: r.received_on as string,
    amount: Number(r.amount ?? 0),
    currency: (r.currency as string) ?? "TZS",
    method: (r.method as string | null) ?? null,
    reference: (r.reference as string | null) ?? null,
    receivedIntoCompanyId: (r.received_into_company_id as number | null) ?? null,
    receivedIntoName: one((r as { companies?: { name?: string } | { name?: string }[] }).companies)?.name ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

export async function listReceipts(opts?: { customerId?: number; invoiceId?: number }): Promise<CzReceipt[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_receipts").select(RECEIPT_COLS).eq("company_id", company.id);
  if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
  if (opts?.invoiceId) q = q.eq("invoice_id", opts.invoiceId);
  const { data, error } = await q.order("received_on", { ascending: false }).order("id", { ascending: false });
  // ⚠️ SAID OUT LOUD. A swallowed error here reads on screen as "no payments
  // have ever been received", which is a far worse claim than "something went
  // wrong" — and it is exactly what the ambiguous embed above produced.
  if (error) console.error("[cocozuri] listReceipts failed:", error.message);
  return (data ?? []).map(toReceipt);
}

export type ReceiptInput = {
  invoiceId: number;
  amount: number;
  receivedOn?: string;
  method?: string | null;
  reference?: string | null;
  /** ⚠️ Which company actually took the money — see the column comment. */
  receivedIntoCompanyId?: number | null;
  notes?: string | null;
};

/**
 * Record a payment.
 *
 * ⚠️ THE CUSTOMER IS TAKEN FROM THE INVOICE, never from the form. A receipt
 * belonging to one customer against another's invoice is not a thing that should
 * be possible to type, and reading it off the invoice makes it impossible rather
 * than merely discouraged.
 *
 * ⚠️ MONEY CANNOT BE RECORDED AGAINST A DRAFT. A draft has not been sent to
 * anybody; a payment against one means either the wrong document was picked or
 * the invoice was never issued, and both are worth stopping.
 *
 * It does NOT refuse an overpayment. Customers do overpay, and a system that
 * will not let you write down what actually happened gets worked around.
 */
export async function createReceipt(input: ReceiptInput, by = "web-ui"): Promise<{ ok: boolean; id?: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return { ok: false, error: "A payment needs an amount." };
  }

  const { data: invoice } = await sb
    .from("cz_invoices").select("id,customer_id,doc_type,status,number,currency")
    .eq("id", input.invoiceId).eq("company_id", company.id).maybeSingle();
  if (!invoice) return { ok: false, error: "That invoice does not exist." };
  if (invoice.status !== "issued") {
    return { ok: false, error: `${invoice.number} has not been issued — a draft cannot be paid.` };
  }
  if (invoice.doc_type === "credit_note") {
    return { ok: false, error: "A credit note is not paid — it reduces what is owed on an invoice." };
  }

  const { data, error } = await sb
    .from("cz_receipts")
    .insert({
      company_id: company.id,
      customer_id: invoice.customer_id as number,
      invoice_id: invoice.id as number,
      received_on: input.receivedOn ?? NOW(),
      amount,
      currency: (invoice.currency as string) ?? "TZS",
      method: input.method?.trim() || null,
      reference: input.reference?.trim() || null,
      received_into_company_id: input.receivedIntoCompanyId ?? null,
      notes: input.notes?.trim() || null,
      created_by: by,
      updated_at: NOW(),
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id as number | undefined };
}

/**
 * One payment settling several invoices at once.
 *
 * ⚠️ THIS IS THE REASON A RECEIPT DOES NOT NEED TO SIT "ON ACCOUNT". A cheque
 * covering five invoices becomes five rows sharing one reference and one date —
 * so every shilling stays attached to the paperwork it settles, and nobody has
 * to come back later and remember what a lump sum was for.
 *
 * ⚠️ ALL OR NOTHING. If one line is refused, the ones already written are taken
 * back out. Half a cheque recorded is worse than none: the balance would look
 * settled on some invoices and nobody would know the rest was missing.
 */
export async function createReceipts(
  rows: ReceiptInput[],
  by = "web-ui",
): Promise<{ ok: boolean; ids: number[]; error?: string }> {
  const ids: number[] = [];
  for (const row of rows) {
    const res = await createReceipt(row, by);
    if (!res.ok) {
      for (const id of ids) await sb.from("cz_receipts").delete().eq("id", id);
      return { ok: false, ids: [], error: res.error };
    }
    if (res.id) ids.push(res.id);
  }
  if (ids.length === 0) return { ok: false, ids: [], error: "Nothing to record." };
  return { ok: true, ids };
}

export async function updateReceipt(id: number, input: Partial<ReceiptInput>): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.amount !== undefined) {
    const a = Number(input.amount);
    if (!Number.isFinite(a) || a === 0) return { ok: false, error: "A payment needs an amount." };
    patch.amount = a;
  }
  if (input.receivedOn !== undefined) patch.received_on = input.receivedOn;
  if (input.method !== undefined) patch.method = input.method?.trim() || null;
  if (input.reference !== undefined) patch.reference = input.reference?.trim() || null;
  if (input.receivedIntoCompanyId !== undefined) patch.received_into_company_id = input.receivedIntoCompanyId ?? null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  const { error } = await sb.from("cz_receipts").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Take a payment back off.
 *
 * A receipt that never reached the books is a note somebody typed, and a
 * mistyped figure has no history worth keeping — so it is simply removed, which
 * is what the owner asked for across the rest of COS.
 *
 * ⚠️ ONCE IT IS IN THE BOOKS THAT STOPS BEING TRUE, AND THIS REFUSES.
 *
 * This is the change the Phase 3 note promised. A posted payment cannot be
 * deleted, because deleting the row would leave `gl_entries` holding a debit
 * and a credit for a payment that no longer exists anywhere else — the ledger's
 * second rule read backwards. Take it out of the books first (that writes a
 * reversal; both sides stay on the record for ever) and then it can go.
 */
export async function deleteReceipt(id: number): Promise<{ ok: boolean; error?: string }> {
  // Imported here rather than at the top: `cocozuri-ledger` imports this file,
  // and a static cycle between the two would be resolved by whichever side
  // loaded first — which is not a thing to leave to chance.
  const { receiptIsPosted } = await import("@/lib/cocozuri-ledger");
  if (await receiptIsPosted(id)) {
    return {
      ok: false,
      error: "That payment is in the books. Take it out of the ledger first — that writes a reversal, which stays on the record — and then it can be removed.",
    };
  }
  const { error } = await sb.from("cz_receipts").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Point a credit note at the invoice it answers — or unpoint it.
 *
 * ⚠️ ONLY A CREDIT NOTE, and only at an invoice of the SAME CUSTOMER. Crediting
 * one customer's account with another's return is the kind of mistake that is
 * found months later by the customer, not by us.
 */
export async function applyCreditNote(
  creditNoteId: number,
  invoiceId: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const { data: note } = await sb
    .from("cz_invoices").select("id,doc_type,customer_id").eq("id", creditNoteId).maybeSingle();
  if (!note) return { ok: false, error: "That credit note does not exist." };
  if (note.doc_type !== "credit_note") return { ok: false, error: "Only a credit note can be applied to an invoice." };

  if (invoiceId != null) {
    const { data: target } = await sb
      .from("cz_invoices").select("id,doc_type,customer_id,status").eq("id", invoiceId).maybeSingle();
    if (!target) return { ok: false, error: "That invoice does not exist." };
    if (target.doc_type !== "invoice") return { ok: false, error: "A credit note answers an invoice, not another credit note." };
    if (target.customer_id !== note.customer_id) {
      return { ok: false, error: "That invoice belongs to a different customer." };
    }
  }

  const { error } = await sb
    .from("cz_invoices").update({ applies_to_invoice_id: invoiceId, updated_at: NOW() })
    .eq("id", creditNoteId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* --------------------- the derived views ---------------------- */

/**
 * Everything the "what is owed" page needs, in three queries.
 *
 * The arithmetic itself lives in `cocozuri-shared.ts` and is tested there — this
 * only fetches. ⚠️ Note it asks for ALL invoices, not just the unpaid ones:
 * there is no "unpaid" flag to filter on, because what is owed is worked out
 * from the receipts, and a flag would be a stored balance by another name.
 */
export async function owedBook(): Promise<{
  invoices: CzInvoice[];
  receipts: CzReceipt[];
  accounts: CzCustomerAccount[];
  outstanding: CzOutstanding[];
}> {
  const [invoices, receipts] = await Promise.all([listInvoices(), listReceipts()]);
  const asOf = new Date();
  return {
    invoices,
    receipts,
    accounts: customerAccounts(invoices, receipts, asOf),
    outstanding: outstandingOf(invoices, receipts, asOf),
  };
}

/** One customer's statement of account — the customer tabs of the master
 *  workbook, as a page that can be sent. */
export async function statementFor(
  customerId: number,
  opts?: { from?: string; to?: string },
): Promise<{
  customer: CzCustomer | null;
  opening: number;
  rows: CzStatementRow[];
  closing: number;
  outstanding: CzOutstanding[];
  bands: Record<CzAgeingKey, number>;
} | null> {
  const [customer, invoices, receipts] = await Promise.all([
    getCustomer(customerId),
    listInvoices({ customerId }),
    listReceipts({ customerId }),
  ]);
  if (!customer) return null;
  const asOf = new Date();
  const { opening, rows, closing } = statementRows(invoices, receipts, opts);
  const outstanding = outstandingOf(invoices, receipts, asOf);
  return {
    customer,
    opening, rows, closing,
    outstanding,
    bands: ageingSummary(outstanding.map((o) => ({ days: o.days, amount: o.balance }))),
  };
}

/** The other companies, so a payment can say which one actually took the money.
 *  ⚠️ Read from the table, never hard-coded — CLAUDE.md's first rule. */
export async function companyChoices(): Promise<{ id: number; name: string }[]> {
  const { data } = await sb.from("companies").select("id,name").order("name");
  return (data ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
}
