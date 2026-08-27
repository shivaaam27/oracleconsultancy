import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import { lotsOfProducts } from "@/lib/cocozuri-trace";
import { allocateFefoMany, type CzLot } from "@/lib/cocozuri-trace-shared";
import { despatchBlockers, type CzDespatchLine, type CzDespatchLot } from "@/lib/cocozuri-despatch-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri — which lots an invoice despatched. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ NOTHING HERE WRITES A STOCK MOVEMENT, AND THAT IS DELIBERATE, NOT AN
 * OVERSIGHT. An invoice has never moved stock in CocoZuri: the day sheet's
 * `day_out` is what takes finished goods off the shelf. Posting movements from
 * an invoice as well would take the same chocolate off twice, and the shelf
 * would drift further from the truth with every invoice raised.
 *
 * What this closes is the OTHER half of the recall question. The stock ledger
 * can say a lot left the building; only the invoice can say WHO GOT IT. An
 * invoice line names a product, so until now that answer did not exist anywhere.
 *
 * ⚠️ IT IS RECORDED AT ISSUE, because that is the moment the paperwork stops
 * being a draft — and it is CORRECTABLE afterwards, because the lots are a best
 * reading of a shelf and the person who loaded the van knows better.
 * ------------------------------------------------------------------ */

const num = (v: unknown) => (v == null ? 0 : Number(v));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** ⚠️ ONE STRING LITERAL — a split one widens to `string`. */
const LOT_COLS = "id,company_id,invoice_id,line_id,batch_id,qty";

/* ------------------------------- reading ------------------------------- */

async function batchIndex() {
  const { data } = await sb.from("cz_batches").select("id,batch_no,expires_on");
  return new Map(((data ?? []) as Record<string, unknown>[]).map((b) => [
    b.id as number,
    { batchNo: (b.batch_no as string) ?? "", expiresOn: (b.expires_on as string | null) ?? null },
  ]));
}

