import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import { getPurchase, listPurchases } from "@/lib/cocozuri-buy";
import { purchaseTotals } from "@/lib/cocozuri-buy-shared";
import { todayInDar } from "@/lib/cocozuri-stock-shared";
import {
  leavesSomethingOwed, owedTo, owingRows, paymentBlockers,
  type CzOwing, type CzPayment,
} from "@/lib/cocozuri-pay-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 8 — money OUT. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ ONE DOOR FOR WRITES. The actions in `app/cocozuri/actions.ts` are thin
 * wrappers over the functions here, exactly as on the money-in side.
 *
 * ⚠️ AND THE RULES ARE THE RECEIPT'S RULES, MIRRORED, because they were right
 * the first time:
 *   · who is paid comes off the PURCHASE, never off the form;
 *   · one payment covering several purchases is ONE ROW EACH, sharing a date and
 *     a reference, ALL OR NOTHING — nothing ever sits "on account";
 *   · an overpayment is recorded as it stands and shown negative;
 *   · a posted payment cannot be deleted — reverse it first.
 *
 * ⚠️ ONE RULE IS NEW, AND IT IS THE IMPORTANT ONE: a purchase paid from the bank
 * or the cash box owes nothing. Stage 2 credited bank or cash the moment it was
 * bought, so "paying" it again would credit the bank twice.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** ⚠️ ONE STRING LITERAL — see the note in `cocozuri-buy.ts`. */
const PAY_COLS = "id,purchase_id,paid_on,amount,currency,method,reference,paid_from_company_id,notes";

async function context() {
  const [{ data: purchases }, { data: companies }] = await Promise.all([
    sb.from("cz_purchases").select("id,reference,paid_from,paid_by,vendor_id,supplier_name"),
    sb.from("companies").select("id,name"),
  ]);
  const { data: vendors } = await sb.from("vendors").select("id,name");
  const vendorName = new Map((vendors ?? []).map((v) => [v.id as number, v.name as string]));
  return {
    purchaseRef: new Map((purchases ?? []).map((p) => [p.id as number, p.reference as string])),
    paidTo: new Map((purchases ?? []).map((p) => [
      p.id as number,
      owedTo({
        paidFrom: (p.paid_from as CzPaidFromLike) ?? "credit",
        paidBy: (p.paid_by as string | null) ?? null,
        vendorName: p.vendor_id == null ? null : vendorName.get(p.vendor_id as number) ?? null,
        supplierName: (p.supplier_name as string | null) ?? null,
      }),
    ])),
    companyName: new Map((companies ?? []).map((c) => [c.id as number, c.name as string])),
  };
}

type CzPaidFromLike = "credit" | "cash" | "bank" | "own_money";
type Ctx = Awaited<ReturnType<typeof context>>;

