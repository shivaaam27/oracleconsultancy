import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listLocations, stockOnHand } from "@/lib/cocozuri-stock";
import { todayInDar } from "@/lib/cocozuri-stock-shared";
import { getRecipe, listRecipes } from "@/lib/cocozuri-recipe";
import { batchPlan } from "@/lib/cocozuri-batch-shared";
import { openBatch } from "@/lib/cocozuri-batch";
import { recordEvent } from "@/lib/cocozuri-events";
import {
  nextPlanRef, planBlockers, planMaterials,
  type CzPlan, type CzPlanLine, type CzPlanMaterial, type CzPlanStatus,
} from "@/lib/cocozuri-plan-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri Stage C — what to MAKE today. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ A PLAN MOVES NO STOCK AND CREATES NOTHING. Nothing in this file calls
 * `postStockMove`, and nothing should. A line becomes real only when somebody
 * starts a batch from it — and that goes through `openBatch`, the one door that
 * already exists, rather than a second way of opening one.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** ⚠️ ONE STRING LITERAL — a split one widens to `string`. */
const PLAN_COLS = "id,reference,on_date,location_id,status,notes,created_by";
const LINE_COLS = "id,plan_id,line_no,item_id,recipe_id,qty,batch_id,note";

async function context() {
  const [items, locations, { data: recipeRows }, { data: batchRows }] = await Promise.all([
    listItems(),
    listLocations({ includeInactive: true }),
    sb.from("cz_recipes").select("id,name"),
    sb.from("cz_batches").select("id,batch_no,status,produced_qty"),
  ]);
  return {
    itemById: new Map(items.map((i) => [i.id, i])),
    locationName: new Map(locations.map((l) => [l.id, l.name])),
    recipeName: new Map(((recipeRows ?? []) as Record<string, unknown>[])
      .map((r) => [r.id as number, (r.name as string) ?? ""])),
    batchById: new Map(((batchRows ?? []) as Record<string, unknown>[]).map((b) => [
      b.id as number,
      {
        batchNo: (b.batch_no as string) ?? "",
        status: (b.status as string) ?? "",
        producedQty: b.produced_qty == null ? null : num(b.produced_qty),
      },
    ])),
  };
}

type Ctx = Awaited<ReturnType<typeof context>>;

function toLine(r: Record<string, unknown>, ctx: Ctx): CzPlanLine {
  const itemId = r.item_id as number;
  const item = ctx.itemById.get(itemId);
  const batchId = (r.batch_id as number | null) ?? null;
  const batch = batchId == null ? null : ctx.batchById.get(batchId);
  const recipeId = (r.recipe_id as number | null) ?? null;
  return {
    id: r.id as number,
    lineNo: (r.line_no as number) ?? 1,
    itemId,
    itemName: item?.name ?? `Item #${itemId}`,
    uom: item?.uom ?? "PCS",
    recipeId,
    recipeName: recipeId == null ? null : ctx.recipeName.get(recipeId) ?? null,
    qty: num(r.qty),
    batchId,
    batchNo: batch?.batchNo ?? null,
    batchStatus: batch?.status ?? null,
    madeQty: batch?.producedQty ?? null,
    note: (r.note as string | null) ?? null,
  };
}

function toPlan(r: Record<string, unknown>, lines: CzPlanLine[], ctx: Ctx): CzPlan {
  const locationId = r.location_id as number;
  return {
    id: r.id as number,
    reference: (r.reference as string) ?? "",
    onDate: r.on_date as string,
    locationId,
    locationName: ctx.locationName.get(locationId) ?? null,
    status: ((r.status as string) ?? "draft") as CzPlanStatus,
    notes: (r.notes as string | null) ?? null,
    createdBy: (r.created_by as string) ?? "web-ui",
    lines,
  };
}

/* ------------------------------- reading ------------------------------- */