/** What one invoice despatched, line by line. */
export async function despatchFor(invoiceId: number): Promise<CzDespatchLine[]> {
  const [{ data: lineRows }, { data: lotRows }, batches] = await Promise.all([
    sb.from("cz_invoice_lines").select("id,line_no,description,product_id,qty")
      .eq("invoice_id", invoiceId).order("line_no"),
    sb.from("cz_invoice_line_lots").select(LOT_COLS).eq("invoice_id", invoiceId),
    batchIndex(),
  ]);
  const byLine = new Map<number, CzDespatchLot[]>();
  for (const r of (lotRows ?? []) as Record<string, unknown>[]) {
    const key = r.line_id as number;
    const meta = batches.get(r.batch_id as number);
    const lot: CzDespatchLot = {
      batchId: r.batch_id as number,
      batchNo: meta?.batchNo ?? `Lot #${r.batch_id}`,
      expiresOn: meta?.expiresOn ?? null,
      qty: num(r.qty),
    };
    const bucket = byLine.get(key);
    if (bucket) bucket.push(lot); else byLine.set(key, [lot]);
  }
  return ((lineRows ?? []) as Record<string, unknown>[]).map((r) => ({
    lineId: r.id as number,
    lineNo: (r.line_no as number) ?? 1,
    description: (r.description as string) ?? "",
    productId: (r.product_id as number | null) ?? null,
    qty: num(r.qty),
    lots: (byLine.get(r.id as number) ?? []).sort((a, b) =>
      (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999") || a.batchId - b.batchId),
  }));
}

/**
 * **The recall answer.** Which invoices carried a lot, and to whom.
 *
 * ⚠️ THIS IS THE QUESTION THE STOCK LEDGER CANNOT ANSWER. It can say a lot left
 * the kitchen; only the invoice can say it went to Garden Market. On the day
 * somebody has to ring round, this is the list they ring.
 */
export async function invoicesCarrying(batchNo: string): Promise<{
  number: string; customerName: string | null; issueDate: string; status: string;
  description: string; qty: number;
}[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  const { data: batch } = await sb.from("cz_batches")
    .select("id").eq("company_id", company.id).eq("batch_no", batchNo).maybeSingle();
  if (!batch) return [];

  const { data: lots } = await sb.from("cz_invoice_line_lots")
    .select(LOT_COLS).eq("batch_id", batch.id as number);
  const rows = (lots ?? []) as Record<string, unknown>[];
  if (!rows.length) return [];

  const [{ data: invoices }, { data: lines }] = await Promise.all([
    sb.from("cz_invoices").select("id,number,customer_name,issue_date,status")
      .in("id", [...new Set(rows.map((r) => r.invoice_id as number))]),
    sb.from("cz_invoice_lines").select("id,description")
      .in("id", [...new Set(rows.map((r) => r.line_id as number))]),
  ]);
  const invoiceById = new Map(((invoices ?? []) as Record<string, unknown>[]).map((i) => [i.id as number, i]));
  const lineById = new Map(((lines ?? []) as Record<string, unknown>[]).map((l) => [l.id as number, l]));

  return rows
    .map((r) => {
      const inv = invoiceById.get(r.invoice_id as number);
      return {
        number: (inv?.number as string) ?? `Invoice #${r.invoice_id}`,
        customerName: (inv?.customer_name as string | null) ?? null,
        issueDate: (inv?.issue_date as string) ?? "",
        status: (inv?.status as string) ?? "",
        description: (lineById.get(r.line_id as number)?.description as string) ?? "",
        qty: num(r.qty),
      };
    })
    // ⚠️ Newest first — on a recall the recent ones are still on a shelf somewhere.
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || a.number.localeCompare(b.number));
}

/* ------------------------------- writing ------------------------------- */

/**
 * Work out which lots an invoice most likely sent, and write it down.
 *
 * ⚠️ FIRST EXPIRED, FIRST OUT, like everything else that takes stock off a shelf
 * — but read against what OTHER invoices have already claimed of each lot, not
 * against the raw shelf. An invoice moves no stock, so a lot's on-hand does not
 * fall when it is invoiced; without this, two invoices would each be told the
 * whole lot was theirs and a recall would name twice as much as ever existed.
 *
 * ⚠️ IT SUGGESTS, IT DOES NOT KNOW. The van was loaded by a person and this is a
 * reading of a shelf, so what it writes is correctable and every screen showing
 * it says where it came from. A line it cannot cover is left SHORT rather than
 * padded — "no lot recorded" is a true statement and an invented lot is not.
 *
 * ⚠️ AND IT NEVER OVERWRITES. Called again on an invoice that already has a
 * despatch it leaves it alone: a second call is an issue being retried or a page
 * refreshed, not somebody asking for the shelf to be read again.
 */
export async function recordDespatch(
  invoiceId: number,
): Promise<{ ok: boolean; written: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, written: 0, error: "Cocozuri is not in the company list." };

  const { data: already } = await sb.from("cz_invoice_line_lots")
    .select("id").eq("invoice_id", invoiceId).limit(1);
  if ((already ?? []).length) return { ok: true, written: 0 };

  const { data: lineRows } = await sb.from("cz_invoice_lines")
    .select("id,line_no,product_id,qty").eq("invoice_id", invoiceId).order("line_no");
  const lines = ((lineRows ?? []) as Record<string, unknown>[])
    .map((r) => ({
      id: r.id as number,
      productId: (r.product_id as number | null) ?? null,
      qty: num(r.qty),
    }))
    .filter((l) => l.productId != null && l.qty > 0);
  // A one-off line with no product has no lots to find, and that is not a fault.
  if (!lines.length) return { ok: true, written: 0 };

  const [byProduct, claimed] = await Promise.all([
    lotsOfProducts(lines.map((l) => l.productId!)),
    claimedByOtherInvoices(invoiceId),
  ]);

  // ⚠️ What each lot has left to give AFTER every other invoice has had its say.
  const shelf = new Map<number, CzLot[]>();
  for (const l of lines) {
    if (shelf.has(l.productId!)) continue;
    shelf.set(l.productId!, (byProduct.get(l.productId!) ?? []).map((lot) => ({
      ...lot,
      onHand: round3(lot.onHand - (claimed.get(lot.batchId) ?? 0)),
    })));
  }

  /* ⚠️ Keyed by PRODUCT here, where every other caller keys by item — an invoice
     names a product, and `shelf` was built the same way. Two lines of one
     invoice naming the same product share the shelf, which is what
     `allocateFefoMany` decrementing is for. */
  const picked = allocateFefoMany(shelf, lines.map((l) => ({ itemId: l.productId!, need: l.qty })));
  const rows = lines.flatMap((l, i) =>
    (picked[i]?.picks ?? []).map((p) => ({
      company_id: company.id,
      invoice_id: invoiceId,
      line_id: l.id,
      batch_id: p.lot.batchId,
      qty: p.qty,
    })));
  if (!rows.length) return { ok: true, written: 0 };

  const { error } = await sb.from("cz_invoice_line_lots").insert(rows);
  if (error) return { ok: false, written: 0, error: error.message };
  return { ok: true, written: rows.length };
}