function toPayment(r: Record<string, unknown>, ctx: Ctx): CzPayment {
  const purchaseId = r.purchase_id as number;
  const from = (r.paid_from_company_id as number | null) ?? null;
  return {
    id: r.id as number,
    purchaseId,
    purchaseRef: ctx.purchaseRef.get(purchaseId) ?? null,
    paidTo: ctx.paidTo.get(purchaseId) ?? null,
    paidOn: r.paid_on as string,
    amount: num(r.amount),
    currency: (r.currency as string) ?? "TZS",
    method: (r.method as string | null) ?? null,
    reference: (r.reference as string | null) ?? null,
    paidFromCompanyId: from,
    paidFromName: from == null ? null : ctx.companyName.get(from) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

/* ------------------------------- reading ------------------------------- */

export async function listPayments(opts?: { purchaseId?: number }): Promise<CzPayment[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_payments").select(PAY_COLS).eq("company_id", company.id);
  if (opts?.purchaseId) q = q.eq("purchase_id", opts.purchaseId);
  const [{ data, error }, ctx] = await Promise.all([
    q.order("paid_on", { ascending: false }).order("id", { ascending: false }),
    context(),
  ]);
  // ⚠️ Said out loud — an empty list and a failed query look identical.
  if (error) {
    console.error("[cocozuri] listPayments failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => toPayment(r as Record<string, unknown>, ctx));
}

export async function getPayment(id: number): Promise<CzPayment | null> {
  const [{ data }, ctx] = await Promise.all([
    sb.from("cz_payments").select(PAY_COLS).eq("id", id).maybeSingle(),
    context(),
  ]);
  return data ? toPayment(data as Record<string, unknown>, ctx) : null;
}

/** What is still owed to suppliers and to people, worst first. */
export async function owingBook(): Promise<{ rows: CzOwing[]; total: number }> {
  const [purchases, payments] = await Promise.all([listPurchases(), listPayments()]);
  const rows = owingRows(purchases, payments, todayInDar());
  return { rows, total: Math.round(rows.reduce((t, r) => t + r.outstanding, 0) * 100) / 100 };
}

/* -------------------------------- writing ------------------------------- */

export type PaymentInput = {
  purchaseId: number;
  amount: number;
  paidOn?: string;
  method?: string | null;
  reference?: string | null;
  paidFromCompanyId?: number | null;
  notes?: string | null;
};

/**
 * Record money going out.
 *
 * ⚠️ IT REFUSES A PURCHASE THAT OWES NOTHING. Bought from the bank or the cash
 * box means it was settled the day it happened; a payment against it would
 * credit the bank a second time and leave the books short by the amount.
 *
 * ⚠️ AND IT REFUSES ANYTHING BUT AN APPROVED PURCHASE. A draft is somebody
 * thinking about it, and a cancelled one has already been reversed.
 */
export async function createPayment(
  input: PaymentInput, by = "web-ui",
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const res = await createPayments([input], by);
  return res.ok ? { ok: true, id: res.ids?.[0] } : { ok: false, error: res.error };
}

/**
 * **One cheque, several purchases — one row each, all or nothing.**
 *
 * ⚠️ THE SAME RULE AS THE MONEY-IN SIDE, and for the same reason: writing one
 * payment against four bills and leaving it unallocated is how money ends up
 * sitting "on account" while somebody chases a supplier who has been paid.
 * Either every line lands or none does.
 */
export async function createPayments(
  inputs: PaymentInput[], by = "web-ui",
): Promise<{ ok: boolean; ids?: number[]; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const clean = inputs.filter((i) => i.purchaseId && num(i.amount) !== 0);
  const paidOn = clean[0]?.paidOn || todayInDar();

  const purchases = await Promise.all(clean.map((i) => getPurchase(i.purchaseId)));
  const lines: { purchaseId: number; amount: number; payable: number; alreadyPaid: number }[] = [];

  for (let i = 0; i < clean.length; i++) {
    const p = purchases[i];
    const input = clean[i]!;
    if (!p) return { ok: false, error: "One of those purchases no longer exists." };
    if (p.status !== "approved") {
      return { ok: false, error: `${p.reference} is a ${p.status}. Only an approved purchase can be paid.` };
    }
    if (!leavesSomethingOwed(p.paidFrom)) {
      return {
        ok: false,
        error: `${p.reference} was paid straight from the ${p.paidFrom === "cash" ? "cash box" : "bank"} when it was bought, so nothing is owed on it.`,
      };
    }
    const t = purchaseTotals(p.lines, p.vatRate, p.taxInclusive, p.freightAmount);
    lines.push({ purchaseId: p.id, amount: num(input.amount), payable: t.payable, alreadyPaid: 0 });
  }

  const blockers = paymentBlockers({ lines, paidOn });
  if (blockers.length) return { ok: false, error: blockers[0] };

  const { data, error } = await sb.from("cz_payments").insert(
    clean.map((i) => ({
      company_id: company.id,
      purchase_id: i.purchaseId,
      paid_on: i.paidOn ? new Date(`${i.paidOn}T12:00:00`).toISOString() : NOW(),
      amount: num(i.amount),
      currency: "TZS",
      method: i.method?.trim() || null,
      reference: i.reference?.trim() || null,
      paid_from_company_id: i.paidFromCompanyId ?? null,
      notes: i.notes?.trim() || null,
      created_by: by,
      updated_at: NOW(),
    })),
  ).select("id");

  if (error) return { ok: false, error: error.message };
  return { ok: true, ids: (data ?? []).map((r) => r.id as number) };
}

export async function updatePayment(
  id: number, input: Partial<PaymentInput>,
): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.amount !== undefined) {
    if (num(input.amount) <= 0) return { ok: false, error: "A payment cannot be nil or negative." };
    patch.amount = num(input.amount);
  }
  if (input.paidOn !== undefined) patch.paid_on = new Date(`${input.paidOn}T12:00:00`).toISOString();
  if (input.method !== undefined) patch.method = input.method?.trim() || null;
  if (input.reference !== undefined) patch.reference = input.reference?.trim() || null;
  if (input.paidFromCompanyId !== undefined) patch.paid_from_company_id = input.paidFromCompanyId ?? null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { error } = await sb.from("cz_payments").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * ⚠️ IT REFUSES A POSTED PAYMENT. Once money has reached the general ledger the
 * ledger's second rule applies — it is reversed, never erased. The check is made
 * by the caller so this file never has to import the posting engine.
 */
export async function deletePayment(
  id: number, opts?: { postedInBooks?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (opts?.postedInBooks) {
    return { ok: false, error: "That payment is in the general ledger. Take it back out of the books first — a reversal, not an erasure." };
  }
  const { error } = await sb.from("cz_payments").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
