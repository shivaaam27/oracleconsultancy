import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listMoves, listLocations } from "@/lib/cocozuri-stock";
import {
  itemCostFromMoves, recipeBlockers,
  type CzItemCost, type CzRecipe, type CzRecipeKind, type CzRecipeLine, type CzRecipeStatus,
} from "@/lib/cocozuri-recipe-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 3 — recipes. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE. It pulls in `sb`, which drags
 * @/db/supabase into the browser bundle and kills every page with
 * "SUPABASE_SERVICE_ROLE_KEY is not set". The client-safe twin is
 * `cocozuri-recipe-shared.ts`, and ALL the arithmetic lives there, tested.
 *
 * ⚠️ ONE DOOR FOR WRITES. The functions below are the only things that write
 * `cz_recipes` and `cz_recipe_lines`; the actions in `app/cocozuri/actions.ts`
 * are thin wrappers. Same discipline as `createTaskCore`, `postVoucher()`,
 * `postStockMove()` and `createPurchase`.
 *
 * ⚠️ NOTHING HERE WRITES A COST. A recipe is an instruction, not a document —
 * what a batch actually consumed will be the Stage 4 movements, and what it
 * cost will be worked out from those. Storing a cost on the recipe would be a
 * second, stale answer to the same question.
 *
 * Read `memory/cocozuri_manufacturing_plan.md` §4 Stage 3 first.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** ⚠️ ONE STRING LITERAL, NOT A CONCATENATION. Split across a `+` and the
 *  Supabase client can no longer read the column list at type level: every row
 *  degrades to an error type and the file stops compiling for a reason that
 *  looks completely unrelated. */
const RECIPE_COLS = "id,name,output_item_id,yield_qty,yield_uom,expected_loss_percent,other_cost,other_cost_note,status,is_default,notes";
const LINE_COLS = "id,recipe_id,line_no,item_id,kind,qty,uom,notes";

function toLine(r: Record<string, unknown>, names: Map<number, string>): CzRecipeLine {
  const itemId = r.item_id as number;
  return {
    id: r.id as number,
    lineNo: (r.line_no as number) ?? 1,
    itemId,
    // ⚠️ Read live, NOT frozen. A recipe is a live instruction, unlike an
    // invoice line — renaming a material should change every recipe that uses
    // it, because they all mean the same bag.
    itemName: names.get(itemId) ?? `Item #${itemId}`,
    kind: ((r.kind as string) ?? "ingredient") as CzRecipeKind,
    qty: num(r.qty),
    uom: (r.uom as string) || "PCS",
    notes: (r.notes as string | null) ?? null,
  };
}

function toRecipe(
  r: Record<string, unknown>,
  lines: CzRecipeLine[],
  names: Map<number, string>,
  itemLocation: Map<number, { id: number; name: string }>,
): CzRecipe {
  const outputItemId = r.output_item_id as number;
  const where = itemLocation.get(outputItemId) ?? null;
  return {
    id: r.id as number,
    name: (r.name as string) ?? "",
    outputItemId,
    outputItemName: names.get(outputItemId) ?? `Item #${outputItemId}`,
    outputLocationId: where?.id ?? null,
    outputLocationName: where?.name ?? null,
    yieldQty: num(r.yield_qty),
    yieldUom: (r.yield_uom as string) || "PCS",
    expectedLossPercent: num(r.expected_loss_percent),
    otherCost: num(r.other_cost),
    otherCostNote: (r.other_cost_note as string | null) ?? null,
    status: ((r.status as string) ?? "draft") as CzRecipeStatus,
    isDefault: (r.is_default as boolean) ?? false,
    notes: (r.notes as string | null) ?? null,
    lines,
  };
}

/**
 * Every stock item's name and where it sits.
 *
 * ⚠️ THE PRODUCT'S NAME WINS WHERE ONE IS LINKED, exactly as the stock sheets
 * do it — so a merge in the catalogue cannot leave two names for one thing on a
 * recipe.
 */
