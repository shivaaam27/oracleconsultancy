import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listMoves, postStockMove, reverseStockVoucher } from "@/lib/cocozuri-stock";
import { expiryOnClose, pickFefo } from "@/lib/cocozuri-trace";
import { todayInDar } from "@/lib/cocozuri-stock-shared";
import { getRecipe, listRecipes } from "@/lib/cocozuri-recipe";
import type { CzRecipe } from "@/lib/cocozuri-recipe-shared";
import {
  batchCheck, batchPlan, closeBlockers, nextBatchNo, openBlockers,
  type CzBatch, type CzBatchCheck, type CzBatchStatus, type CzLossKind,
} from "@/lib/cocozuri-batch-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 4 — production. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`). The
 * client-safe twin is `cocozuri-batch-shared.ts`, where all the arithmetic
 * lives, tested.
 *
 * ⚠️ ONE DOOR FOR WRITES, and NOTHING HERE INSERTS INTO `cz_stock_moves`.
 * Closing a batch calls `postStockMove()`; reopening one calls
 * `reverseStockVoucher()`. Same discipline as `postVoucher()` and
 * `approvePurchase`.
 *
 * ⚠️ THE MATERIALS ARE CONSUMED WHEN THE BATCH IS **CLOSED**, in the same
 * voucher as the output — not when it is opened. Two reasons, and both matter:
 *   · A batch that is open for two hours does not need its cocoa sitting in a
 *     limbo nobody can see, and the kitchen's shelf should read true all day.
 *   · An ABANDONED batch would otherwise leave stock destroyed with nothing to
 *     show for it. Cancelling an open batch must cost nothing, or people will
 *     avoid opening one "just in case" — which is the friction plan §5a warns
 *     about, in its most damaging form.
 * The movements are dated the batch's own date, so the books do not care.
 *
 * Read `memory/cocozuri_manufacturing_plan.md` §4 Stage 4 and §5a first.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** The document type a batch writes into the stock ledger. */
export const BATCH_VOUCHER = "batch";

/** ⚠️ ONE STRING LITERAL — split across a `+` and the Supabase client can no
 *  longer read the column list at type level and the file stops compiling for a
 *  reason that looks unrelated. */
const BATCH_COLS = "id,batch_no,item_id,recipe_id,location_id,made_on,expires_on,status,recipe_multiple,planned_qty,produced_qty,loss_kind,loss_note,opened_by,closed_at,closed_by,notes";

