import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listMoves, postStockMove, reverseStockVoucher } from "@/lib/cocozuri-stock";
import { expiryOnClose, pickFefoMany } from "@/lib/cocozuri-trace";
import { outstandingOf, todayInDar, type CzMoveReason } from "@/lib/cocozuri-stock-shared";
import { getRecipe, listRecipes } from "@/lib/cocozuri-recipe";
import { recordEvent } from "@/lib/cocozuri-events";
import { snapshotIsStale, snapshotRecipe, type CzRecipe, type CzRecipeSnapshot } from "@/lib/cocozuri-recipe-shared";
import {
  batchCheck, batchPlan, closeBlockers, nextBatchNo, openBlockers,
  type CzBatch, type CzBatchCheck, type CzBatchPlan, type CzBatchStatus, type CzLossKind,
  type CzRecipePlannable,
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

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The recipe a batch must be judged against.
 *
 * ⚠️ THE SNAPSHOT WINS, ALWAYS. A recipe is a live instruction and is meant to
 * be edited — so reading today's would silently change the reported difference
 * on every batch ever made from it, including batches somebody had already read,
 * explained and signed off. That was a real fault, not a hypothetical one.
 *
 * ⚠️ A BATCH WITH NO SNAPSHOT PREDATES THIS and falls back to today's recipe,
 * which is what it has always done. It is the best available answer for those
 * and it is not a silent one — the screen says which it is showing.
 */
function plannableFor(batch: CzBatch, live: CzRecipe | null): CzRecipePlannable | null {
  return batch.recipeSnapshot ?? live;
}

/** ⚠️ ONE STRING LITERAL — split across a `+` and the Supabase client can no
 *  longer read the column list at type level and the file stops compiling for a
 *  reason that looks unrelated. */
const BATCH_COLS = "id,batch_no,item_id,recipe_id,location_id,made_on,expires_on,status,recipe_multiple,planned_qty,produced_qty,loss_kind,loss_note,opened_by,closed_at,closed_by,notes,recipe_snapshot";

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
    recipeSnapshot: (r.recipe_snapshot as CzRecipeSnapshot | null) ?? null,
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

  /* What the recipe expects, so the plan is written down without anybody typing
     it — and the recipe itself is FROZEN, so what this batch is measured against
     cannot move under it. Both come from the one read. */
  const openingRecipe = input.recipeId ? await getRecipe(input.recipeId) : null;
  const snapshot = openingRecipe ? snapshotRecipe(openingRecipe, NOW()) : null;
  let plannedQty = input.plannedQty ?? null;
  if (plannedQty == null && openingRecipe) {
    plannedQty = batchPlan(openingRecipe, input.recipeMultiple ?? 1).expectedQty;
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
      /* ⚠️ THE RECIPE IS FROZEN HERE, the same way an invoice freezes its
         customer details and its VAT rate. What the batch is measured against
         must not move under it. */
      recipe_snapshot: snapshot,
      notes: input.notes?.trim() || null,
      created_by: by,
      updated_at: NOW(),
    }).select("id").maybeSingle();

    if (error) {
      if (error.code === "23505") { existing.push(batchNo); continue; }
      return { ok: false, error: error.message };
    }
    /* ⚠️ Best-effort — `recordEvent` never fails the thing it describes. */
    void recordEvent({
      subjectType: "batch", subjectId: data?.id as number, subjectRef: batchNo,
      kind: "created",
      summary: `Opened${input.recipeId ? "" : " with no recipe"}, to make ${plannedQty ?? "?"}.`,
      detail: { recipeId: input.recipeId ?? null, multiple: input.recipeMultiple ?? 1 },
    }, by);
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

  /* ⚠️ CHANGING THE RECIPE RE-FREEZES THE SNAPSHOT, and changing the multiple
     re-works the expectation. Leaving either behind would measure the batch
     against a recipe it is no longer being made from — which is the very fault
     the snapshot exists to end, arriving through the edit form instead. */
  const nextRecipeId = input.recipeId !== undefined ? input.recipeId : batch.recipeId;
  const nextMultiple = input.recipeMultiple !== undefined ? input.recipeMultiple : batch.recipeMultiple;
  const recipeChanged = input.recipeId !== undefined && input.recipeId !== batch.recipeId;
  const multipleChanged = input.recipeMultiple !== undefined && input.recipeMultiple !== batch.recipeMultiple;

  if (recipeChanged || multipleChanged) {
    const recipe = nextRecipeId ? await getRecipe(nextRecipeId) : null;
    if (recipeChanged) patch.recipe_snapshot = recipe ? snapshotRecipe(recipe, NOW()) : null;
    /* ⚠️ THE EXPECTATION IS RE-WORKED FROM WHAT THE BATCH IS JUDGED AGAINST.
       Changing only the QUANTITY must not quietly re-read today's recipe — that
       would set an expectation the frozen recipe does not support, and the check
       printed above it would disagree. A NEW recipe is the one case where
       today's is right, because it has just become the snapshot. */
    const against: CzRecipePlannable | null = recipeChanged
      ? recipe
      : batch.recipeSnapshot ?? recipe;
    if (input.plannedQty === undefined) {
      patch.planned_qty = against ? batchPlan(against, nextMultiple ?? 1).expectedQty : null;
    }
  }

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

  const live = batch.recipeId ? await getRecipe(batch.recipeId) : null;
  // ⚠️ The recipe it was MADE FROM, not today's. See `plannableFor`.
  const plannable = plannableFor(batch, live);
  const plan = plannable ? batchPlan(plannable, batch.recipeMultiple) : null;

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

  /* ⚠️ ALLOCATED IN ONE READ OF THE LEDGER PER SHELF, not once per material.
     And the sharing-out decrements as it goes, so a material named twice at
     close — which the off-recipe line makes possible — can no longer be handed
     the same lot twice over. Grouped by shelf because a material may sit on one
     of its own. */
  const drawnAlready = await drawnByItem(batch.id);
  const drawing = usedNamed.filter((x) => x.qty > 0)
    .map((u) => ({
      ...u,
      where: itemById.get(u.itemId)?.locationId ?? batch.locationId!,
      // ⚠️ Only the REMAINDER is allocated — what was drawn already carries
      // its own lots on the ledger.
      toTake: round3(Math.max(0, u.qty - (drawnAlready.get(u.itemId) ?? 0))),
    }));
  const pickedFor = new Map<(typeof drawing)[number], Awaited<ReturnType<typeof pickFefoMany>>[number]>();
  for (const where of [...new Set(drawing.map((d) => d.where))]) {
    const here = drawing.filter((d) => d.where === where);
    const got = await pickFefoMany(here.map((d) => ({ itemId: d.itemId, need: d.toTake })), where);
    here.forEach((d, i) => pickedFor.set(d, got[i]!));
  }

  /* ⚠️ WHAT HAS ALREADY BEEN DRAWN IS TAKEN OFF WHAT CLOSING TAKES. A batch
     running for days can have materials taken from the store as it goes
     (`drawMaterials`), and those are real `consume` movements already —
     consuming the whole recipe again at close would take the same cocoa off the
     shelf twice. "Actually used" stays the TOTAL, which is what the inter check
     compares against the recipe; only the remainder moves here.

     ⚠️ AND A NEGATIVE REMAINDER PUTS MATERIAL BACK. Drawing 2 kg and using
     1.6 means 400 g went back on the shelf, and a positive `consume` is exactly
     how the ledger says so. Ignoring it would leave the shelf short for ever. */
  const drawn = drawnAlready;

  for (const u of drawing) {
    const where = u.where;
    const already = drawn.get(u.itemId) ?? 0;
    const remainder = round3(u.qty - already);
    if (Math.abs(remainder) <= 0.0005) {
      // Everything this material needed was fetched while the batch ran. Its
      // lots are already on the ledger, and `consumedLotIds` picks them up below.
      continue;
    }
    if (remainder < 0) {
      consumeMoves.push({
        itemId: u.itemId, locationId: where, onDate: batch.madeOn!,
        qty: -remainder, reason: "consume", batchId: null,
        note: `${batch.batchNo} · put back, not used`,
      });
      continue;
    }
    const picked = pickedFor.get(u)!;
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

  /* ⚠️ WHAT HAS ALREADY COME OUT IS TAKEN OFF WHAT CLOSING PUTS ON THE SHELF.
     A batch does not always finish in one go — two hundred bars on Monday and
     the rest on Wednesday is ONE batch that finished twice, and `recordOutput`
     is how the Monday half reaches the shelf on Monday. Producing the whole
     figure again at close would put the same chocolate on the shelf twice.

     ⚠️ "Came out" stays the TOTAL, which is what the inter check measures
     against the recipe. Only the remainder moves here.

     ⚠️ AND A NEGATIVE REMAINDER TAKES CHOCOLATE BACK OFF. Recording 200 and
     closing at 190 means ten were counted that are not there — a negative
     `produce` is how the ledger says so, rather than leaving the shelf ten high. */
  const producedAlready = await producedSoFar(batch.id);
  const outputRemainder = round3(candidate.producedQty - producedAlready);

  const moves = [
    ...consumeMoves,
    ...(Math.abs(outputRemainder) > 0.0005
      ? [{
          itemId: batch.itemId,
          locationId: batch.locationId,
          onDate: batch.madeOn,
          qty: outputRemainder,
          reason: "produce" as const,
          batchId: batch.id,
          unitCost: input.unitCost ?? null,
          note: outputRemainder < 0 ? `${batch.batchNo} · counted short at close` : batch.batchNo,
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
  /* ⚠️ INCLUDING THE LOTS FETCHED WHILE IT RAN. A batch drawn from on Monday
     and closed on Wednesday has most of its ingredients on the ledger already;
     reading only what CLOSING consumed would work the expiry out from a
     fraction of what actually went in, and quietly give the chocolate a longer
     life than its oldest ingredient allows. */
  const drawnLotIds = (await listMoves({ voucherType: BATCH_VOUCHER, voucherId: batch.id }))
    .filter((m) => m.reason === "consume" && m.batchId != null && m.batchId !== batch.id)
    .map((m) => m.batchId!);
  const expiry = await expiryOnClose(batch.itemId, batch.madeOn, [...consumedLotIds, ...drawnLotIds]);

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
  void recordEvent({
    subjectType: "batch", subjectId: batch.id, subjectRef: batch.batchNo,
    kind: "closed",
    summary: `Closed. ${candidate.producedQty} came out${check.variance != null && check.variance !== 0 ? `, ${check.variance > 0 ? "+" : ""}${check.variance} against the recipe` : ""}.`,
    detail: { produced: candidate.producedQty, lossKind: candidate.lossKind, expiresOn: expiry.date },
  }, by);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Fetching materials while a batch runs
 * ------------------------------------------------------------------ */

/**
 * How much of each material this batch has already taken off the shelf.
 *
 * ⚠️ READ FROM THE LEDGER, NEVER FROM A COLUMN — the `consume` movements on
 * this batch's voucher ARE the fact, the same way `batchDetail` reads what was
 * used. A second store of the same number is a second story.
 */
export async function drawnByItem(batchId: number): Promise<Map<number, number>> {
  const moves = await listMoves({ voucherType: BATCH_VOUCHER, voucherId: batchId });
  const out = new Map<number, number>();
  for (const m of moves) {
    if (m.reason !== "consume") continue;
    // Movements are signed; a consume is negative, so the amount taken is its size.
    out.set(m.itemId, round3((out.get(m.itemId) ?? 0) + -m.qty));
  }
  return out;
}

/**
 * What this batch still has off the shelf, after any reversals already written.
 *
 * ⚠️ A REVERSAL IS FILED UNDER ITS OWN VOUCHER TYPE — `batch:reversal`, not
 * `batch` — so asking the ledger for a batch's movements returns the ORIGINALS
 * whether or not they have already been answered. Reversing on the strength of
 * that reverses a second time.
 *
 * It is not a hypothetical: reopening a closed batch reverses its voucher, and
 * abandoning the reopened batch then reversed it again — putting fifteen grams
 * of coffee back on a shelf it had never left and taking forty bars off one they
 * had already returned to. Measured, not imagined.
 *
 * So the two sides are netted per item, shelf, lot and reason, and only what is
 * genuinely still outstanding comes back.
 */
async function outstandingBatchMoves(batchId: number): Promise<{
  itemId: number; locationId: number; batchId: number | null;
  reason: CzMoveReason; qty: number;
}[]> {
  const [original, reversed] = await Promise.all([
    listMoves({ voucherType: BATCH_VOUCHER, voucherId: batchId }),
    listMoves({ voucherType: `${BATCH_VOUCHER}:reversal`, voucherId: batchId }),
  ]);
  // ⚠️ The netting itself is pure and tested — `outstandingOf`.
  return outstandingOf(
    original.map((m) => ({ itemId: m.itemId, locationId: m.locationId, batchId: m.batchId ?? null, reason: m.reason, qty: m.qty })),
    reversed.map((m) => ({ itemId: m.itemId, locationId: m.locationId, batchId: m.batchId ?? null, reason: m.reason, qty: m.qty })),
  );
}

/**
 * **Take materials to the bench while the batch is still running.**
 *
 * ⚠️ THIS IS THE ANSWER TO A BATCH THAT RUNS FOR DAYS, AND IT IS OPTIONAL ON
 * PURPOSE. Consuming at close is right for a batch made in a morning — nothing
 * leaves the shelf until somebody has finished, so abandoning costs nothing and
 * nobody avoids opening one. But a batch running Monday to Wednesday leaves the
 * raw-material shelf reading high for three days, and a stock-take taken in the
 * middle of it finds a shortfall nobody can explain.
 *
 * So: a draw is a real `consume`, written when the material physically leaves
 * the shelf. Close then takes only the REMAINDER, so nothing is counted twice.
 *
 * ⚠️ AND IT DOES NOT CHANGE WHAT ABANDONING COSTS — it changes what abandoning
 * has to PUT BACK. A batch nobody drew from still costs nothing to abandon; one
 * that did has material off the shelf, and `cancelBatch` reverses it.
 *
 * ⚠️ FIRST EXPIRED, FIRST OUT, like every other door that takes stock off a
 * shelf, and a shortfall is recorded with no lot rather than invented.
 */
export async function drawMaterials(
  batchId: number,
  draws: { itemId: number; qty: number }[],
  onDate?: string,
  by = "web-ui",
): Promise<{ ok: boolean; written: number; error?: string }> {
  const batch = await getBatch(batchId);
  if (!batch) return { ok: false, written: 0, error: "That batch does not exist." };
  /* ⚠️ A CLOSED BATCH TAKES NOTHING MORE. Its materials are settled and its
     yield is measured against them; adding to it afterwards would change a
     figure somebody has already read. Reopen it instead. */
  if (batch.status !== "running") {
    return { ok: false, written: 0, error: `${batch.batchNo} is not running. Only a batch still being made can fetch more.` };
  }

  const clean = draws.filter((d) => d.itemId && Number.isFinite(Number(d.qty)) && Number(d.qty) > 0);
  if (!clean.length) {
    return { ok: false, written: 0, error: "Nothing has been listed to fetch." };
  }

  const names = await nameMaps();
  const itemById = new Map(names.itemRows.map((i) => [i.id, i]));
  const day = onDate || todayInDar();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, written: 0, error: "That is not a date." };
  /* ⚠️ A FUTURE DRAW IS REFUSED. It would leave the shelf reading high until
     that date arrived — the exact fault this exists to fix. */
  if (day > todayInDar()) {
    return { ok: false, written: 0, error: "That day has not happened yet. Materials cannot be taken in advance." };
  }

  const wanting = clean.map((d) => ({
    ...d,
    where: itemById.get(d.itemId)?.locationId ?? batch.locationId!,
    name: names.items.get(d.itemId) ?? `Item #${d.itemId}`,
  }));

  const moves: {
    itemId: number; locationId: number; onDate: string; qty: number;
    reason: "consume"; batchId: number | null; note: string;
  }[] = [];
  for (const where of [...new Set(wanting.map((w) => w.where))]) {
    const here = wanting.filter((w) => w.where === where);
    const picked = await pickFefoMany(here.map((w) => ({ itemId: w.itemId, need: Number(w.qty) })), where);
    here.forEach((w, i) => {
      const got = picked[i]!;
      for (const p of got.picks) {
        moves.push({
          itemId: w.itemId, locationId: where, onDate: day,
          qty: -p.qty, reason: "consume", batchId: p.lot.batchId,
          note: `${batch.batchNo} · fetched · ${p.lot.batchNo}`,
        });
      }
      if (got.short > 0.0005) {
        moves.push({
          itemId: w.itemId, locationId: where, onDate: day,
          qty: -got.short, reason: "consume", batchId: null,
          note: `${batch.batchNo} · fetched`,
        });
      }
    });
  }

  /* ⚠️ THE SAME VOUCHER AS THE CLOSE. Everything a batch ever consumed sits
     under `batch`/this id, which is what `batchDetail`, `traceBatch` and
     `drawnByItem` all read — and what makes reopening reverse the draws too.
     NOT `mustNet`: material leaves the shelf and arrives nowhere. */
  const res = await postStockMove(moves, { type: BATCH_VOUCHER, id: batch.id }, by);
  if (!res.ok) return { ok: false, written: 0, error: res.error };
  return { ok: true, written: res.written };
}

/* ------------------------------------------------------------------ *
 * Finishing a batch in more than one go
 * ------------------------------------------------------------------ */

/**
 * How much this batch has already put on the shelf.
 *
 * ⚠️ READ FROM THE LEDGER, like everything else here. The `produce` movements
 * on this batch's voucher ARE the fact; `produced_qty` on the row is what
 * somebody finally said came out, and the two answer different questions.
 */
export async function producedSoFar(batchId: number): Promise<number> {
  const moves = await listMoves({ voucherType: BATCH_VOUCHER, voucherId: batchId });
  return round3(moves.filter((m) => m.reason === "produce").reduce((t, m) => t + m.qty, 0));
}

/**
 * **Put part of a batch on the shelf before it is finished.**
 *
 * ⚠️ THE OWNER'S CASE, IN HIS OWN SHAPE: two hundred bars on Monday and the
 * rest on Wednesday. Until now that was one batch or two and there was no way to
 * say which — so the Monday bars either sat off the books for two days, or
 * somebody opened a second batch and the recipe check for both was nonsense.
 *
 * It is ONE batch that finished in two goes. What comes out early goes on the
 * shelf early, carrying the batch as its lot exactly as the final half will, and
 * closing puts on only what is still outstanding.
 *
 * ⚠️ IT CARRIES NO UNIT COST, AND THAT IS HONEST. What a bar cost is not known
 * until the batch is closed and every material is counted; `itemCostFromMoves`
 * ignores a movement with no cost rather than averaging it in as free, so an
 * early half makes the average incomplete and never makes it wrong.
 *
 * ⚠️ AND THE EXPIRY STILL COMES AT CLOSE, from the batch's own date. Monday's
 * bars and Wednesday's are one lot with one date — the earlier one — which is
 * the conservative direction and the only one a food business should round in.
 */
export async function recordOutput(
  batchId: number, producedQty: number, onDate?: string, by = "web-ui",
): Promise<{ ok: boolean; written: number; error?: string }> {
  const batch = await getBatch(batchId);
  if (!batch) return { ok: false, written: 0, error: "That batch does not exist." };
  if (batch.status !== "running") {
    return { ok: false, written: 0, error: `${batch.batchNo} is not running. Only a batch still being made can put part of itself on the shelf.` };
  }
  if (!batch.itemId || !batch.locationId) {
    return { ok: false, written: 0, error: "This batch does not say what was made, or where. Fill that in first." };
  }
  const qty = Number(producedQty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, written: 0, error: "Say how many came out. Something coming back off the shelf is the batch being closed short, not part of it being finished." };
  }

  const day = onDate || todayInDar();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, written: 0, error: "That is not a date." };
  /* ⚠️ A FUTURE DATE IS REFUSED — it would put chocolate on a shelf that is
     not there yet, and hide it from today's count until that day arrived. */
  if (day > todayInDar()) {
    return { ok: false, written: 0, error: "That day has not happened yet. Chocolate cannot reach a shelf in advance." };
  }

  /* ⚠️ THE SAME VOUCHER AS THE CLOSE, so reopening reverses this too and
     `traceBatch` counts it as part of what the batch made. NOT `mustNet`:
     chocolate arrives on a shelf and leaves nowhere. */
  const res = await postStockMove([{
    itemId: batch.itemId,
    locationId: batch.locationId,
    onDate: day,
    qty,
    reason: "produce" as const,
    batchId: batch.id,
    unitCost: null,
    note: `${batch.batchNo} · part-finished`,
  }], { type: BATCH_VOUCHER, id: batch.id }, by);
  if (!res.ok) return { ok: false, written: 0, error: res.error };
  return { ok: true, written: res.written };
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
  if (error) return { ok: false, error: error.message };
  void recordEvent({
    subjectType: "batch", subjectId: batch.id, subjectRef: batch.batchNo,
    kind: "reopened",
    summary: `Reopened — its movements were reversed, not erased. ${reason.trim()}`,
  }, by);
  return { ok: true };
}

/**
 * Abandon an open batch.
 *
 * ⚠️ IT COSTS NOTHING, AND THAT IS DELIBERATE. Because materials are not
 * consumed until close, abandoning takes nothing off the shelf — so nobody has
 * a reason to avoid opening a batch "just in case". A system that punishes you
 * for starting something is a system people start on paper instead.
 */
export async function cancelBatch(id: number, reason: string | null, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const batch = await getBatch(id);
  if (!batch) return { ok: false, error: "That batch does not exist." };
  if (batch.status === "closed") {
    return { ok: false, error: `${batch.batchNo} is done. Reopen it first — its stock movements have to come back out.` };
  }

  /* ⚠️ A BATCH THAT FETCHED MATERIALS HAS SOMETHING TO PUT BACK, and this is
     the one way abandoning is not free any more. Nothing was CONSUMED — it was
     carried to a bench — so abandoning returns it to the shelf, movement for
     movement, reversed rather than erased. A batch nobody drew from still costs
     exactly nothing, which is the property that matters.

     ⚠️ AND IF SOME OF IT WAS SPOILED, THAT IS A DAMAGE RECORD, not a quieter
     abandonment. Putting it all back and writing off what was ruined keeps the
     two facts apart; leaving it off the shelf would bury a loss inside a batch
     nobody ever finished. */
  const outstanding = await outstandingBatchMoves(batch.id);
  if (outstanding.length > 0) {
    const rev = await postStockMove(
      outstanding.map((m) => ({
        itemId: m.itemId, locationId: m.locationId, onDate: todayInDar(),
        qty: -m.qty, reason: m.reason, batchId: m.batchId,
        note: `Reversal of ${BATCH_VOUCHER} #${batch.id}`,
      })),
      { type: `${BATCH_VOUCHER}:reversal`, id: batch.id },
      by,
    );
    if (!rev.ok) return { ok: false, error: rev.error };
  }

  const { error } = await sb.from("cz_batches").update({
    status: "cancelled",
    notes: [batch.notes, reason?.trim() ? `Abandoned: ${reason.trim()}` : null].filter(Boolean).join(" · ") || null,
    updated_at: NOW(),
  }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  void recordEvent({
    subjectType: "batch", subjectId: batch.id, subjectRef: batch.batchNo,
    kind: "cancelled",
    summary: outstanding.length > 0
      ? `Abandoned. ${outstanding.length} movement${outstanding.length === 1 ? "" : "s"} put back on the shelf.${reason?.trim() ? ` ${reason.trim()}` : ""}`
      : `Abandoned. Nothing had moved.${reason?.trim() ? ` ${reason.trim()}` : ""}`,
  }, by);
  return { ok: true };
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
  /** ⚠️ Whether the live recipe has moved on since this batch was opened.
   *  SAID, never acted on — only the chef knows whether it was corrected or
   *  changed for next time. */
  recipeMoved: boolean;
  /** Which recipe the check is against: the frozen one, or today's. */
  judgedAgainst: "the recipe it was made from" | "today's recipe";
  /**
   * ⚠️ THE PLAN THE CHECK WAS MADE WITH, handed back so no screen builds its
   * own. The batch page was rebuilding it from the LIVE recipe while the check
   * used the frozen one, so the close form's material defaults and its expected
   * quantity would have disagreed with the difference printed above them the
   * moment a recipe changed — the very fault the snapshot exists to end,
   * arriving through a second calculation instead.
   */
  plan: CzBatchPlan | null;
}> {
  const recipe = batch.recipeId ? await getRecipe(batch.recipeId) : null;
  // ⚠️ The recipe it was MADE FROM, not today's. See `plannableFor`.
  const plannable = plannableFor(batch, recipe);
  const plan = plannable ? batchPlan(plannable, batch.recipeMultiple) : null;
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

  return {
    recipe,
    check: batchCheck(batch, plan, used),
    used,
    recipeMoved: batch.status === "running" && snapshotIsStale(batch.recipeSnapshot, recipe),
    judgedAgainst: batch.recipeSnapshot ? "the recipe it was made from" : "today's recipe",
    plan,
  };
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

/**
 * **Pull the recipe in again, as it stands now.**
 *
 * ⚠️ A RUNNING BATCH ONLY. Once a batch is closed its snapshot never changes
 * again — that is the entire point of freezing it, and re-reading a closed one
 * would rewrite the difference somebody has already read and signed off.
 *
 * ⚠️ AND IT IS A DELIBERATE ACT, NEVER AUTOMATIC. A running batch whose recipe
 * has moved on is a real situation with two right answers: the recipe was WRONG
 * and has been corrected, so pull it in; or it was changed for NEXT time and
 * this batch should be left alone. Only the chef knows which, so the screen says
 * the recipe has moved and offers a button.
 */
export async function rereadRecipe(
  id: number,
): Promise<{ ok: boolean; error?: string }> {
  const batch = await getBatch(id);
  if (!batch) return { ok: false, error: "That batch does not exist." };
  if (batch.status !== "running") {
    return { ok: false, error: `${batch.batchNo} is not running. A closed batch keeps the recipe it was made from.` };
  }
  if (!batch.recipeId) {
    return { ok: false, error: `${batch.batchNo} was opened without a recipe, so there is nothing to read.` };
  }
  const recipe = await getRecipe(batch.recipeId);
  if (!recipe) return { ok: false, error: "That recipe no longer exists." };

  /* The expected quantity follows the recipe in, or the batch would be measured
     against a target the new recipe does not support. */
  const plan = batchPlan(recipe, batch.recipeMultiple);
  const { error } = await sb.from("cz_batches").update({
    recipe_snapshot: snapshotRecipe(recipe, NOW()),
    planned_qty: plan.expectedQty,
    updated_at: NOW(),
  }).eq("id", id).eq("status", "running");
  if (error) return { ok: false, error: error.message };
  void recordEvent({
    subjectType: "batch", subjectId: batch.id, subjectRef: batch.batchNo,
    kind: "updated",
    summary: `The corrected ${recipe.name} was pulled in — this batch is now measured against it.`,
  });
  return { ok: true };
}