/** How much of each lot every OTHER invoice has already said it sent. */
async function claimedByOtherInvoices(exceptInvoiceId: number): Promise<Map<number, number>> {
  const { data } = await sb.from("cz_invoice_line_lots").select("invoice_id,batch_id,qty");
  const out = new Map<number, number>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    if ((r.invoice_id as number) === exceptInvoiceId) continue;
    const key = r.batch_id as number;
    out.set(key, round3((out.get(key) ?? 0) + num(r.qty)));
  }
  return out;
}

/**
 * Say what really went — correcting the suggestion.
 *
 * ⚠️ THE WHOLE LINE IS REPLACED, never merged. Merging would need a rule for
 * what an absent lot means, and "I did not mention it" and "it did not go" are
 * different claims that would be impossible to tell apart afterwards.
 *
 * ⚠️ AND IT WORKS ON AN ISSUED INVOICE, which is the one place this module bends
 * its own rule. An issued invoice's MONEY is never edited — that is what the
 * credit note is for. This is not money: it is a note of which lots went in the
 * van, and the person who loaded it usually knows a day later. Refusing would
 * mean the recall record could only ever be as good as a guess made at issue.
 */
export async function setDespatchLots(
  lineId: number,
  lots: { batchId: number; qty: number }[],
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const { data: line } = await sb.from("cz_invoice_lines")
    .select("id,invoice_id,qty,description").eq("id", lineId).maybeSingle();
  if (!line) return { ok: false, error: "That line no longer exists." };

  const clean = lots
    .filter((l) => l.batchId && Number.isFinite(Number(l.qty)) && Number(l.qty) > 0)
    .map((l) => ({ batchId: l.batchId, qty: round3(Number(l.qty)) }));

  const batches = await batchIndex();
  const blockers = despatchBlockers({
    qty: num(line.qty),
    lots: clean.map((l) => ({
      batchId: l.batchId,
      batchNo: batches.get(l.batchId)?.batchNo ?? `Lot #${l.batchId}`,
      expiresOn: batches.get(l.batchId)?.expiresOn ?? null,
      qty: l.qty,
    })),
  });
  if (blockers.length) return { ok: false, error: blockers[0] };

  const { error: delErr } = await sb.from("cz_invoice_line_lots").delete().eq("line_id", lineId);
  if (delErr) return { ok: false, error: delErr.message };
  if (!clean.length) return { ok: true };

  const { error } = await sb.from("cz_invoice_line_lots").insert(
    clean.map((l) => ({
      company_id: company.id,
      invoice_id: line.invoice_id as number,
      line_id: lineId,
      batch_id: l.batchId,
      qty: l.qty,
    })),
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** The lots a line could plausibly have sent, for the correction form. */
export async function despatchChoices(invoiceId: number): Promise<Record<number, CzLot[]>> {
  const { data: lineRows } = await sb.from("cz_invoice_lines")
    .select("id,product_id").eq("invoice_id", invoiceId);
  const lines = ((lineRows ?? []) as Record<string, unknown>[])
    .map((r) => ({ id: r.id as number, productId: (r.product_id as number | null) ?? null }));
  const byProduct = await lotsOfProducts(
    lines.map((l) => l.productId).filter((p): p is number => p != null),
  );
  const out: Record<number, CzLot[]> = {};
  for (const l of lines) out[l.id] = l.productId == null ? [] : byProduct.get(l.productId) ?? [];
  return out;
}
