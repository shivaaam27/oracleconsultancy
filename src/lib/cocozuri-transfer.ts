import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listLocations, listMoves, postStockMove, reverseStockVoucher } from "@/lib/cocozuri-stock";
import { todayInDar, type CzStockItem } from "@/lib/cocozuri-stock-shared";
import { pickFefoMany } from "@/lib/cocozuri-trace";
import { recordEvent } from "@/lib/cocozuri-events";
import {
  nextTransferRef, pairItems, receiveBlockers, sendBlockers, transferCheck,
  type CzTransfer, type CzTransferLine, type CzTransferPair, type CzTransferStatus,
  spreadAcrossLots,
} from "@/lib/cocozuri-transfer-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 5 — kitchen → shop. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ ONE DOOR FOR WRITES, and NOTHING HERE INSERTS INTO `cz_stock_moves` —
 * every movement goes through `postStockMove()`, and undoing one goes through
 * `reverseStockVoucher()`. Same discipline as `postVoucher()`, `approvePurchase`
 * and `closeBatch`.
 *
 * ⚠️ TWO MOMENTS, TWO SETS OF MOVEMENTS.
 *   · SEND    → `transfer` moves OUT of the source. The chocolate has left.
 *   · RECEIVE → `transfer` moves INTO the destination, for what ACTUALLY
 *               arrived.
 * Between the two it is in transit: off one shelf and not yet on the other,
 * which is the truth and is visible as such.
 *
 * ⚠️ SO A TRANSFER IS NOT POSTED WITH `mustNet`. It nets to zero only when
 * everything arrived. Stage 1's `transferMoves` netted by construction because
 * it recorded a single moment; this records two, and a short arrival is a real
 * loss that belongs to neither shelf.
 *
 * Read `memory/cocozuri_manufacturing_plan.md` §4 Stage 5 first.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

export const TRANSFER_VOUCHER = "transfer";

/** ⚠️ ONE STRING LITERAL — see the note in `cocozuri-buy.ts`. */
const TRANSFER_COLS = "id,reference,on_date,from_location_id,to_location_id,status,sent_by,received_by,received_on,notes";
const LINE_COLS = "id,transfer_id,line_no,from_item_id,to_item_id,batch_id,sent_qty,received_qty,short_note";

/* --------------------------- names and shelves --------------------------- */

async function context() {
  const [items, locations, { data: products }, { data: batches }] = await Promise.all([
    listItems(),
    listLocations({ includeInactive: true }),
    sb.from("cz_products").select("id,name"),
    sb.from("cz_batches").select("id,batch_no"),
  ]);
  const productName = new Map((products ?? []).map((p) => [p.id as number, p.name as string]));
  return {
    items,
    itemById: new Map(items.map((i) => [i.id, i])),
    /** ⚠️ The product's name wins where one is linked — a merge in the catalogue
     *  cannot leave two names for one thing on a transfer. */
    nameOf: (i: CzStockItem) => (i.productId != null ? productName.get(i.productId) : null) ?? i.name,
    locationName: new Map(locations.map((l) => [l.id, l.name])),
    batchNo: new Map((batches ?? []).map((b) => [b.id as number, b.batch_no as string])),
    locations,
  };
}

type Ctx = Awaited<ReturnType<typeof context>>;

function toLine(r: Record<string, unknown>, ctx: Ctx): CzTransferLine {
  const fromItemId = r.from_item_id as number;
  const from = ctx.itemById.get(fromItemId);
  const batchId = (r.batch_id as number | null) ?? null;
  return {
    id: r.id as number,
    lineNo: (r.line_no as number) ?? 1,
    fromItemId,
    toItemId: r.to_item_id as number,
    itemName: from ? ctx.nameOf(from) : `Item #${fromItemId}`,
    uom: from?.uom ?? "PCS",
    batchId,
    batchNo: batchId == null ? null : ctx.batchNo.get(batchId) ?? null,
    sentQty: num(r.sent_qty),
    // ⚠️ `?? null`, never `?? 0` — "nobody has counted" and "nothing arrived"
    // are different claims.
    receivedQty: r.received_qty == null ? null : num(r.received_qty),
    shortNote: (r.short_note as string | null) ?? null,
  };
}