export async function listPlans(opts?: { from?: string; to?: string }): Promise<CzPlan[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_production_plans").select(PLAN_COLS).eq("company_id", company.id);
  if (opts?.from) q = q.gte("on_date", opts.from);
  if (opts?.to) q = q.lte("on_date", opts.to);

  const [{ data, error }, ctx] = await Promise.all([
    q.order("on_date", { ascending: false }).order("id", { ascending: false }),
    context(),
  ]);
  // ⚠️ Said out loud — an empty list and a failed query look identical.
  if (error) {
    console.error("[cocozuri] listPlans failed:", error.message);
    return [];
  }
  const rows = data ?? [];
  const ids = rows.map((r) => r.id as number);
  const { data: lineRows } = ids.length
    ? await sb.from("cz_production_plan_lines").select(LINE_COLS).in("plan_id", ids).order("line_no")
    : { data: [] as Record<string, unknown>[] };

  const byPlan = new Map<number, CzPlanLine[]>();
  for (const r of (lineRows ?? []) as Record<string, unknown>[]) {
    const key = r.plan_id as number;
    const at = byPlan.get(key);
    if (at) at.push(toLine(r, ctx)); else byPlan.set(key, [toLine(r, ctx)]);
  }
  return rows.map((r) => toPlan(r as Record<string, unknown>, byPlan.get(r.id as number) ?? [], ctx));
}

export async function getPlan(id: number): Promise<CzPlan | null> {
  const [{ data }, ctx] = await Promise.all([
    sb.from("cz_production_plans").select(PLAN_COLS).eq("id", id).maybeSingle(),
    context(),
  ]);
  if (!data) return null;
  const { data: lineRows } = await sb.from("cz_production_plan_lines")
    .select(LINE_COLS).eq("plan_id", id).order("line_no");
  return toPlan(
    data as Record<string, unknown>,
    ((lineRows ?? []) as Record<string, unknown>[]).map((r) => toLine(r, ctx)),
    ctx,
  );
}

export async function getPlanByRef(reference: string): Promise<CzPlan | null> {
  const company = await cocozuriCompany();
  if (!company) return null;
  const { data } = await sb.from("cz_production_plans")
    .select("id").eq("company_id", company.id).eq("reference", reference).maybeSingle();
  return data ? getPlan(data.id as number) : null;
}

/**
 * What a plan will consume, and whether the shelf covers it.
 *
 * ⚠️ THE MATERIALS COME OFF WHICHEVER SHELF EACH ONE SITS ON, not off the
 * kitchen the plan is for. A raw material lives on the raw-materials shelf and
 * always has; asking the kitchen for it would report every material as missing.
 */
export async function planNeeds(plan: CzPlan): Promise<{
  materials: CzPlanMaterial[]; linesWithoutRecipe: number;
}> {
  const recipeIds = [...new Set(plan.lines.map((l) => l.recipeId).filter((r): r is number => r != null))];
  const recipes = new Map<number, { yieldQty: number; materials: { itemId: number; itemName: string; uom: string; qty: number }[] }>();

  for (const id of recipeIds) {
    const recipe = await getRecipe(id);
    if (!recipe) continue;
    /* ⚠️ ONE BATCH OF IT, and `batchPlan` is what the batch form uses — so the
       plan and the batch can never quote different material figures for the
       same recipe. */
    const one = batchPlan(recipe, 1);
    recipes.set(id, {
      yieldQty: one.expectedQty,
      materials: one.materials.map((m) => ({
        itemId: m.itemId, itemName: m.itemName, uom: m.uom, qty: m.qty,
      })),
    });
  }

  // Every shelf, because a material sits where it sits.
  const locations = await listLocations({ includeInactive: true });
  const onHand = new Map<number, number>();
  for (const l of locations) {
    for (const [itemId, qty] of await stockOnHand(l.id)) {
      onHand.set(itemId, (onHand.get(itemId) ?? 0) + qty);
    }
  }

  return planMaterials(
    plan.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, recipeId: l.recipeId })),
    recipes,
    onHand,
  );
}

/* ------------------------------- writing ------------------------------- */

