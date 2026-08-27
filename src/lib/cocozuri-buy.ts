import { sb } from "@/db/supabase";
import { cocozuriCompany, seriesFloor } from "@/lib/cocozuri";
import { nextInSeries } from "@/lib/cocozuri-shared";
import { listItems, listMoves, postStockMove, reverseStockVoucher } from "@/lib/cocozuri-stock";
import { materialCosts } from "@/lib/cocozuri-recipe";
import { todayInDar } from "@/lib/cocozuri-stock-shared";
import { recordEvent } from "@/lib/cocozuri-events";
import {
  budgetUsage, landedLines, purchaseBlockers, purchaseTotals,
  type CzBudget, type CzBudgetStatus, type CzPaidFrom, type CzPurchase, type CzPurchaseLine,
} from "@/lib/cocozuri-buy-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 2 — buying. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE. It pulls in `sb`, which drags
 * @/db/supabase into the browser bundle and kills every page with
 * "SUPABASE_SERVICE_ROLE_KEY is not set". The client-safe twin is
 * `cocozuri-buy-shared.ts`, and ALL the arithmetic lives there, tested.
 *
 * ⚠️ ONE DOOR FOR WRITES. The functions below are the only things that write
 * `cz_budgets`, `cz_purchases` and `cz_purchase_lines`; the actions in
 * `app/cocozuri/actions.ts` are thin wrappers. Same discipline as
 * `createTaskCore`, `postVoucher()` and `postStockMove()`.
 *
 * ⚠️ AND NOTHING HERE INSERTS INTO `cz_stock_moves`. Approving a purchase calls
 * `postStockMove()`; cancelling one calls `reverseStockVoucher()`. A second
 * write path would be a second stock ledger.
 *
 * Read `memory/cocozuri_manufacturing_plan.md` §4 Stage 2 and §5a first.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** The document type this stage writes into the stock ledger. */
export const PURCHASE_VOUCHER = "purchase";

/* ============================== budgets ============================== */

/** ⚠️ ONE STRING LITERAL, NOT A CONCATENATION. Split across a `+` and the
 *  Supabase client can no longer read the column list at type level: every row
 *  degrades to an error type and the file stops compiling for a reason that
 *  looks completely unrelated. Cost real time on the invoice sheet already. */
const BUDGET_COLS = "id,title,location_id,starts_on,ends_on,amount,status,submitted_by,submitted_at,decided_by_person_id,decided_by,decided_at,decision_note,notes";