function toBatch(
  r: Record<string, unknown>,
  names: { items: Map<number, string>; locations: Map<number, string>; recipes: Map<number, string> },
): CzBatch {
  const itemId = (r.item_id as number | null) ?? null;
  const locationId = (r.location_id as number | null) ?? null;
  const recipeId = (r.recipe_id as number | null) ?? null;
  return {
    id: r.id as number,
    batchNo: (r.batch_no as string) ?? "",
    itemId,
    itemName: itemId == null ? null : names.items.get(itemId) ?? null,
    recipeId,
    recipeName: recipeId == null ? null : names.recipes.get(recipeId) ?? null,
    locationId,
    locationName: locationId == null ? null : names.locations.get(locationId) ?? null,
    madeOn: (r.made_on as string | null) ?? null,
    expiresOn: (r.expires_on as string | null) ?? null,
    status: ((r.status as string) ?? "planned") as CzBatchStatus,
    recipeMultiple: num(r.recipe_multiple) || 1,
    plannedQty: r.planned_qty == null ? null : num(r.planned_qty),
    producedQty: r.produced_qty == null ? null : num(r.produced_qty),
    lossKind: ((r.loss_kind as string) ?? "none") as CzLossKind,
    lossNote: (r.loss_note as string | null) ?? null,
    openedBy: (r.opened_by as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
    closedBy: (r.closed_by as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

async function nameMaps() {
  const [items, { data: locations }, { data: recipes }, { data: products }] = await Promise.all([
    listItems(),
    sb.from("cz_stock_locations").select("id,name"),
    sb.from("cz_recipes").select("id,name"),
    sb.from("cz_products").select("id,name"),
  ]);
  const productName = new Map((products ?? []).map((p) => [p.id as number, p.name as string]));
  return {
    // ⚠️ The product's name wins where one is linked, exactly as the stock
    // sheets do it — a merge in the catalogue cannot leave two names for one
    // thing on a batch.
    items: new Map(items.map((i) => [i.id, (i.productId != null ? productName.get(i.productId) : null) ?? i.name])),
    locations: new Map((locations ?? []).map((l) => [l.id as number, l.name as string])),
    recipes: new Map((recipes ?? []).map((r) => [r.id as number, r.name as string])),
    itemRows: items,
  };
}

export async function listBatches(opts?: { status?: CzBatchStatus; open?: boolean }): Promise<CzBatch[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_batches").select(BATCH_COLS).eq("company_id", company.id);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.open) q = q.in("status", ["planned", "running"]);
  const [{ data, error }, names] = await Promise.all([
    q.order("made_on", { ascending: false }).order("id", { ascending: false }),
    nameMaps(),
  ]);
  // ⚠️ Said out loud — an empty list and a failed query look identical on a
  // screen, and only one of them is true.
  if (error) {
    console.error("[cocozuri] listBatches failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => toBatch(r as Record<string, unknown>, names));
}

export async function getBatch(id: number): Promise<CzBatch | null> {
  const company = await cocozuriCompany();
  if (!company) return null;
  const [{ data }, names] = await Promise.all([
    sb.from("cz_batches").select(BATCH_COLS).eq("company_id", company.id).eq("id", id).maybeSingle(),
    nameMaps(),
  ]);
  return data ? toBatch(data as Record<string, unknown>, names) : null;
}

export async function getBatchByNo(batchNo: string): Promise<CzBatch | null> {
  const company = await cocozuriCompany();
  if (!company) return null;
  const { data } = await sb.from("cz_batches").select("id")
    .eq("company_id", company.id).eq("batch_no", batchNo).maybeSingle();
  return data ? getBatch(data.id as number) : null;
}

/* ------------------------------ opening ------------------------------ */

export type OpenBatchInput = {
  /** What is being made — a stock item. */
  itemId: number;
  locationId: number;
  madeOn?: string;
  /** Optional. ⚠️ A batch with no recipe is a real and allowed thing. */
  recipeId?: number | null;
  recipeMultiple?: number;
  plannedQty?: number | null;
  expiresOn?: string | null;
  openedBy?: string | null;
  notes?: string | null;
};

/**
 * **Open a batch.** One action, and it is already running.
 *
 * ⚠️ THIS IS THE FUNCTION PLAN §5a IS ABOUT. Nobody at CocoZuri writes a batch
 * number today, so every field demanded here is a reason to go back to the
 * notebook. It asks for three things — what, where, and (implicitly) when — and
 * allocates the number itself. Everything else, including the recipe and how
 * many were expected, is optional and can be filled in later.
 *
 * ⚠️ IT LANDS AS `running`, NOT `planned`. The ordinary case is somebody making
 * chocolate NOW. Planning ahead is the exception and gets its own status.
 *
 * ⚠️ NOTHING MOVES YET. See the file header: materials are consumed at CLOSE.
 */
export async function openBatch(input: OpenBatchInput, by = "web-ui"): Promise<{ ok: boolean; id?: number; batchNo?: string; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const madeOn = input.madeOn || todayInDar();

  const blockers = openBlockers({ itemId: input.itemId ?? null, locationId: input.locationId ?? null, madeOn });
  if (blockers.length) return { ok: false, error: blockers[0] };

  // What the recipe expects, so the plan is written down without anybody typing it.
  let plannedQty = input.plannedQty ?? null;
  if (plannedQty == null && input.recipeId) {
    const recipe = await getRecipe(input.recipeId);
    if (recipe) plannedQty = batchPlan(recipe, input.recipeMultiple ?? 1).expectedQty;
  }

  const { data: taken } = await sb.from("cz_batches").select("batch_no").eq("company_id", company.id);
  const existing = (taken ?? []).map((r) => r.batch_no as string);

  // ⚠️ Retried against the unique index rather than trusted — two people
  // starting a batch in the same minute is exactly what a MAX+1 misses, and in
  // a kitchen that is a normal morning.
  for (let attempt = 0; attempt < 5; attempt++) {
    const batchNo = nextBatchNo(existing, madeOn);
    const { data, error } = await sb.from("cz_batches").insert({
      company_id: company.id,
      batch_no: batchNo,
      item_id: input.itemId,
      recipe_id: input.recipeId ?? null,
      location_id: input.locationId,
      made_on: madeOn,
      expires_on: input.expiresOn ?? null,
      status: "running",
      recipe_multiple: input.recipeMultiple ?? 1,
      planned_qty: plannedQty,
      opened_by: input.openedBy?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: by,
      updated_at: NOW(),
    }).select("id").maybeSingle();

    if (error) {
      if (error.code === "23505") { existing.push(batchNo); continue; }
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id as number, batchNo };
  }
  return { ok: false, error: "Could not allocate a batch number." };
}

/** Change an OPEN batch. ⚠️ A closed one has moved stock — reopen it first. */
export async function updateBatch(id: number, input: Partial<OpenBatchInput>): Promise<{ ok: boolean; error?: string }> {
  const batch = await getBatch(id);
  if (!batch) return { ok: false, error: "That batch does not exist." };
  if (batch.status === "closed") {
    return { ok: false, error: `${batch.batchNo} is done — its materials and its output are already in the stock ledger. Reopen it to change anything.` };
  }
  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.itemId !== undefined) patch.item_id = input.itemId;
  if (input.recipeId !== undefined) patch.recipe_id = input.recipeId;
  if (input.locationId !== undefined) patch.location_id = input.locationId;
  if (input.recipeMultiple !== undefined) patch.recipe_multiple = input.recipeMultiple;
  if (input.plannedQty !== undefined) patch.planned_qty = input.plannedQty;
  if (input.madeOn !== undefined) patch.made_on = input.madeOn;
  if (input.expiresOn !== undefined) patch.expires_on = input.expiresOn;
  if (input.openedBy !== undefined) patch.opened_by = input.openedBy?.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  const { error } = await sb.from("cz_batches").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ------------------------------ closing ------------------------------ */

export type CloseBatchInput = {
  /** What actually came out. */
  producedQty: number;
  /** What was actually taken. Defaults to what the recipe asked for. */
  used?: { itemId: number; qty: number }[];
  lossKind?: CzLossKind;
  lossNote?: string | null;
  closedBy?: string | null;
  /** Cost per produced unit, if the caller worked one out. */
  unitCost?: number | null;
};

/**
 * **Close a batch** — and this is what moves the stock.
 *
 * One voucher, written in a single statement, holding every `consume` (negative,
 * the materials) and the one `produce` (positive, what came out). All of it
 * carries the `batch_id`, which is the whole point of the exercise: from one bag
 * of almond powder you can reach every bar made from it, and back again.
 *
 * ⚠️ THE FRICTION LIVES HERE, NOT AT THE START. Somebody opening a batch is
 * standing in a kitchen; somebody closing one has finished and is writing down
 * what happened. That is when it is fair to ask how many came out and, if it is
 * short, where the difference went — note #12, and the same discipline as
 * `recordCount` refusing an unexplained stock-take variance.
 *
 * ⚠️ WHAT WAS USED DEFAULTS TO THE RECIPE BUT IS NOT FORCED TO IT. The recipe
 * is what was meant to go in; the caller may say what actually did. Recording
 * the recipe as if it were fact would make every batch agree with itself and
 * the "inter check" would be worthless.
 */
export async function closeBatch(
  id: number, input: CloseBatchInput, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const batch = await getBatch(id);
  if (!batch) return { ok: false, error: "That batch does not exist." };
  if (batch.status === "closed") return { ok: false, error: `${batch.batchNo} is already done.` };
  if (batch.status === "cancelled") return { ok: false, error: `${batch.batchNo} was abandoned.` };
  if (!batch.itemId || !batch.locationId || !batch.madeOn) {
    return { ok: false, error: "This batch does not say what was made, or where. Fill that in before closing it." };
  }

  const recipe = batch.recipeId ? await getRecipe(batch.recipeId) : null;
  const plan = recipe ? batchPlan(recipe, batch.recipeMultiple) : null;

  // What was taken: what the caller said, else what the recipe asked for.
  const used = (input.used && input.used.length
    ? input.used
    : (plan?.materials ?? []).map((m) => ({ itemId: m.itemId, qty: m.qty }))
  ).filter((u) => Number.isFinite(Number(u.qty)));

  const names = await nameMaps();
  const itemById = new Map(names.itemRows.map((i) => [i.id, i]));
  const usedNamed = used.map((u) => ({
    itemId: u.itemId,
    itemName: names.items.get(u.itemId) ?? `Item #${u.itemId}`,
    uom: itemById.get(u.itemId)?.uom ?? "PCS",
    qty: Number(u.qty),
  }));

  const candidate = {
    producedQty: Number(input.producedQty),
    plannedQty: batch.plannedQty,
    recipeMultiple: batch.recipeMultiple,
    lossKind: input.lossKind ?? batch.lossKind,
    lossNote: input.lossNote ?? batch.lossNote,
  };
  const check = batchCheck(candidate, plan, usedNamed);
  const blockers = closeBlockers({ producedQty: candidate.producedQty, check, used: usedNamed });
  if (blockers.length) return { ok: false, error: blockers[0] };

  /* ⚠️ THE MOVEMENTS GO FIRST AND THE STATUS ONLY IF THEY LANDED. The other
     order leaves a batch marked done with nothing on the shelf — a lie the
     stock ledger can never be talked out of, because there is no transaction
     here to fall back on. `postStockMove` writes them all in one statement, so
     it can never hold half a batch either. */
  /* ⚠️ STAGE 9 — MATERIALS ARE TAKEN FIRST-EXPIRED-FIRST-OUT, LOT BY LOT.
     Not first-in-first-out: they are not the same thing, and food is exactly
     the case where the difference bites — a bag bought later can go off sooner,
     and taking the older one leaves the one about to expire on the shelf until
     it does.

     ⚠️ AND THE `batch_id` ON A CONSUME MOVEMENT IS THE **MATERIAL'S** LOT, not
     the batch being made. Which batch it belongs to is already on the voucher
     (`batch` / this id), so using the column for the lot is what makes the
     backward trace — bar → bag → supplier — possible at all. A move with no lot
     simply means nobody dated that material, which is recorded, not invented. */
  const consumedLotIds: number[] = [];
  const consumeMoves: {
    itemId: number; locationId: number; onDate: string; qty: number;
    reason: "consume"; batchId: number | null; note: string;
  }[] = [];

  for (const u of usedNamed.filter((x) => x.qty > 0)) {
    const where = itemById.get(u.itemId)?.locationId ?? batch.locationId!;
    const picked = await pickFefo(u.itemId, u.qty, where);
    for (const p of picked.picks) {
      consumedLotIds.push(p.lot.batchId);
      consumeMoves.push({
        itemId: u.itemId, locationId: where, onDate: batch.madeOn!,
        qty: -p.qty, reason: "consume", batchId: p.lot.batchId,
        note: `${batch.batchNo} · ${p.lot.batchNo}`,
      });
    }
    // ⚠️ What the lots could not cover is still recorded, with no lot against
    // it. Leaving it out would say less went in than really did.
    if (picked.short > 0.0005) {
      consumeMoves.push({
        itemId: u.itemId, locationId: where, onDate: batch.madeOn!,
        qty: -picked.short, reason: "consume", batchId: null, note: batch.batchNo,
      });
    }
  }

  const moves = [
    ...consumeMoves,
    ...(candidate.producedQty > 0
      ? [{
          itemId: batch.itemId,
          locationId: batch.locationId,
          onDate: batch.madeOn,
          qty: candidate.producedQty,
          reason: "produce" as const,
          batchId: batch.id,
          unitCost: input.unitCost ?? null,
          note: batch.batchNo,
        }]
      : []),
  ];

  if (moves.length) {
    // ⚠️ NOT `mustNet`. A batch deliberately does NOT balance: two kilos of
    // cocoa become a hundred and eight bars, and the two sides are different
    // things measured in different units. A transfer nets; production does not.
    const res = await postStockMove(moves, { type: BATCH_VOUCHER, id: batch.id }, by);
    if (!res.ok) return { ok: false, error: res.error };
  }

  /* ⚠️ STAGE 9 — THE EXPIRY IS WORKED OUT AND **FROZEN** HERE: the earlier of
     what the shelf life allows and the soonest-expiring thing that went in. A
     bar made with almonds that go off next week does not last six months,
     however long a bar normally lasts.

     ⚠️ Frozen rather than derived on read, because a shelf life changed next
     year must not silently move the date on chocolate already in a shop. */
  const expiry = await expiryOnClose(batch.itemId, batch.madeOn, consumedLotIds);

  const { error } = await sb.from("cz_batches").update({
    status: "closed",
    expires_on: expiry.date,
    produced_qty: candidate.producedQty,
    loss_kind: candidate.lossKind,
    loss_note: candidate.lossNote?.trim() || null,
    closed_at: NOW(),
    closed_by: input.closedBy?.trim() || null,
    updated_at: NOW(),
  }).eq("id", id);
  if (error) {
    // The movements are in and the status is not. Take them straight back out
    // rather than leaving stock that no document explains.
    await reverseStockVoucher(BATCH_VOUCHER, batch.id, batch.madeOn, by);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Reopen a closed batch.
 *
 * ⚠️ THE MOVEMENTS ARE REVERSED, NEVER ERASED — an opposite move for each,
 * exactly as `unpostVoucher` answers a general-ledger posting and
 * `cancelPurchase` answers a delivery. A morning's work that was later found to
 * be wrong is still a morning's work that happened.
 */
export async function reopenBatch(id: number, reason: string | null, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const batch = await getBatch(id);
  if (!batch) return { ok: false, error: "That batch does not exist." };
  if (batch.status !== "closed") return { ok: false, error: `${batch.batchNo} is not closed.` };
  if (!reason?.trim()) {
    return { ok: false, error: "Say why. This takes the output back off the shelf and puts the materials back, and a movement with no reason is one nobody can check." };
  }
  const existing = await listMoves({ voucherType: BATCH_VOUCHER, voucherId: batch.id });
  if (existing.length > 0) {
    const rev = await reverseStockVoucher(BATCH_VOUCHER, batch.id, batch.madeOn ?? todayInDar(), by);
    if (!rev.ok) return { ok: false, error: rev.error };
  }
  const { error } = await sb.from("cz_batches").update({
    status: "running",
    produced_qty: null,
    closed_at: null,
    closed_by: null,
    notes: [batch.notes, `Reopened: ${reason.trim()}`].filter(Boolean).join(" · "),
    updated_at: NOW(),
  }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Abandon an open batch.
 *
 * ⚠️ IT COSTS NOTHING, AND THAT IS DELIBERATE. Because materials are not
 * consumed until close, abandoning takes nothing off the shelf — so nobody has
 * a reason to avoid opening a batch "just in case". A system that punishes you
 * for starting something is a system people start on paper instead.
 */
export async function cancelBatch(id: number, reason: string | null): Promise<{ ok: boolean; error?: string }> {
  const batch = await getBatch(id);
  if (!batch) return { ok: false, error: "That batch does not exist." };
  if (batch.status === "closed") {
    return { ok: false, error: `${batch.batchNo} is done. Reopen it first — its stock movements have to come back out.` };
  }
  const { error } = await sb.from("cz_batches").update({
    status: "cancelled",
    notes: [batch.notes, reason?.trim() ? `Abandoned: ${reason.trim()}` : null].filter(Boolean).join(" · ") || null,
    updated_at: NOW(),
  }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ---------------------------- reading back ---------------------------- */

/**
 * Everything a batch screen needs: the plan, what was actually taken, and the
 * check between them.
 *
 * ⚠️ WHAT WAS TAKEN COMES FROM THE STOCK LEDGER, not from the recipe and not
 * from a column. The `consume` movements tagged with this batch ARE the fact.
 */
export async function batchDetail(batch: CzBatch): Promise<{
  recipe: CzRecipe | null;
  check: CzBatchCheck;
  used: { itemId: number; itemName: string; uom: string; qty: number }[];
}> {
  const recipe = batch.recipeId ? await getRecipe(batch.recipeId) : null;
  const plan = recipe ? batchPlan(recipe, batch.recipeMultiple) : null;
  /* ⚠️ BY THE VOUCHER, NOT BY `batch_id`. Stage 9 gave `batch_id` a different
     job on a consume movement: it holds the MATERIAL'S lot, not the batch being
     made. So asking for `{ batchId: batch.id }` returns nothing at all for any
     batch closed since — every one of them showed "nothing taken yet" over a
     ledger that had the consumes in it — and where a material's lot id happened
     to collide with a batch id it would return another batch's movements.
     Which batch a movement belongs to has always been on the voucher. */
  const [moves, names] = await Promise.all([
    listMoves({ voucherType: "batch", voucherId: batch.id }),
    nameMaps(),
  ]);
  const itemById = new Map(names.itemRows.map((i) => [i.id, i]));

  const byItem = new Map<number, number>();
  for (const m of moves) {
    if (m.reason !== "consume") continue;
    byItem.set(m.itemId, (byItem.get(m.itemId) ?? 0) + Math.abs(m.qty));
  }
  const usedActual = [...byItem.entries()].map(([itemId, qty]) => ({
    itemId,
    itemName: names.items.get(itemId) ?? `Item #${itemId}`,
    uom: itemById.get(itemId)?.uom ?? "PCS",
    qty,
  }));

  // Before it is closed nothing has been consumed, so the plan stands in — and
  // the screen says which of the two it is looking at.
  const used = usedActual.length ? usedActual : (plan?.materials ?? []).map((m) => ({
    itemId: m.itemId, itemName: m.itemName, uom: m.uom, qty: m.qty,
  }));

  return { recipe, check: batchCheck(batch, plan, used), used };
}

/** The recipes that could be run — active ones, newest default first. */
export async function makeableRecipes(): Promise<CzRecipe[]> {
  const all = await listRecipes({ status: "active" });
  return all.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

/** ⚠️ Used by `deleteRecipe` to refuse: a recipe something has been MADE from
 *  is the record of how it was made, and deleting it would orphan that. */
export async function recipeHasBatches(recipeId: number): Promise<number> {
  const { count } = await sb.from("cz_batches").select("id", { count: "exact", head: true }).eq("recipe_id", recipeId);
  return count ?? 0;
}