export type PlanInput = {
  locationId: number;
  onDate?: string;
  notes?: string | null;
  lines: { itemId: number; recipeId?: number | null; qty: number; note?: string | null }[];
};

/**
 * **Raise a plan for a day.**
 *
 * ⚠️ IT LANDS AS A DRAFT AND MOVES NOTHING. A plan is what somebody intends;
 * until a batch is started from a line, no chocolate exists and no material has
 * left a shelf.
 *
 * ⚠️ AS MANY A DAY AS YOU LIKE. The morning one and the special order that comes
 * in at eleven are two plans, or one plan with a line added — both are ordinary.
 * Nothing here is limited to one a day.
 */
export async function createPlan(
  input: PlanInput, by = "web-ui",
): Promise<{ ok: boolean; id?: number; reference?: string; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const onDate = input.onDate || todayInDar();

  const blockers = planBlockers({
    locationId: input.locationId ?? null,
    onDate,
    lines: (input.lines ?? []).map((l) => ({ itemId: l.itemId, qty: num(l.qty) })),
  });
  if (blockers.length) return { ok: false, error: blockers[0] };

  const clean = input.lines.filter((l) => l.itemId && num(l.qty) > 0);

  /* ⚠️ THE SHELF IS RE-CHECKED AGAINST THE REAL ITEMS, never trusted from the
     form. The suggestions are fetched per kitchen, but a form that had been open
     while the kitchen changed — or any other caller — could send an item that
     belongs somewhere else, and a plan to make the shop's chocolate in the
     kitchen would open a batch on the wrong shelf. */
  const ctx = await context();
  for (const l of clean) {
    const item = ctx.itemById.get(l.itemId);
    if (!item || item.locationId !== input.locationId) {
      return { ok: false, error: "Something on the list is not made on that kitchen's shelf." };
    }
  }

  const { data: taken } = await sb.from("cz_production_plans")
    .select("reference").eq("company_id", company.id);
  const existing = (taken ?? []).map((r) => r.reference as string);

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = nextPlanRef(existing, onDate);
    const { data, error } = await sb.from("cz_production_plans").insert({
      company_id: company.id,
      reference,
      on_date: onDate,
      location_id: input.locationId,
      status: "draft",
      notes: input.notes?.trim() || null,
      created_by: by,
      updated_at: NOW(),
    }).select("id").maybeSingle();

    if (error) {
      // 23505 = somebody took that reference between the read and the write.
      if (error.code === "23505") { existing.push(reference); continue; }
      return { ok: false, error: error.message };
    }
    const id = data?.id as number;

    const { error: lineErr } = await sb.from("cz_production_plan_lines").insert(
      clean.map((l, i) => ({
        company_id: company.id,
        plan_id: id,
        line_no: i + 1,
        item_id: l.itemId,
        recipe_id: l.recipeId ?? null,
        qty: num(l.qty),
        note: l.note?.trim() || null,
      })),
    );
    if (lineErr) {
      // A plan with no lines is worse than no plan — take it back out.
      await sb.from("cz_production_plans").delete().eq("id", id);
      return { ok: false, error: lineErr.message };
    }
    void recordEvent({
      subjectType: "plan", subjectId: id, subjectRef: reference,
      kind: "created",
      summary: `Raised for ${onDate}, ${clean.length} line${clean.length === 1 ? "" : "s"}. Nothing has moved.`,
    }, by);
    return { ok: true, id, reference };
  }
  return { ok: false, error: "Could not allocate a reference for this plan." };
}

/**
 * Change a plan.
 *
 * ⚠️ LINES THAT HAVE BECOME BATCHES ARE KEPT, WHATEVER THE CALLER SENDS. The
 * whole-list replace that every other document here uses would delete a line
 * somebody had already started making — and the batch would go on existing with
 * nothing left explaining why it was opened.
 */