function toBudget(r: Record<string, unknown>, locationNames: Map<number, string>): CzBudget {
  const locationId = (r.location_id as number | null) ?? null;
  return {
    id: r.id as number,
    title: (r.title as string) ?? "",
    locationId,
    locationName: locationId == null ? null : locationNames.get(locationId) ?? null,
    startsOn: r.starts_on as string,
    endsOn: r.ends_on as string,
    amount: num(r.amount),
    status: ((r.status as string) ?? "draft") as CzBudgetStatus,
    submittedBy: (r.submitted_by as string | null) ?? null,
    submittedAt: (r.submitted_at as string | null) ?? null,
    decidedByPersonId: (r.decided_by_person_id as number | null) ?? null,
    decidedBy: (r.decided_by as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
    decisionNote: (r.decision_note as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

async function locationNames(): Promise<Map<number, string>> {
  const { data } = await sb.from("cz_stock_locations").select("id,name");
  return new Map((data ?? []).map((r) => [r.id as number, r.name as string]));
}

export async function listBudgets(): Promise<CzBudget[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  const [{ data, error }, names] = await Promise.all([
    sb.from("cz_budgets").select(BUDGET_COLS).eq("company_id", company.id)
      .order("starts_on", { ascending: false }).order("id", { ascending: false }),
    locationNames(),
  ]);
  // ⚠️ Said out loud — an empty list and a failed query look identical on a
  // screen, and only one of them is true.
  if (error) console.error("[cocozuri] listBudgets failed:", error.message);
  return (data ?? []).map((r) => toBudget(r as Record<string, unknown>, names));
}

export type BudgetInput = {
  title: string;
  locationId?: number | null;
  startsOn: string;
  endsOn: string;
  amount: number;
  notes?: string | null;
};

export async function createBudget(input: BudgetInput, by = "web-ui"): Promise<{ ok: boolean; id?: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const bad = budgetProblems(input);
  if (bad) return { ok: false, error: bad };

  const { data, error } = await sb.from("cz_budgets").insert({
    company_id: company.id,
    title: input.title.trim(),
    location_id: input.locationId ?? null,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    amount: input.amount,
    notes: input.notes?.trim() || null,
    created_by: by,
    updated_at: NOW(),
  }).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id as number | undefined };
}

/**
 * Change a budget.
 *
 * ⚠️ AN APPROVED BUDGET IS NOT EDITED. Somebody has put their name to a figure
 * and purchases have been measured against it; moving the goalposts afterwards
 * would rewrite what was approved without anybody deciding to. Reopen it first
 * — which is itself recorded, and clears the approval.
 */
export async function updateBudget(id: number, input: Partial<BudgetInput>): Promise<{ ok: boolean; error?: string }> {
  const current = await budgetById(id);
  if (!current) return { ok: false, error: "That budget does not exist." };
  if (current.status === "approved") {
    return { ok: false, error: `"${current.title}" has been approved. Reopen it before changing the figure — the approval is somebody's name against an amount.` };
  }
  const merged = {
    title: input.title ?? current.title,
    locationId: input.locationId !== undefined ? input.locationId : current.locationId,
    startsOn: input.startsOn ?? current.startsOn,
    endsOn: input.endsOn ?? current.endsOn,
    amount: input.amount ?? current.amount,
  };
  const bad = budgetProblems(merged);
  if (bad) return { ok: false, error: bad };

  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.locationId !== undefined) patch.location_id = input.locationId;
  if (input.startsOn !== undefined) patch.starts_on = input.startsOn;
  if (input.endsOn !== undefined) patch.ends_on = input.endsOn;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  const { error } = await sb.from("cz_budgets").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Decide a budget — approve it, or turn it down.
 *
 * ⚠️ THE OWNER ASKED FOR THIS EXPLICITLY: "someone approves a budget" (plan
 * §5a). So it is a NAMED STEP WITH A PERSON AND A MOMENT, never a boolean.
 * "Approved" with nobody's name on it answers no question worth asking, and the
 * one question a budget exists to answer is who said the money could be spent.
 *
 * ⚠️ THE NAME IS STORED AS WELL AS THE ID, because a person may leave and the
 * decision still happened. The foreign key is ON DELETE SET NULL for the same
 * reason.
 *
 * ⚠️ A REFUSAL MUST SAY WHY. An amount somebody asked for and was turned down
 * on, with no reason, is a conversation that has to happen all over again.
 */
export async function decideBudget(
  id: number,
  decision: "approved" | "rejected",
  who: { personId?: number | null; name?: string | null },
  note?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const budget = await budgetById(id);
  if (!budget) return { ok: false, error: "That budget does not exist." };
  if (budget.status === "closed") return { ok: false, error: `"${budget.title}" is closed.` };

  const name = (who.name ?? "").trim() || (who.personId != null ? await personName(who.personId) : null);
  if (!name) {
    return { ok: false, error: "Say who is approving this. An approval with nobody's name on it is not an approval." };
  }
  if (decision === "rejected" && !note?.trim()) {
    return { ok: false, error: "Say why it was turned down — otherwise the same request simply comes back." };
  }

  const { error } = await sb.from("cz_budgets").update({
    status: decision,
    decided_by_person_id: who.personId ?? null,
    decided_by: name,
    decided_at: NOW(),
    decision_note: note?.trim() || null,
    updated_at: NOW(),
  }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Put a decided budget back to draft.
 *
 * ⚠️ THE DECISION IS CLEARED, NOT HIDDEN. Leaving the old approver's name on a
 * budget that has since been reopened and changed would have somebody's name
 * against a figure they never saw.
 */
export async function reopenBudget(id: number, reason?: string | null): Promise<{ ok: boolean; error?: string }> {
  const budget = await budgetById(id);
  if (!budget) return { ok: false, error: "That budget does not exist." };
  const { error } = await sb.from("cz_budgets").update({
    status: "draft",
    decided_by_person_id: null,
    decided_by: null,
    decided_at: null,
    decision_note: reason?.trim() || null,
    updated_at: NOW(),
  }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function closeBudget(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from("cz_budgets").update({ status: "closed", updated_at: NOW() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * ⚠️ A BUDGET WITH PURCHASES AGAINST IT CANNOT BE DELETED. It is the record of
 * a decision, and the purchases point at it. Close it instead — the same answer
 * archive gives everywhere else in COS.
 */
export async function deleteBudget(id: number): Promise<{ ok: boolean; error?: string }> {
  const { count } = await sb.from("cz_purchases").select("id", { count: "exact", head: true }).eq("budget_id", id);
  if ((count ?? 0) > 0) {
    return { ok: false, error: `${count} purchase${count === 1 ? " is" : "s are"} charged to this budget. Close it rather than removing it — the spending happened.` };
  }
  const { error } = await sb.from("cz_budgets").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

function budgetProblems(b: { title: string; startsOn: string; endsOn: string; amount: number }): string | null {
  if (!b.title.trim()) return "A budget needs a name — what is the money for.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(b.endsOn)) {
    return "A budget needs a start and an end date.";
  }
  if (b.endsOn < b.startsOn) return "The budget ends before it starts.";
  if (!Number.isFinite(b.amount) || b.amount <= 0) return "A budget needs an amount.";
  return null;
}

async function budgetById(id: number): Promise<CzBudget | null> {
  const { data } = await sb.from("cz_budgets").select(BUDGET_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  return toBudget(data as Record<string, unknown>, await locationNames());
}

async function personName(personId: number): Promise<string | null> {
  const { data } = await sb.from("people").select("name").eq("id", personId).maybeSingle();
  return (data?.name as string | null) ?? null;
}

/**
 * The lists the buying screens need to offer a choice rather than a text box.
 *
 * ⚠️ PEOPLE ARE OFFERED, NOT REQUIRED. Who approved it and who paid for it are
 * both free text underneath, because the person who bought the flour may not be
 * on the payroll at all — the owner was explicit that raw materials are often
 * bought "at random or self-bought", and a form that only accepts a member of
 * staff simply will not be filled in.
 */
export async function buyChoices(): Promise<{
  vendors: { id: number; name: string }[];
  people: { id: number; name: string }[];
}> {
  const [{ data: v }, { data: p }] = await Promise.all([
    sb.from("vendors").select("id,name").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  return {
    vendors: (v ?? []).map((r) => ({ id: r.id as number, name: r.name as string })),
    people: (p ?? []).map((r) => ({ id: r.id as number, name: r.name as string })),
  };
}

/* ============================= purchases ============================= */

/** ⚠️ ONE STRING LITERAL — see the note on BUDGET_COLS. */
const PURCHASE_COLS = "id,reference,purchased_on,location_id,vendor_id,supplier_name,supplier_ref,budget_id,paid_from,paid_by_person_id,paid_by,currency,ex_rate,vat_rate,tax_inclusive,freight_amount,freight_note,status,approved_by_person_id,approved_by,approved_at,approval_note,cancelled_at,cancel_reason,notes";

const LINE_COLS = "id,purchase_id,line_no,item_id,description,qty,uom,unit_price,expires_on";

function toLine(r: Record<string, unknown>): CzPurchaseLine {
  return {
    id: r.id as number,
    lineNo: (r.line_no as number) ?? 1,
    itemId: r.item_id as number,
    description: (r.description as string) ?? "",
    qty: num(r.qty),
    uom: (r.uom as string) || "PCS",
    unitPrice: num(r.unit_price),
    expiresOn: (r.expires_on as string | null) ?? null,
  };
}

/**
 * The next lot number for goods bought in — `LOT-2608-01`.
 *
 * ⚠️ ALLOCATED, NEVER TYPED, like every other number in this module. It shares
 * `cz_batches` with what the kitchen makes, so a lot and a batch can never
 * collide and one trace query reads both.
 */
async function allocateLotNo(companyId: number, onDate: string): Promise<string> {
  const prefix = `LOT-${onDate.slice(2, 4)}${onDate.slice(5, 7)}-`;
  const { data } = await sb.from("cz_batches").select("batch_no")
    .eq("company_id", companyId).like("batch_no", `${prefix}%`);
  let max = 0;
  for (const r of data ?? []) {
    const tail = Number(String(r.batch_no).slice(prefix.length));
    if (Number.isFinite(tail) && tail > max) max = tail;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

function toPurchase(
  r: Record<string, unknown>,
  lines: CzPurchaseLine[],
  names: { locations: Map<number, string>; vendors: Map<number, string> },
): CzPurchase {
  const locationId = r.location_id as number;
  const vendorId = (r.vendor_id as number | null) ?? null;
  return {
    id: r.id as number,
    reference: (r.reference as string) ?? "",
    purchasedOn: r.purchased_on as string,
    locationId,
    locationName: names.locations.get(locationId) ?? null,
    vendorId,
    vendorName: vendorId == null ? null : names.vendors.get(vendorId) ?? null,
    supplierName: (r.supplier_name as string | null) ?? null,
    supplierRef: (r.supplier_ref as string | null) ?? null,
    budgetId: (r.budget_id as number | null) ?? null,
    paidFrom: ((r.paid_from as string) ?? "credit") as CzPaidFrom,
    paidByPersonId: (r.paid_by_person_id as number | null) ?? null,
    paidBy: (r.paid_by as string | null) ?? null,
    currency: (r.currency as string) || "TZS",
    exRate: r.ex_rate == null ? null : num(r.ex_rate),
    vatRate: num(r.vat_rate),
    // ⚠️ THREE-STATE, and `?? null` rather than `?? false`. "Nobody has said"
    // is not "no" — see `purchaseTotals`.
    taxInclusive: (r.tax_inclusive as boolean | null) ?? null,
    freightAmount: num(r.freight_amount),
    freightNote: (r.freight_note as string | null) ?? null,
    status: ((r.status as string) ?? "draft") as CzPurchase["status"],
    approvedByPersonId: (r.approved_by_person_id as number | null) ?? null,
    approvedBy: (r.approved_by as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    approvalNote: (r.approval_note as string | null) ?? null,
    cancelledAt: (r.cancelled_at as string | null) ?? null,
    cancelReason: (r.cancel_reason as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    lines,
  };
}

async function vendorNames(): Promise<Map<number, string>> {
  const { data } = await sb.from("vendors").select("id,name");
  return new Map((data ?? []).map((r) => [r.id as number, r.name as string]));
}

/**
 * Every purchase, with its lines.
 *
 * ⚠️ TWO QUERIES, NOT ONE PER ROW. The lines are fetched in a single `in`, the
 * same reason `booksStateFor` does it — a list of a hundred purchases asking
 * for lines a hundred times is how a page that felt instant stops being one.
 */
export async function listPurchases(opts?: { status?: CzPurchase["status"] }): Promise<CzPurchase[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_purchases").select(PURCHASE_COLS).eq("company_id", company.id);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q.order("purchased_on", { ascending: false }).order("id", { ascending: false });
  if (error) {
    console.error("[cocozuri] listPurchases failed:", error.message);
    return [];
  }
  const rows = data ?? [];
  const ids = rows.map((r) => r.id as number);
  const [{ data: lineRows }, locations, vendors] = await Promise.all([
    ids.length
      ? sb.from("cz_purchase_lines").select(LINE_COLS).in("purchase_id", ids).order("line_no")
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    locationNames(),
    vendorNames(),
  ]);
  const byPurchase = new Map<number, CzPurchaseLine[]>();
  for (const r of (lineRows ?? []) as Record<string, unknown>[]) {
    const key = r.purchase_id as number;
    const bucket = byPurchase.get(key);
    if (bucket) bucket.push(toLine(r));
    else byPurchase.set(key, [toLine(r)]);
  }
  return rows.map((r) =>
    toPurchase(r as Record<string, unknown>, byPurchase.get(r.id as number) ?? [], { locations, vendors }));
}

export async function getPurchase(id: number): Promise<CzPurchase | null> {
  const company = await cocozuriCompany();
  if (!company) return null;
  const { data } = await sb.from("cz_purchases").select(PURCHASE_COLS)
    .eq("company_id", company.id).eq("id", id).maybeSingle();
  if (!data) return null;
  const [{ data: lineRows }, locations, vendors] = await Promise.all([
    sb.from("cz_purchase_lines").select(LINE_COLS).eq("purchase_id", id).order("line_no"),
    locationNames(),
    vendorNames(),
  ]);
  return toPurchase(
    data as Record<string, unknown>,
    ((lineRows ?? []) as Record<string, unknown>[]).map(toLine),
    { locations, vendors },
  );
}

export type PurchaseLineInput = {
  itemId: number;
  description?: string | null;
  qty: number;
  uom?: string | null;
  unitPrice: number;
  /** ⚠️ Stage 9 — what the supplier printed on the bag. Optional, always: a form
   *  that insists on a date nobody has is a form somebody works around by not
   *  recording the delivery at all. */
  expiresOn?: string | null;
};

export type PurchaseInput = {
  purchasedOn: string;
  locationId: number;
  /** ⚠️ OPTIONAL, AND IT MUST STAY OPTIONAL — see the file header and plan §5a. */
  vendorId?: number | null;
  supplierName?: string | null;
  supplierRef?: string | null;
  budgetId?: number | null;
  paidFrom?: CzPaidFrom;
  paidByPersonId?: number | null;
  paidBy?: string | null;
  vatRate?: number;
  taxInclusive?: boolean | null;
  freightAmount?: number;
  freightNote?: string | null;
  notes?: string | null;
  lines: PurchaseLineInput[];
};

/**
 * Record something that was bought.
 *
 * ⚠️ IT LANDS AS A DRAFT, AND A DRAFT MOVES NOTHING. Stock does not go up and
 * nothing reaches the books until somebody approves it — note #47, "after
 * approval". That is also what makes it safe to type a purchase the moment the
 * flour is carried through the door, before anybody has checked the figures.
 *
 * ⚠️ THE DESCRIPTION IS FROZEN off the item as it is now, exactly as an invoice
 * line is. A purchase should print what was true the day it was made, whatever
 * the item is renamed to afterwards.
 */
export async function createPurchase(input: PurchaseInput, by = "web-ui"): Promise<{ ok: boolean; id?: number; reference?: string; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchasedOn)) return { ok: false, error: "A purchase needs a date." };
  if (!input.locationId) return { ok: false, error: "Say where the goods went — every stock movement needs a place." };
  const lines = (input.lines ?? []).filter((l) => l.itemId && Number(l.qty) > 0);
  if (lines.length === 0) return { ok: false, error: "Nothing has been listed as bought." };

  // The wording, and the unit, taken off the items as they stand today.
  const items = await listItems({ locationId: input.locationId });
  const byId = new Map(items.map((i) => [i.id, i]));
  const stray = lines.find((l) => !byId.has(l.itemId));
  if (stray) {
    return { ok: false, error: "One of the lines is for an item that is not on that location's list." };
  }

  const series = "PUR-";
  const { data: taken } = await sb.from("cz_purchases").select("reference").eq("company_id", company.id);
  const existing = (taken ?? []).map((r) => r.reference as string);
  /* ⚠️ THE FLOOR IS A STRING, AND ITS LENGTH IS THE PADDING. `nextInSeries`
     normally takes the width from the numbers already used — but the FIRST
     document in a series has none to look at, which is how the first credit
     note came out `CZ-CN/1` against the paper `CZ-CN/01`. There is no paper
     series to honour here, so "0000" simply says: start at one, pad to four.
     The setting overrides it, as it does for every other series. */
  const floor = (await seriesFloor())[series] ?? "0000";

  // ⚠️ Retried against the unique index rather than trusted. Two people
  // recording a delivery at the same moment is exactly the case a MAX+1 misses.
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = nextInSeries(series, existing, floor);
    const { data, error } = await sb.from("cz_purchases").insert({
      company_id: company.id,
      reference,
      purchased_on: input.purchasedOn,
      location_id: input.locationId,
      vendor_id: input.vendorId ?? null,
      supplier_name: input.supplierName?.trim() || null,
      supplier_ref: input.supplierRef?.trim() || null,
      budget_id: input.budgetId ?? null,
      paid_from: input.paidFrom ?? "credit",
      paid_by_person_id: input.paidByPersonId ?? null,
      paid_by: input.paidBy?.trim() || null,
      vat_rate: input.vatRate ?? 0,
      tax_inclusive: input.taxInclusive ?? null,
      freight_amount: input.freightAmount ?? 0,
      freight_note: input.freightNote?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: by,
      updated_at: NOW(),
    }).select("id").maybeSingle();

    if (error) {
      if (error.code === "23505") { existing.push(reference); continue; }
      return { ok: false, error: error.message };
    }
    const id = data?.id as number;
    const written = await writeLines(company.id, id, lines, byId);
    if (!written.ok) return written;
    /* ⚠️ "A draft moves nothing" is said here for the same reason approval says
       the opposite. Note #47: approval is the moment a purchase counts, and a
       timeline that read "purchase recorded" would suggest the shelf had already
       changed. */
    void recordEvent({
      subjectType: "purchase", subjectId: id, subjectRef: reference,
      kind: "created",
      summary: `Typed up as a draft — ${lines.length} line${lines.length === 1 ? "" : "s"}. Nothing is on the shelf until it is approved.`,
    }, by);
    return { ok: true, id, reference };
  }
  return { ok: false, error: "Could not allocate a reference for this purchase." };
}

/**
 * Change a purchase.
 *
 * ⚠️ ONLY A DRAFT. Once it is approved the stock has moved and the books may
 * have it; correcting it then means cancelling — which reverses the movements —
 * and recording it again. Same rule as an issued invoice.
 */
export async function updatePurchase(id: number, input: Partial<PurchaseInput>, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const current = await getPurchase(id);
  if (!current) return { ok: false, error: "That purchase does not exist." };
  if (current.status !== "draft") {
    return {
      ok: false,
      error: `${current.reference} has been ${current.status}. Cancel it and record it again — the stock has already moved.`,
    };
  }
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.purchasedOn !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchasedOn)) return { ok: false, error: "A purchase needs a date." };
    patch.purchased_on = input.purchasedOn;
  }
  if (input.locationId !== undefined) patch.location_id = input.locationId;
  if (input.vendorId !== undefined) patch.vendor_id = input.vendorId;
  if (input.supplierName !== undefined) patch.supplier_name = input.supplierName?.trim() || null;
  if (input.supplierRef !== undefined) patch.supplier_ref = input.supplierRef?.trim() || null;
  if (input.budgetId !== undefined) patch.budget_id = input.budgetId;
  if (input.paidFrom !== undefined) patch.paid_from = input.paidFrom;
  if (input.paidByPersonId !== undefined) patch.paid_by_person_id = input.paidByPersonId;
  if (input.paidBy !== undefined) patch.paid_by = input.paidBy?.trim() || null;
  if (input.vatRate !== undefined) patch.vat_rate = input.vatRate;
  if (input.taxInclusive !== undefined) patch.tax_inclusive = input.taxInclusive;
  if (input.freightAmount !== undefined) patch.freight_amount = input.freightAmount;
  if (input.freightNote !== undefined) patch.freight_note = input.freightNote?.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { error } = await sb.from("cz_purchases").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (input.lines) {
    const lines = input.lines.filter((l) => l.itemId && Number(l.qty) > 0);
    if (lines.length === 0) return { ok: false, error: "Nothing has been listed as bought." };
    const locationId = (input.locationId ?? current.locationId);
    const items = await listItems({ locationId });
    const byId = new Map(items.map((i) => [i.id, i]));
    if (lines.some((l) => !byId.has(l.itemId))) {
      return { ok: false, error: "One of the lines is for an item that is not on that location's list." };
    }
    await sb.from("cz_purchase_lines").delete().eq("purchase_id", id);
    const written = await writeLines(company.id, id, lines, byId);
    if (!written.ok) return written;
  }
  void recordEvent({
    subjectType: "purchase", subjectId: id, subjectRef: current.reference,
    kind: "updated",
    summary: input.lines ? "Changed, lines included. Still a draft." : "Changed. Still a draft.",
  }, by);
  return { ok: true };
}

async function writeLines(
  companyId: number,
  purchaseId: number,
  lines: PurchaseLineInput[],
  items: Map<number, { name: string; uom: string }>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from("cz_purchase_lines").insert(
    lines.map((l, i) => ({
      company_id: companyId,
      purchase_id: purchaseId,
      line_no: i + 1,
      item_id: l.itemId,
      description: l.description?.trim() || items.get(l.itemId)?.name || "",
      qty: Number(l.qty),
      uom: l.uom?.trim() || items.get(l.itemId)?.uom || "PCS",
      unit_price: Number(l.unitPrice) || 0,
      expires_on: l.expiresOn || null,
    })),
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * **Approve a purchase — and that is what puts it on the shelf.**
 *
 * ⚠️ APPROVAL IS THE MOMENT IT COUNTS (note #47). Before it, the purchase is a
 * piece of paper; after it, the stock ledger has a `receipt` movement per line
 * carrying its LANDED unit cost — what the thing cost including its share of
 * getting it here. That is why freight is on the document rather than an
 * expense typed somewhere else: a bag of almonds that does not carry its own
 * freight makes every batch costed from it cheaper than the truth.
 *
 * ⚠️ IT REFUSES TO GO OVER AN APPROVED BUDGET WITHOUT BEING TOLD TO. Not
 * because overspending is impossible — the flour was bought, it is on the
 * shelf — but because it must be a decision somebody makes rather than a
 * number that quietly appears. Same shape as `recordCount` refusing a variance
 * nobody has explained.
 *
 * ⚠️ AND IT REFUSES A BUDGET NOBODY HAS APPROVED. Measuring spend against a
 * figure that is still a draft would be measuring against a wish.
 */
export async function approvePurchase(
  id: number,
  who: { personId?: number | null; name?: string | null },
  opts?: { note?: string | null; acknowledgeOverBudget?: boolean },
  by = "web-ui",
): Promise<{ ok: boolean; error?: string; overBy?: number }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const purchase = await getPurchase(id);
  if (!purchase) return { ok: false, error: "That purchase does not exist." };
  if (purchase.status === "approved") return { ok: false, error: `${purchase.reference} is already approved.` };
  if (purchase.status === "cancelled") return { ok: false, error: `${purchase.reference} was cancelled.` };

  const blockers = purchaseBlockers(purchase);
  if (blockers.length) return { ok: false, error: blockers[0] };

  const name = (who.name ?? "").trim() || (who.personId != null ? await personName(who.personId) : null);
  if (!name) {
    return { ok: false, error: "Say who is approving this. An approval with nobody's name on it is not an approval." };
  }

  const totals = purchaseTotals(purchase.lines, purchase.vatRate, purchase.taxInclusive, purchase.freightAmount);

  if (purchase.budgetId != null) {
    const budget = await budgetById(purchase.budgetId);
    if (!budget) return { ok: false, error: "The budget this is charged to no longer exists." };
    if (budget.status !== "approved") {
      return { ok: false, error: `"${budget.title}" has not been approved — it is a ${budget.status}. A budget nobody has approved is not a budget.` };
    }
    if (purchase.purchasedOn < budget.startsOn || purchase.purchasedOn > budget.endsOn) {
      return { ok: false, error: `${purchase.reference} is dated ${purchase.purchasedOn}, outside "${budget.title}" (${budget.startsOn} to ${budget.endsOn}).` };
    }
    if (budget.locationId != null && budget.locationId !== purchase.locationId) {
      return { ok: false, error: `"${budget.title}" covers ${budget.locationName ?? "another place"} only.` };
    }
    const usage = budgetUsage(budget, await listPurchases());
    const after = usage.spent + totals.payable;
    if (after > budget.amount + 0.005 && !opts?.acknowledgeOverBudget) {
      return {
        ok: false,
        overBy: Math.round((after - budget.amount) * 100) / 100,
        error: `This takes "${budget.title}" past its ${budget.amount.toLocaleString("en-GB")} by ${Math.round(after - budget.amount).toLocaleString("en-GB")}. That is allowed — the goods were bought — but somebody has to say so.`,
      };
    }
  }

  /* ⚠️ THE STOCK MOVES ARE WRITTEN FIRST, AND THE STATUS ONLY IF THEY LANDED.
     The other order leaves a purchase marked approved with nothing on the shelf
     — a lie the ledger can never be talked out of, because there is no
     transaction here to fall back on. `postStockMove` writes every line in one
     statement, so the ledger cannot hold half a delivery either. */
  const costed = landedLines(purchase.lines, purchase.vatRate, purchase.taxInclusive, purchase.freightAmount);

  /* ⚠️ STAGE 9 — A DATED DELIVERY BECOMES A LOT. A line that says when the bag
     goes off gets its own `cz_batches` row (`source: "purchase"`), and the
     receipt movement carries it. That is the ONLY way a bar can later inherit
     "the earliest ingredient, whichever is sooner", and the only way a supplier
     saying "that batch was bad" can be answered with a list.

     ⚠️ A LINE WITH NO EXPIRY GETS NO LOT, exactly as before. Nobody is forced to
     type a date they do not have — a form that insists is a form somebody works
     around by not recording the delivery at all. */
  const lotByLine = new Map<number, number>();
  for (const c of costed) {
    if (!c.line.expiresOn) continue;
    const lotNo = await allocateLotNo(company.id, purchase.purchasedOn);
    const { data: lot } = await sb.from("cz_batches").insert({
      company_id: company.id,
      item_id: c.line.itemId,
      batch_no: lotNo,
      made_on: purchase.purchasedOn,
      expires_on: c.line.expiresOn,
      status: "closed",
      source: "purchase",
      purchase_line_id: c.line.id,
      location_id: purchase.locationId,
      produced_qty: c.line.qty,
      created_by: by,
      updated_at: NOW(),
    }).select("id").maybeSingle();
    if (lot?.id != null) lotByLine.set(c.line.id, lot.id as number);
  }

  const res = await postStockMove(
    costed.map((c) => ({
      itemId: c.line.itemId,
      locationId: purchase.locationId,
      onDate: purchase.purchasedOn,
      qty: c.line.qty,
      reason: "receipt" as const,
      unitCost: c.unitCost,
      batchId: lotByLine.get(c.line.id) ?? null,
      note: purchase.reference,
    })),
    { type: PURCHASE_VOUCHER, id: purchase.id },
    by,
  );
  if (!res.ok) {
    // ⚠️ The lots go too — a lot with no stock behind it would show up in FEFO
    // as chocolate that is not there.
    if (lotByLine.size) await sb.from("cz_batches").delete().in("id", [...lotByLine.values()]);
  }
  if (!res.ok) return { ok: false, error: res.error };

  const { error } = await sb.from("cz_purchases").update({
    status: "approved",
    approved_by_person_id: who.personId ?? null,
    approved_by: name,
    approved_at: NOW(),
    approval_note: opts?.note?.trim() || null,
    updated_at: NOW(),
  }).eq("id", id);
  if (error) {
    // The movements are in and the status is not. Take them straight back out
    // rather than leaving stock that no document explains.
    await reverseStockVoucher(PURCHASE_VOUCHER, purchase.id, purchase.purchasedOn, by);
    return { ok: false, error: error.message };
  }
  void recordEvent({
    subjectType: "purchase", subjectId: purchase.id, subjectRef: purchase.reference,
    kind: "approved",
    summary: `Approved by ${who.name?.trim() || "somebody"} — the delivery is on the shelf at its landed cost.`,
  }, by);
  return { ok: true };
}

/**
 * Cancel a purchase.
 *
 * ⚠️ AN APPROVED PURCHASE IS REVERSED, NEVER ERASED. Its `receipt` movements
 * stay in the stock ledger for ever and are answered by opposite ones, exactly
 * as `unpostVoucher` answers a general-ledger posting. A delivery that happened
 * and was later found to be wrong is still a thing that happened.
 *
 * ⚠️ AND IT REFUSES WHILE THE BOOKS STILL HOLD IT. Taking the stock out and
 * leaving the creditor standing would put the two ledgers out of step, silently.
 */
export async function cancelPurchase(
  id: number,
  reason: string | null,
  opts?: { postedInBooks?: boolean },
  by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const purchase = await getPurchase(id);
  if (!purchase) return { ok: false, error: "That purchase does not exist." };
  if (purchase.status === "cancelled") return { ok: false, error: `${purchase.reference} is already cancelled.` };

  if (purchase.status === "approved") {
    if (opts?.postedInBooks) {
      return { ok: false, error: `${purchase.reference} is in the general ledger. Take it back out of the books first — a reversal, not an erasure.` };
    }
    if (!reason?.trim()) {
      return { ok: false, error: "Say why. This takes the stock back off the shelf, and a movement with no reason is one nobody can check." };
    }
    const existing = await listMoves({ voucherType: PURCHASE_VOUCHER, voucherId: purchase.id });
    if (existing.length > 0) {
      const rev = await reverseStockVoucher(PURCHASE_VOUCHER, purchase.id, todayInDar(), by);
      if (!rev.ok) return { ok: false, error: rev.error };
    }
  }

  const { error } = await sb.from("cz_purchases").update({
    status: "cancelled",
    cancelled_at: NOW(),
    cancel_reason: reason?.trim() || null,
    updated_at: NOW(),
  }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  void recordEvent({
    subjectType: "purchase", subjectId: id, subjectRef: purchase.reference,
    kind: "cancelled",
    summary: `Cancelled${reason?.trim() ? `: ${reason.trim()}` : "."}${
      purchase.status === "approved" ? " What it put on the shelf was written back the opposite way." : ""}`,
  }, by);
  return { ok: true };
}

/**
 * ⚠️ ONLY A DRAFT CAN BE DELETED, and only because a draft never happened —
 * nothing moved, nothing posted, nobody put their name to it. Everything else
 * is cancelled, which leaves the record and its reversal on the file.
 */
export async function deletePurchase(id: number, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const purchase = await getPurchase(id);
  if (!purchase) return { ok: false, error: "That purchase does not exist." };
  if (purchase.status !== "draft") {
    return { ok: false, error: `${purchase.reference} has been ${purchase.status}. Cancel it instead — that leaves the record and reverses what it did.` };
  }
  const { error } = await sb.from("cz_purchases").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  /* ⚠️ The reference is frozen on the event, so this reads after the purchase
     is gone. Only a draft ever reaches here — a draft never happened. */
  void recordEvent({
    subjectType: "purchase", subjectId: null, subjectRef: purchase.reference,
    kind: "deleted",
    summary: `${purchase.reference} was deleted while still a draft. Nothing had moved and nothing had posted.`,
  }, by);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * From the order form to a purchase
 * ------------------------------------------------------------------ */

/**
 * Turn what the order form worked out into a purchase somebody can act on.
 *
 * ⚠️ THE ORDER FORM WAS A DEAD END. Its only action was `window.print()`: it
 * worked out what to buy from what actually went out, printed a sheet, and then
 * every line had to be typed again into a purchase by hand. The owner found it
 * himself — *"I see the list but how to create a new one?"* — because a screen
 * that computes an order and cannot raise one is not a stage in a flow, it is a
 * calculator somebody has to transcribe.
 *
 * ⚠️ IT LANDS AS A DRAFT, WHICH IS THE WHOLE POINT. A draft moves no stock and
 * reaches no books, so carrying a suggestion into one commits nothing: the
 * prices still have to be filled in and somebody still has to approve it. The
 * order form suggests; approval is what makes it true.
 *
 * ⚠️ THE PRICE IS THE LAST ONE ACTUALLY PAID, NOT A GUESS. Every line is
 * prefilled with the weighted-average landed cost from the stock ledger — the
 * same figure a recipe costs itself at — because that is a real number this
 * business has really paid. A material nobody has ever bought comes in at ZERO
 * and is REPORTED, never quietly invented: `approvePurchase` will not let a
 * nonsense price through, and neither should this.
 */
export async function purchaseFromOrderForm(
  input: { locationId: number; lines: { itemId: number; qty: number }[]; note?: string | null },
  by = "web-ui",
): Promise<{ ok: boolean; id?: number; reference?: string; unpriced?: string[]; error?: string }> {
  const clean = (input.lines ?? []).filter((l) => Number.isFinite(Number(l.qty)) && Number(l.qty) > 0);
  if (clean.length === 0) {
    return { ok: false, error: "Nothing is being ordered — type a quantity against at least one line." };
  }

  const [items, costs] = await Promise.all([
    listItems(),
    materialCosts(clean.map((l) => l.itemId)),
  ]);
  const byId = new Map(items.map((i) => [i.id, i] as const));

  const unpriced: string[] = [];
  const lines: PurchaseLineInput[] = clean.map((l) => {
    const item = byId.get(l.itemId);
    const unitCost = costs.get(l.itemId)?.unitCost ?? null;
    if (unitCost == null) unpriced.push(item?.name ?? `Item #${l.itemId}`);
    return {
      itemId: l.itemId,
      description: item?.name ?? null,
      qty: Number(l.qty),
      uom: item?.uom ?? null,
      unitPrice: unitCost ?? 0,
    };
  });

  const made = await createPurchase({
    purchasedOn: todayInDar(),
    locationId: input.locationId,
    notes: input.note?.trim() || "Raised from the order form.",
    lines,
  }, by);
  if (!made.ok) return { ok: false, error: made.error, unpriced };
  return { ok: true, id: made.id, reference: made.reference, unpriced };
}