function toTransfer(r: Record<string, unknown>, lines: CzTransferLine[], ctx: Ctx): CzTransfer {
  const fromLocationId = r.from_location_id as number;
  const toLocationId = r.to_location_id as number;
  return {
    id: r.id as number,
    reference: (r.reference as string) ?? "",
    onDate: r.on_date as string,
    fromLocationId,
    fromLocationName: ctx.locationName.get(fromLocationId) ?? null,
    toLocationId,
    toLocationName: ctx.locationName.get(toLocationId) ?? null,
    status: ((r.status as string) ?? "sent") as CzTransferStatus,
    sentBy: (r.sent_by as string | null) ?? null,
    receivedBy: (r.received_by as string | null) ?? null,
    receivedOn: (r.received_on as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    lines,
  };
}

/* ------------------------------- reading ------------------------------- */

export async function listTransfers(opts?: { status?: CzTransferStatus }): Promise<CzTransfer[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_transfers").select(TRANSFER_COLS).eq("company_id", company.id);
  if (opts?.status) q = q.eq("status", opts.status);
  const [{ data, error }, ctx] = await Promise.all([
    q.order("on_date", { ascending: false }).order("id", { ascending: false }),
    context(),
  ]);
  // ⚠️ Said out loud — an empty list and a failed query look identical.
  if (error) {
    console.error("[cocozuri] listTransfers failed:", error.message);
    return [];
  }
  const rows = data ?? [];
  const ids = rows.map((r) => r.id as number);
  const { data: lineRows } = ids.length
    ? await sb.from("cz_transfer_lines").select(LINE_COLS).in("transfer_id", ids).order("line_no")
    : { data: [] as Record<string, unknown>[] };
  const byTransfer = new Map<number, CzTransferLine[]>();
  for (const r of (lineRows ?? []) as Record<string, unknown>[]) {
    const key = r.transfer_id as number;
    const bucket = byTransfer.get(key);
    if (bucket) bucket.push(toLine(r, ctx));
    else byTransfer.set(key, [toLine(r, ctx)]);
  }
  return rows.map((r) => toTransfer(r as Record<string, unknown>, byTransfer.get(r.id as number) ?? [], ctx));
}

export async function getTransferByRef(reference: string): Promise<CzTransfer | null> {
  const company = await cocozuriCompany();
  if (!company) return null;
  const [{ data }, ctx] = await Promise.all([
    sb.from("cz_transfers").select(TRANSFER_COLS).eq("company_id", company.id).eq("reference", reference).maybeSingle(),
    context(),
  ]);
  if (!data) return null;
  const { data: lineRows } = await sb.from("cz_transfer_lines").select(LINE_COLS)
    .eq("transfer_id", data.id as number).order("line_no");
  return toTransfer(
    data as Record<string, unknown>,
    ((lineRows ?? []) as Record<string, unknown>[]).map((r) => toLine(r, ctx)),
    ctx,
  );
}

/**
 * What could be sent from one shelf to another, already paired up.
 *
 * ⚠️ PAIRED BY PRODUCT, and anything that cannot be paired is RETURNED WITH ITS
 * REASON rather than hidden. A line quietly missing from a list is how somebody
 * spends ten minutes wondering where a chocolate went.
 */
export async function transferOptions(fromLocationId: number, toLocationId: number): Promise<CzTransferPair[]> {
  const ctx = await context();
  const from = ctx.items.filter((i) => i.locationId === fromLocationId);
  const to = ctx.items.filter((i) => i.locationId === toLocationId);
  return pairItems(from, to, ctx.nameOf).sort((a, b) => a.name.localeCompare(b.name));
}

/* -------------------------------- sending -------------------------------- */

export type SendTransferInput = {
  fromLocationId: number;
  toLocationId: number;
  onDate?: string;
  sentBy?: string | null;
  notes?: string | null;
  lines: { fromItemId: number; toItemId: number; qty: number; batchId?: number | null }[];
};

/**
 * **Send stock from one place to another.** This takes it off the sending shelf.
 *
 * ⚠️ THERE IS NO DRAFT, ON PURPOSE. By the time somebody is recording this, the
 * chocolate is in a crate — a transfer sitting unsent while the stock has
 * already gone is exactly the gap that makes the shop's opening figure a
 * mystery today.
 *
 * ⚠️ IT WRITES ONLY THE OUT SIDE. The stock is now IN TRANSIT: off one shelf
 * and not yet on the other. That is the truth, and pretending it arrived the
 * instant it left is what stops anybody ever noticing a crate that went missing.
 */
export async function sendTransfer(input: SendTransferInput, by = "web-ui"): Promise<{ ok: boolean; id?: number; reference?: string; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const onDate = input.onDate || todayInDar();

  const clean = (input.lines ?? []).filter((l) => l.fromItemId && num(l.qty) > 0);
  const blockers = sendBlockers({
    fromLocationId: input.fromLocationId ?? null,
    toLocationId: input.toLocationId ?? null,
    onDate,
    lines: clean.map((l) => ({ toItemId: l.toItemId ?? null, sentQty: num(l.qty) })),
  });
  if (blockers.length) return { ok: false, error: blockers[0] };

  // ⚠️ The shelves are re-checked against the real items, never trusted from the
  // form — a line filed against the wrong sheet is worse than one not filed.
  const ctx = await context();
  for (const l of clean) {
    const from = ctx.itemById.get(l.fromItemId);
    const to = ctx.itemById.get(l.toItemId);
    if (!from || from.locationId !== input.fromLocationId) {
      return { ok: false, error: "Something on the list is not on the sending shelf." };
    }
    if (!to || to.locationId !== input.toLocationId) {
      return { ok: false, error: "Something on the list does not match a line on the receiving shelf." };
    }
    // ⚠️ THE PRODUCT LINK IS THE PROOF THEY ARE THE SAME CHOCOLATE. Without it,
    // this would be moving stock between two unrelated things.
    if (from.productId == null || to.productId == null || from.productId !== to.productId) {
      return { ok: false, error: `${ctx.nameOf(from)} is not linked to the same product on both sheets, so nothing can say they are the same chocolate.` };
    }
  }

  const { data: taken } = await sb.from("cz_transfers").select("reference").eq("company_id", company.id);
  const existing = (taken ?? []).map((r) => r.reference as string);

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = nextTransferRef(existing, onDate);
    const { data, error } = await sb.from("cz_transfers").insert({
      company_id: company.id,
      reference,
      on_date: onDate,
      from_location_id: input.fromLocationId,
      to_location_id: input.toLocationId,
      status: "sent",
      sent_by: input.sentBy?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: by,
      updated_at: NOW(),
    }).select("id").maybeSingle();

    if (error) {
      if (error.code === "23505") { existing.push(reference); continue; }
      return { ok: false, error: error.message };
    }
    const id = data?.id as number;

    const { error: lineErr } = await sb.from("cz_transfer_lines").insert(
      clean.map((l, i) => ({
        company_id: company.id,
        transfer_id: id,
        line_no: i + 1,
        from_item_id: l.fromItemId,
        to_item_id: l.toItemId,
        batch_id: l.batchId ?? null,
        sent_qty: num(l.qty),
      })),
    );
    if (lineErr) return { ok: false, error: lineErr.message };

    /* ⚠️ THE MOVEMENTS GO LAST AND ARE CHECKED — if they fail, the document is
       removed rather than left claiming stock moved when it did not. There is
       no transaction here to fall back on. */
    /* ⚠️ THE LOT TRAVELS WITH THE CHOCOLATE. A transfer used to write ONE
       movement per line with `batch_id = null`, so the recall thread broke the
       moment anything left the kitchen: "where did this batch go" answered
       "Made" and nothing else, and the trace still counted the bars as being on
       the kitchen shelf. Now each line is allocated across its lots the same
       way `closeBatch` allocates materials — FIRST EXPIRED, FIRST OUT, not
       first in — and writes one movement per lot.

       ⚠️ A LINE THE LOTS CANNOT COVER STILL MOVES, with no lot against it.
       Refusing would stop somebody recording a real transfer of chocolate that
       predates lot tracking; leaving it out would say less went than really
       did. It is recorded and unattributed, which is the truth. */
    const outMoves: {
      itemId: number; locationId: number; onDate: string; qty: number;
      reason: "transfer"; batchId: number | null; note: string;
    }[] = [];
    /* ⚠️ ALLOCATED IN ONE READ OF THE LEDGER, not once per line — and the
       sharing-out decrements as it goes, so two lines of one transfer asking for
       the same lot can no longer each be told the whole lot is theirs. */
    const toAllocate = clean.filter((l) => l.batchId == null);
    const allocations = toAllocate.length
      ? await pickFefoMany(
          toAllocate.map((l) => ({ itemId: l.fromItemId, need: num(l.qty) })),
          input.fromLocationId!,
        )
      : [];
    const allocFor = new Map(toAllocate.map((l, i) => [l, allocations[i]!]));
    for (const l of clean) {
      // A lot named on the line itself wins — somebody chose it deliberately.
      if (l.batchId != null) {
        outMoves.push({
          itemId: l.fromItemId, locationId: input.fromLocationId!, onDate,
          qty: -num(l.qty), reason: "transfer", batchId: l.batchId, note: reference,
        });
        continue;
      }
      const picked = allocFor.get(l)!;
      for (const p of picked.picks) {
        outMoves.push({
          itemId: l.fromItemId, locationId: input.fromLocationId!, onDate,
          qty: -p.qty, reason: "transfer", batchId: p.lot.batchId,
          note: `${reference} · ${p.lot.batchNo}`,
        });
      }
      if (picked.short > 0.0005) {
        outMoves.push({
          itemId: l.fromItemId, locationId: input.fromLocationId!, onDate,
          qty: -picked.short, reason: "transfer", batchId: null, note: reference,
        });
      }
    }

    const res = await postStockMove(outMoves, { type: TRANSFER_VOUCHER, id }, by);
    if (!res.ok) {
      await sb.from("cz_transfers").delete().eq("id", id);
      return { ok: false, error: res.error };
    }
    /* ⚠️ "On its way" is the fact, not "moved". A transfer has two moments,
       and between them the chocolate is on neither shelf. */
    void recordEvent({
      subjectType: "transfer", subjectId: id, subjectRef: reference,
      kind: "created",
      summary: `Sent — ${outMoves.length} movement${outMoves.length === 1 ? "" : "s"} off the sending shelf. It is on its way, and on neither shelf until it is received.`,
    }, by);
    return { ok: true, id, reference };
  }
  return { ok: false, error: "Could not allocate a reference for this transfer." };
}