async function itemNames(): Promise<{
  names: Map<number, string>;
  itemLocation: Map<number, { id: number; name: string }>;
}> {
  const [items, locations, { data: products }] = await Promise.all([
    listItems(),
    listLocations({ includeInactive: true }),
    sb.from("cz_products").select("id,name"),
  ]);
  const productName = new Map((products ?? []).map((p) => [p.id as number, p.name as string]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  return {
    names: new Map(
      items.map((i) => [i.id, (i.productId != null ? productName.get(i.productId) : null) ?? i.name]),
    ),
    itemLocation: new Map(
      items.map((i) => {
        const l = locationById.get(i.locationId);
        return [i.id, { id: i.locationId, name: l?.name ?? "" }];
      }),
    ),
  };
}

/**
 * Every recipe, with its lines.
 *
 * ⚠️ TWO QUERIES, NOT ONE PER ROW — the lines come back in a single `in`, the
 * same reason `listPurchases` and `booksStateFor` do it.
 */
export async function listRecipes(opts?: { status?: CzRecipeStatus; outputItemId?: number }): Promise<CzRecipe[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_recipes").select(RECIPE_COLS).eq("company_id", company.id);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.outputItemId) q = q.eq("output_item_id", opts.outputItemId);
  const { data, error } = await q.order("name");
  // ⚠️ Said out loud — an empty list and a failed query look identical on a
  // screen, and only one of them is true.
  if (error) {
    console.error("[cocozuri] listRecipes failed:", error.message);
    return [];
  }
  const rows = data ?? [];
  const ids = rows.map((r) => r.id as number);
  const [{ data: lineRows }, meta] = await Promise.all([
    ids.length
      ? sb.from("cz_recipe_lines").select(LINE_COLS).in("recipe_id", ids).order("line_no")
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    itemNames(),
  ]);
  const byRecipe = new Map<number, CzRecipeLine[]>();
  for (const r of (lineRows ?? []) as Record<string, unknown>[]) {
    const key = r.recipe_id as number;
    const bucket = byRecipe.get(key);
    if (bucket) bucket.push(toLine(r, meta.names));
    else byRecipe.set(key, [toLine(r, meta.names)]);
  }
  return rows.map((r) =>
    toRecipe(r as Record<string, unknown>, byRecipe.get(r.id as number) ?? [], meta.names, meta.itemLocation));
}

export async function getRecipe(id: number): Promise<CzRecipe | null> {
  const company = await cocozuriCompany();
  if (!company) return null;
  const { data } = await sb.from("cz_recipes").select(RECIPE_COLS)
    .eq("company_id", company.id).eq("id", id).maybeSingle();
  if (!data) return null;
  const [{ data: lineRows }, meta] = await Promise.all([
    sb.from("cz_recipe_lines").select(LINE_COLS).eq("recipe_id", id).order("line_no"),
    itemNames(),
  ]);
  return toRecipe(
    data as Record<string, unknown>,
    ((lineRows ?? []) as Record<string, unknown>[]).map((r) => toLine(r, meta.names)),
    meta.names,
    meta.itemLocation,
  );
}

/* --------------------------- what things cost --------------------------- */

/**
 * What every material costs, worked out from the stock ledger.
 *
 * ⚠️ ONE QUERY FOR THE WHOLE LEDGER, NOT ONE PER MATERIAL. A recipe screen
 * showing twenty ingredients would otherwise ask twenty times, and the costing
 * page shows every recipe at once.
 *
 * ⚠️ IT READS THE LANDED COST that Stage 2 wrote onto each `receipt` movement —
 * goods net of VAT plus that line's share of the freight. Nothing else in COS
 * knows what a bag of almonds actually cost.
 */
export async function materialCosts(itemIds?: number[]): Promise<Map<number, CzItemCost>> {
  const moves = await listMoves(itemIds && itemIds.length ? { itemIds } : undefined);
  const ids = itemIds && itemIds.length ? itemIds : [...new Set(moves.map((m) => m.itemId))];
  return new Map(ids.map((id) => [id, itemCostFromMoves(id, moves)]));
}

/* ------------------------------- writes ------------------------------- */

export type RecipeLineInput = {
  itemId: number;
  kind?: CzRecipeKind;
  qty: number;
  uom?: string | null;
  notes?: string | null;
};

export type RecipeInput = {
  name: string;
  outputItemId: number;
  yieldQty: number;
  yieldUom?: string | null;
  expectedLossPercent?: number;
  otherCost?: number;
  otherCostNote?: string | null;
  notes?: string | null;
  lines: RecipeLineInput[];
};

/**
 * Write a recipe down.
 *
 * ⚠️ IT LANDS AS A DRAFT. A recipe nobody has checked should not be what Stage 4
 * reaches for when somebody is standing in a kitchen at seven in the morning.
 * Making it active is a separate, deliberate act.
 */
export async function createRecipe(input: RecipeInput, by = "web-ui"): Promise<{ ok: boolean; id?: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const check = await validate(input);
  if (check) return { ok: false, error: check };

  const { data, error } = await sb.from("cz_recipes").insert({
    company_id: company.id,
    name: input.name.trim(),
    output_item_id: input.outputItemId,
    yield_qty: input.yieldQty,
    yield_uom: input.yieldUom?.trim() || "PCS",
    expected_loss_percent: input.expectedLossPercent ?? 0,
    other_cost: input.otherCost ?? 0,
    other_cost_note: input.otherCostNote?.trim() || null,
    notes: input.notes?.trim() || null,
    created_by: by,
    updated_at: NOW(),
  }).select("id").maybeSingle();
  if (error) {
    return { ok: false, error: error.code === "23505" ? "There is already a recipe with that name." : error.message };
  }
  const id = data?.id as number;
  const written = await writeLines(company.id, id, input.lines);
  if (!written.ok) return written;
  return { ok: true, id };
}

/**
 * Change a recipe.
 *
 * ⚠️ AN ACTIVE RECIPE MAY BE EDITED, AND THAT IS DELIBERATE. Unlike an invoice
 * or a purchase, a recipe is not a document somebody has acted on — it is a live
 * instruction, and the kitchen changing a quantity is the ordinary case. What a
 * batch ACTUALLY consumed is recorded by Stage 4's movements, so editing a
 * recipe can never rewrite the cost of something already made.
 */
export async function updateRecipe(id: number, input: Partial<RecipeInput>): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const current = await getRecipe(id);
  if (!current) return { ok: false, error: "That recipe does not exist." };

  const merged: RecipeInput = {
    name: input.name ?? current.name,
    outputItemId: input.outputItemId ?? current.outputItemId,
    yieldQty: input.yieldQty ?? current.yieldQty,
    expectedLossPercent: input.expectedLossPercent ?? current.expectedLossPercent,
    otherCost: input.otherCost ?? current.otherCost,
    otherCostNote: input.otherCostNote !== undefined ? input.otherCostNote : current.otherCostNote,
    lines: input.lines ?? current.lines.map((l) => ({ itemId: l.itemId, kind: l.kind, qty: l.qty, uom: l.uom, notes: l.notes })),
  };
  const check = await validate(merged);
  if (check) return { ok: false, error: check };

  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.outputItemId !== undefined) patch.output_item_id = input.outputItemId;
  if (input.yieldQty !== undefined) patch.yield_qty = input.yieldQty;
  if (input.yieldUom !== undefined) patch.yield_uom = input.yieldUom?.trim() || "PCS";
  if (input.expectedLossPercent !== undefined) patch.expected_loss_percent = input.expectedLossPercent;
  if (input.otherCost !== undefined) patch.other_cost = input.otherCost;
  if (input.otherCostNote !== undefined) patch.other_cost_note = input.otherCostNote?.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { error } = await sb.from("cz_recipes").update(patch).eq("id", id);
  if (error) {
    return { ok: false, error: error.code === "23505" ? "There is already a recipe with that name." : error.message };
  }
  if (input.lines) {
    await sb.from("cz_recipe_lines").delete().eq("recipe_id", id);
    const written = await writeLines(company.id, id, input.lines);
    if (!written.ok) return written;
  }
  return { ok: true };
}