export async function updatePlan(
  id: number, input: Partial<PlanInput>,
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const plan = await getPlan(id);
  if (!plan) return { ok: false, error: "That plan does not exist." };
  if (plan.status === "cancelled") return { ok: false, error: `${plan.reference} was cancelled.` };

  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.onDate) patch.on_date = input.onDate;
  if (input.locationId) patch.location_id = input.locationId;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  if (input.lines) {
    const started = plan.lines.filter((l) => l.batchId != null);
    const clean = input.lines.filter((l) => l.itemId && num(l.qty) > 0);
    if (clean.length === 0 && started.length === 0) {
      return { ok: false, error: "Nothing has been listed to make." };
    }
    /* ⚠️ Only the NOT-YET-STARTED lines are replaced. A started one keeps its
       row, its batch and its line number. */
    const startedIds = started.map((l) => l.id);
    let del = sb.from("cz_production_plan_lines").delete().eq("plan_id", id);
    if (startedIds.length) del = del.not("id", "in", `(${startedIds.join(",")})`);
    const { error: delErr } = await del;
    if (delErr) return { ok: false, error: delErr.message };

    if (clean.length) {
      /* ⚠️ PAST THE HIGHEST, not past the COUNT. Started lines may have gaps in
         their numbering — lines 1 and 3 with 2 deleted — and counting them would
         re-issue number 2 and put the new line in the middle of the list. */
      let lineNo = started.reduce((h, l) => Math.max(h, l.lineNo), 0);
      const { error: lineErr } = await sb.from("cz_production_plan_lines").insert(
        clean.map((l) => ({
          company_id: company.id,
          plan_id: id,
          line_no: ++lineNo,
          item_id: l.itemId,
          recipe_id: l.recipeId ?? null,
          qty: num(l.qty),
          note: l.note?.trim() || null,
        })),
      );
      if (lineErr) return { ok: false, error: lineErr.message };
    }
  }

  const { error } = await sb.from("cz_production_plans").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Issue it — the kitchen's copy of the day. Still moves nothing. */
export async function issuePlan(id: number, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await sb.from("cz_production_plans")
    .update({ status: "issued", updated_at: NOW() })
    .eq("id", id).eq("status", "draft").select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That plan is not a draft any more." };
  void recordEvent({
    subjectType: "plan", subjectId: id, kind: "issued",
    summary: "Issued to the kitchen. It still moves nothing.",
  }, by);
  return { ok: true };
}

/**
 * Cancel a plan.
 *
 * ⚠️ IT REFUSES ONCE ANY LINE HAS BEEN STARTED. Cancelling would say the day's
 * work was never asked for, while a batch carrying its materials is running in
 * the kitchen. Abandon the batches first, or simply let the plan stand — it
 * costs nothing and it is the record of what was intended.
 */