/* ------------------------------- receiving ------------------------------- */

export type ReceiveTransferInput = {
  receivedBy?: string | null;
  receivedOn?: string;
  counted: { lineId: number; qty: number; shortNote?: string | null }[];
};

/**
 * **Say what actually arrived.** This puts it on the receiving shelf.
 *
 * ⚠️ WHAT ARRIVED, NOT WHAT WAS SENT. The kitchen says 20 and the shop counts
 * 18 — recording 20 at both ends is what makes the shop's stock drift, and then
 * a stock-take blames the shop for something that went missing in a crate.
 *
 * ⚠️ A SHORTFALL MUST BE EXPLAINED, and MORE arriving than was sent is refused
 * outright: stock cannot appear in transit, so that is a typo, not a windfall.
 *
 * ⚠️ THE MISSING UNITS GET NO MOVEMENT OF THEIR OWN. The kitchen is down 20 and
 * the shop is up 18; the 2 belong to neither shelf. Both movements carry this
 * transfer's voucher, so "what did TRF-2608-01 lose" is always answerable —
 * inventing a third movement to make the arithmetic tidy would put those 2
 * somewhere they never were.
 */
export async function receiveTransfer(
  id: number, input: ReceiveTransferInput, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const { data: head } = await sb.from("cz_transfers").select(TRANSFER_COLS).eq("id", id).maybeSingle();
  if (!head) return { ok: false, error: "That transfer does not exist." };
  if (head.status === "received") return { ok: false, error: `${head.reference} has already been received.` };
  if (head.status === "cancelled") return { ok: false, error: `${head.reference} was cancelled.` };

  const { data: lineRows } = await sb.from("cz_transfer_lines").select(LINE_COLS).eq("transfer_id", id).order("line_no");
  const rows = (lineRows ?? []) as Record<string, unknown>[];
  const countedBy = new Map(input.counted.map((c) => [c.lineId, c]));

  const check = rows.map((r) => {
    const c = countedBy.get(r.id as number);
    return {
      row: r,
      sentQty: num(r.sent_qty),
      receivedQty: c ? num(c.qty) : null,
      shortNote: c?.shortNote ?? null,
    };
  });
  const blockers = receiveBlockers(check);
  if (blockers.length) return { ok: false, error: blockers[0] };

  const receivedOn = input.receivedOn || todayInDar();

  /* The IN side — only what actually arrived, and nothing for a line where
     nothing did. */
  /* ⚠️ THE LOTS THAT ARRIVED ARE THE LOTS THAT LEFT. Read the OUT movements of
     this very transfer rather than re-picking at the far end: re-running FEFO
     against the SHOP's shelf would attribute the arriving bars to whatever the
     shop already had, which is how a recall ends up naming the wrong batch.

     ⚠️ And when fewer arrived than were sent, WHICH lot is short is genuinely
     unknown — nobody counts by lot at the receiving end. `spreadAcrossLots`
     fills them in the order they went out and gives the missing units no
     movement at all, because they belong to neither shelf. */
  const sentMoves = await listMoves({ voucherType: TRANSFER_VOUCHER, voucherId: id });
  const sentByItem = new Map<number, { batchId: number | null; qty: number }[]>();
  for (const m of sentMoves) {
    if (m.qty >= 0) continue;                       // the OUT side only
    const at = sentByItem.get(m.itemId) ?? [];
    at.push({ batchId: m.batchId ?? null, qty: Math.abs(m.qty) });
    sentByItem.set(m.itemId, at);
  }

  const moves = check
    .filter((c) => c.receivedQty != null && c.receivedQty > 0)
    .flatMap((c) => {
      const fromItemId = c.row.from_item_id as number;
      const named = (c.row.batch_id as number | null) ?? null;
      const sent = named != null
        ? [{ batchId: named, qty: c.receivedQty! }]
        : sentByItem.get(fromItemId) ?? [{ batchId: null, qty: c.receivedQty! }];
      return spreadAcrossLots(sent, c.receivedQty!).map((p) => ({
        itemId: c.row.to_item_id as number,
        locationId: head.to_location_id as number,
        onDate: receivedOn,
        qty: p.qty,
        reason: "transfer" as const,
        batchId: p.batchId,
        note: head.reference as string,
      }));
    });

  if (moves.length) {
    // ⚠️ NOT `mustNet` — see the file header. A transfer nets only when
    // everything arrived, and here it deliberately may not.
    const res = await postStockMove(moves, { type: TRANSFER_VOUCHER, id }, by);
    if (!res.ok) return { ok: false, error: res.error };
  }

  for (const c of check) {
    if (c.receivedQty == null) continue;
    await sb.from("cz_transfer_lines").update({
      received_qty: c.receivedQty,
      short_note: c.shortNote?.trim() || null,
    }).eq("id", c.row.id as number);
  }

  const { error } = await sb.from("cz_transfers").update({
    status: "received",
    received_by: input.receivedBy?.trim() || null,
    received_on: receivedOn,
    received_at: NOW(),
    updated_at: NOW(),
  }).eq("id", id);
  if (error) {
    /* ⚠️ ONLY WHAT THIS CALL WROTE IS UNDONE. `reverseStockVoucher` was here and
       was wrong: it reverses the WHOLE voucher, so a failure at the last step
       put the chocolate back on the KITCHEN's shelf — un-sending a crate that
       had really left — while the document still said "on its way". The send
       happened; only the arrival did not.

       ⚠️ And the undo goes in under the SAME voucher type, so a later cancel
       (which negates every movement of the document) still nets correctly. */
    if (moves.length) {
      await postStockMove(
        moves.map((m) => ({ ...m, qty: -m.qty, note: `Undo of ${head.reference}` })),
        { type: TRANSFER_VOUCHER, id },
        by,
      );
    }
    return { ok: false, error: error.message };
  }
  /* ⚠️ THE SHORTFALL IS NAMED, because it is the whole reason the two moments
     are recorded separately. Units that never arrived belong to neither shelf
     and have no movement of their own — this line is where they are answered
     for.

     ⚠️ AND IT IS `transferCheck` THAT WORKS IT OUT, re-read from the document
     rather than totted up again here. Summing `check` looks identical and is
     not: an uncounted line is null there, and adding it in as a zero would file
     a line nobody got to as chocolate LOST. Two ways of measuring one transfer
     is how the timeline and the record page come to disagree. */
  const saved = await getTransferByRef(head.reference as string);
  const totals = saved ? transferCheck(saved) : null;
  void recordEvent({
    subjectType: "transfer", subjectId: id, subjectRef: head.reference as string,
    kind: "closed",
    summary: totals == null
      ? "Received."
      : totals.received == null
        ? `Received. ${totals.sent} was sent; nothing has been counted in.`
        : totals.received < totals.sent
          ? `Received. ${totals.received} of ${totals.sent} arrived — ${-totals.variance!} did not, and belongs to neither shelf.`
          : `Received. All ${totals.sent} arrived.`,
    detail: totals ? { sent: totals.sent, received: totals.received } : null,
  }, by);
  return { ok: true };
}