/**
 * Make a recipe usable, or take it out of use.
 *
 * ⚠️ IT REFUSES TO ACTIVATE ONE THAT DOES NOT ADD UP. The blockers are checked
 * again here rather than trusted from the form — activating is the moment a
 * recipe becomes something a kitchen will follow.
 */
export async function setRecipeStatus(id: number, status: CzRecipeStatus): Promise<{ ok: boolean; error?: string }> {
  const recipe = await getRecipe(id);
  if (!recipe) return { ok: false, error: "That recipe does not exist." };
  if (status === "active") {
    const blockers = recipeBlockers(recipe);
    if (blockers.length) return { ok: false, error: blockers[0] };
  }
  const patch: Record<string, unknown> = { status, updated_at: NOW() };
  // Something out of use cannot also be the one everything reaches for first.
  if (status !== "active") patch.is_default = false;
  const { error } = await sb.from("cz_recipes").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Mark the recipe the order form and Stage 4 should reach for first.
 *
 * ⚠️ ONE DEFAULT PER OUTPUT, ENFORCED HERE. Two defaults for the same chocolate
 * is a question with two answers, and the code that has to pick one would pick
 * whichever the database happened to return first — which is not a decision
 * anybody made.
 *
 * ⚠️ AND ONLY AN ACTIVE RECIPE. A draft nobody has checked must not become what
 * a kitchen follows by default.
 */
export async function setRecipeDefault(id: number): Promise<{ ok: boolean; error?: string }> {
  const recipe = await getRecipe(id);
  if (!recipe) return { ok: false, error: "That recipe does not exist." };
  if (recipe.status !== "active") {
    return { ok: false, error: `"${recipe.name}" is a ${recipe.status}. Make it active before it becomes the one to use.` };
  }
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  await sb.from("cz_recipes").update({ is_default: false, updated_at: NOW() })
    .eq("company_id", company.id).eq("output_item_id", recipe.outputItemId);
  const { error } = await sb.from("cz_recipes").update({ is_default: true, updated_at: NOW() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * ⚠️ ARCHIVE IS THE NORMAL ANSWER, as everywhere else in COS — and since Stage 4
 * a recipe SOMETHING HAS BEEN MADE FROM cannot be deleted at all. The batch is
 * the record of a real morning's work and its recipe is how anybody knows what
 * went into it; removing that would orphan the only explanation. Same shape as
 * `deleteBudget` refusing a budget with spending against it.
 *
 * ⚠️ The count is done here with `sb` rather than by calling into
 * `cocozuri-batch.ts`, which imports `getRecipe` from this file — going the
 * other way would be a circular import.
 */
export async function deleteRecipe(id: number): Promise<{ ok: boolean; error?: string }> {
  const { count } = await sb.from("cz_batches").select("id", { count: "exact", head: true }).eq("recipe_id", id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${count} batch${count === 1 ? " has" : "es have"} been made to this recipe. Take it out of use instead — the batches are how anybody knows what went into that chocolate.`,
    };
  }
  const { error } = await sb.from("cz_recipes").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

async function writeLines(
  companyId: number, recipeId: number, lines: RecipeLineInput[],
): Promise<{ ok: boolean; error?: string }> {
  const clean = lines.filter((l) => l.itemId && Number(l.qty) > 0);
  if (clean.length === 0) return { ok: true };
  const { error } = await sb.from("cz_recipe_lines").insert(
    clean.map((l, i) => ({
      company_id: companyId,
      recipe_id: recipeId,
      line_no: i + 1,
      item_id: l.itemId,
      kind: l.kind ?? "ingredient",
      qty: Number(l.qty),
      uom: l.uom?.trim() || "PCS",
      notes: l.notes?.trim() || null,
    })),
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * The rules, checked against the real items.
 *
 * ⚠️ THE NAMES ARE LOOKED UP RATHER THAN TAKEN FROM THE FORM, so the message
 * says which material is listed twice instead of "a material is listed twice".
 * A refusal nobody can act on is barely better than no refusal.
 */
async function validate(input: RecipeInput): Promise<string | null> {
  if (!input.name?.trim()) return "A recipe needs a name.";
  if (!input.outputItemId) return "Say what it makes.";
  const { names } = await itemNames();
  const lines = (input.lines ?? [])
    .filter((l) => l.itemId)
    .map((l, i) => ({
      id: i, lineNo: i + 1, itemId: l.itemId,
      itemName: names.get(l.itemId) ?? `Item #${l.itemId}`,
      kind: l.kind ?? ("ingredient" as CzRecipeKind),
      qty: Number(l.qty), uom: l.uom ?? "PCS", notes: l.notes ?? null,
    }));
  const blockers = recipeBlockers({
    lines,
    yieldQty: input.yieldQty,
    expectedLossPercent: input.expectedLossPercent ?? 0,
    otherCost: input.otherCost ?? 0,
    otherCostNote: input.otherCostNote ?? null,
    outputItemId: input.outputItemId,
  });
  return blockers[0] ?? null;
}