export async function cancelPlan(id: number, reason: string | null, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const plan = await getPlan(id);
  if (!plan) return { ok: false, error: "That plan does not exist." };
  // ⚠️ Same rule as `deletePlan`: an abandoned batch is not work in progress.
  const started = plan.lines.filter((l) => l.batchId != null && l.batchStatus !== "cancelled");
  if (started.length > 0) {
    return {
      ok: false,
      error: `${started.length} line${started.length === 1 ? " has" : "s have"} already been started as a batch. Abandon those first, or leave the plan standing — it is the record of what was intended.`,
    };
  }
  const { error } = await sb.from("cz_production_plans").update({
    status: "cancelled",
    notes: [plan.notes, reason?.trim() ? `Cancelled: ${reason.trim()}` : null].filter(Boolean).join(" · ") || null,
    updated_at: NOW(),
  }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  void recordEvent({
    subjectType: "plan", subjectId: id, subjectRef: plan.reference,
    kind: "cancelled",
    summary: `Cancelled.${reason?.trim() ? ` ${reason.trim()}` : ""}`,
  }, by);
  return { ok: true };
}

/**
 * Delete a plan for good.
 *
 * ⚠️ A DRAFT ONLY, and only while nothing has been started — the Stage A rule.
 * An issued plan is what the kitchen was handed; it is cancelled, not erased.
 */
export async function deletePlan(id: number, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const plan = await getPlan(id);
  if (!plan) return { ok: false, error: "That plan does not exist." };
  /* ⚠️ A CANCELLED BATCH IS NOT REAL WORK ANY MORE — it was abandoned and its
     movements reversed. Blocking on one would leave a plan that only ever
     produced abandoned batches undeletable for ever, which contradicts the rule
     that an abandoned batch frees its line. */
  const live = plan.lines.filter((l) => l.batchId != null && l.batchStatus !== "cancelled");
  if (live.length > 0) {
    return { ok: false, error: "A line has been started as a batch. That batch is real work — the plan stays." };
  }
  if (plan.status === "issued") {
    return { ok: false, error: `${plan.reference} has been issued. Cancel it instead — the kitchen was handed it.` };
  }
  const { error } = await sb.from("cz_production_plans").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  /* ⚠️ The reference is FROZEN on the event, so this still reads after the plan
     itself is gone. That is the whole reason `subject_ref` exists. */
  void recordEvent({
    subjectType: "plan", subjectId: null, subjectRef: plan.reference,
    kind: "deleted", summary: `${plan.reference} was deleted. Nothing had been started from it.`,
  }, by);
  return { ok: true };
}

/**
 * **Start a batch from a plan line.**
 *
 * ⚠️ IT GOES THROUGH `openBatch`, the door that already exists. A second way of
 * opening a batch would be a second set of rules about numbering, about what a
 * batch needs, and about what the recipe means — and they would drift.
 *
 * ⚠️ A LINE MAY BE STARTED ONCE. Starting it twice would put the same chocolate
 * on the shelf twice and leave nobody able to say which batch the plan meant.
 */
export async function startLine(
  lineId: number, by = "web-ui",
): Promise<{ ok: boolean; batchNo?: string; error?: string }> {
  const { data: row } = await sb.from("cz_production_plan_lines")
    .select(LINE_COLS).eq("id", lineId).maybeSingle();
  if (!row) return { ok: false, error: "That line no longer exists." };
  /* ⚠️ AN ABANDONED BATCH FREES THE LINE. A line locked to a batch somebody
     gave up on could never be started again, and the day's work still needs
     doing — which would leave the only route as raising a whole new plan. A
     RUNNING or CLOSED batch still blocks: starting twice would put the same
     chocolate on the shelf twice. */
  if (row.batch_id != null) {
    const ctx = await context();
    const existing = ctx.batchById.get(row.batch_id as number);
    if (!existing || existing.status !== "cancelled") {
      return { ok: false, error: "That line has already been started." };
    }
  }

  const plan = await getPlan(row.plan_id as number);
  if (!plan) return { ok: false, error: "That plan no longer exists." };
  if (plan.status === "cancelled") return { ok: false, error: `${plan.reference} was cancelled.` };

  const recipeId = (row.recipe_id as number | null) ?? null;
  /* ⚠️ The MULTIPLE is worked out from the recipe's own good-unit yield, exactly
     as the batch form does it — so a plan for 200 opens the same batch somebody
     would have opened by hand. */
  let recipeMultiple = 1;
  if (recipeId != null) {
    const recipe = await getRecipe(recipeId);
    const one = recipe ? batchPlan(recipe, 1) : null;
    if (one && one.expectedQty > 0) recipeMultiple = num(row.qty) / one.expectedQty;
  }

  const opened = await openBatch({
    itemId: row.item_id as number,
    locationId: plan.locationId,
    recipeId,
    recipeMultiple,
    madeOn: plan.onDate > todayInDar() ? todayInDar() : plan.onDate,
    notes: `From ${plan.reference}`,
  }, by);
  if (!opened.ok) return { ok: false, error: opened.error };

  const { error } = await sb.from("cz_production_plan_lines")
    .update({ batch_id: opened.id }).eq("id", lineId);
  if (error) {
    /* The batch exists and the line does not know about it. Say so rather than
       leaving somebody to wonder why the line still reads "not started". */
    return {
      ok: false,
      error: `${opened.batchNo} was opened, but the plan line could not be linked to it: ${error.message}`,
    };
  }
  void recordEvent({
    subjectType: "plan", subjectId: plan.id, subjectRef: plan.reference,
    kind: "started",
    summary: `${opened.batchNo} was started from this plan.`,
    detail: { batchNo: opened.batchNo, lineId },
  }, by);
  return { ok: true, batchNo: opened.batchNo };
}

/* ------------------------------------------------------------------ *
 * Suggesting a plan
 * ------------------------------------------------------------------ */

/**
 * What might be worth making, from what is actually selling.
 *
 * ⚠️ IT IS A STARTING POINT, NOT AN ANSWER. Every figure is a suggestion the
 * kitchen types over — the same stance as the order form's, and for the same
 * reason: the person raising the plan knows about the wedding on Saturday and
 * the software does not.
 */
export async function suggestPlan(locationId: number): Promise<{
  itemId: number; itemName: string; uom: string; onHand: number;
  recipeId: number | null; recipeName: string | null; yieldQty: number | null;
  /** ⚠️ How many could be made RIGHT NOW from what is on the shelf. Null when
   *  the recipe names nothing, which is not the same as none. */
  couldMake: number | null;
  /** Which material runs out first — the one to buy. */
  limitedBy: string | null;
}[]> {
  const [items, recipes, onHand] = await Promise.all([
    listItems({ locationId }),
    listRecipes({ status: "active" }),
    stockOnHand(locationId),
  ]);

  // ⚠️ The DEFAULT recipe wins where an item has several — several active
  // recipes per item is correct, and one of them is marked the usual one.
  const byItem = new Map<number, typeof recipes[number]>();
  for (const r of recipes) {
    if (r.outputItemId == null) continue;
    const at = byItem.get(r.outputItemId);
    if (!at || (r.isDefault && !at.isDefault)) byItem.set(r.outputItemId, r);
  }

  /* ⚠️ WHAT COULD BE MADE TODAY, from every shelf — a raw material lives on the
     raw-materials shelf and always has, so asking the kitchen for it would
     report every recipe as impossible. */
  const locations = await listLocations({ includeInactive: true });
  const everywhere = new Map<number, number>();
  for (const l of locations) {
    for (const [itemId, qty] of await stockOnHand(l.id)) {
      everywhere.set(itemId, (everywhere.get(itemId) ?? 0) + qty);
    }
  }

  return items
    .filter((i) => byItem.has(i.id))
    .map((i) => {
      const recipe = byItem.get(i.id)!;
      const plan = batchPlan(recipe, 1);

      /* ⚠️ THE SMALLEST NUMBER OF BATCHES ANY ONE MATERIAL ALLOWS. Reporting
         the average, or ignoring the material that runs out first, would say a
         recipe is possible when it is not — which is a batch abandoned halfway
         through a morning. A material the recipe asks nothing of is skipped;
         one with NOTHING on the shelf makes the answer nought, not infinity. */
      let batches: number | null = null;
      let limitedBy: string | null = null;
      for (const m of plan.materials) {
        if (m.qty <= 0) continue;
        const can = (everywhere.get(m.itemId) ?? 0) / m.qty;
        if (batches == null || can < batches) { batches = can; limitedBy = m.itemName; }
      }

      return {
        itemId: i.id,
        itemName: i.name,
        uom: i.uom,
        onHand: Math.round((onHand.get(i.id) ?? 0) * 1000) / 1000,
        recipeId: recipe.id,
        recipeName: recipe.name,
        yieldQty: plan.expectedQty > 0 ? plan.expectedQty : null,
        couldMake: batches == null || plan.expectedQty <= 0
          ? null
          : Math.floor(batches * plan.expectedQty),
        limitedBy: batches != null && batches < 1 ? limitedBy : null,
      };
    })
    // ⚠️ Emptiest shelf first — the house rule for a list somebody acts on.
    .sort((a, b) => a.onHand - b.onHand || a.itemName.localeCompare(b.itemName));
}