/**
 * Cancel a transfer that never arrived.
 *
 * ⚠️ IT REVERSES THE OUT SIDE — the chocolate goes back on the sending shelf,
 * with an opposite movement, never by erasing. Something that was recorded as
 * having left and then turned out not to have is still a thing that was
 * recorded.
 */
export async function cancelTransfer(id: number, reason: string | null, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const { data: head } = await sb.from("cz_transfers").select(TRANSFER_COLS).eq("id", id).maybeSingle();
  if (!head) return { ok: false, error: "That transfer does not exist." };
  if (head.status === "cancelled") return { ok: false, error: `${head.reference} is already cancelled.` };
  if (head.status === "received") {
    return { ok: false, error: `${head.reference} has arrived. It cannot be cancelled — send it back the other way if it has to go home.` };
  }
  if (!reason?.trim()) {
    return { ok: false, error: "Say why. This puts the stock back on the sending shelf, and a movement with no reason is one nobody can check." };
  }
  const existing = await listMoves({ voucherType: TRANSFER_VOUCHER, voucherId: id });
  if (existing.length > 0) {
    const rev = await reverseStockVoucher(TRANSFER_VOUCHER, id, head.on_date as string, by);
    if (!rev.ok) return { ok: false, error: rev.error };
  }
  const { error } = await sb.from("cz_transfers").update({
    status: "cancelled",
    notes: [head.notes as string | null, `Cancelled: ${reason.trim()}`].filter(Boolean).join(" · "),
    updated_at: NOW(),
  }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  void recordEvent({
    subjectType: "transfer", subjectId: id, subjectRef: head.reference as string,
    kind: "cancelled",
    summary: `Cancelled: ${reason.trim()}${existing.length > 0 ? " The stock went back on the sending shelf, by an opposite movement." : ""}`,
  }, by);
  return { ok: true };
}

/** What is on its way right now — the number the desk shows. */
export async function inTransitCount(): Promise<number> {
  const company = await cocozuriCompany();
  if (!company) return 0;
  const { count } = await sb.from("cz_transfers")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id).eq("status", "sent");
  return count ?? 0;
}
