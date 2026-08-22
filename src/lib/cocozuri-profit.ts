import { sb } from "@/db/supabase";
import { cocozuriCompany, listInvoices, listPrices } from "@/lib/cocozuri";
import { vatOf, type CzInvoice, type CzPrice } from "@/lib/cocozuri-shared";
import { listItems, listMoves } from "@/lib/cocozuri-stock";
import { todayInDar, type CzStockItem, type CzStockMove } from "@/lib/cocozuri-stock-shared";
import { itemCostFromMoves } from "@/lib/cocozuri-recipe-shared";
import { listBatches } from "@/lib/cocozuri-batch";
import { batchCheck, batchPlan } from "@/lib/cocozuri-batch-shared";
import { listRecipes } from "@/lib/cocozuri-recipe";
import { costRecipe } from "@/lib/cocozuri-recipe-shared";
import {
  batchCosting, batchMargin, costDistribution, costOfSales, periodBounds, profitRows, stocktakeValue,
  YIELD_BENCHMARK,
  type CzBatchCosting, type CzBatchMargin, type CzCostOfSales, type CzCostShare,
  type CzProfitRow, type ProfitInvoice,
} from "@/lib/cocozuri-profit-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 7 — costing and profitability. SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ IT WRITES NOTHING. Stage 7 has no table and no migration — every figure is
 * derived from the stock ledger and the invoices on read. The one thing that
 * does reach a database is the cost-of-sales posting, and that lives in
 * `cocozuri-ledger.ts` behind `postVoucher()` like everything else.
 *
 * ⚠️ THE COST OF A THING IS TAKEN **AS AT A DATE**. `itemCostFromMoves` averages
 * whatever list of movements it is given, so valuing August's sales means giving
 * it the movements up to the end of August — otherwise a bag of almonds bought
 * in October would quietly change what August cost.
 *
 * Read `memory/cocozuri_manufacturing_plan.md` §4 Stage 7 first.
 * ------------------------------------------------------------------ */

const num = (v: unknown) => (v == null ? 0 : Number(v));

/** Everything the reports need, read once. ⚠️ ONE PASS OVER THE LEDGER — a page
 *  showing every batch, every customer and a month would otherwise ask for the
 *  movements a hundred times. */
async function context() {
  const [items, moves, invoices, batches, recipes, prices] = await Promise.all([
    listItems(),
    listMoves(),
    listInvoices(),
    listBatches(),
    listRecipes(),
    listPrices(),
  ]);
  const { data: products } = await sb.from("cz_products").select("id,name");
  const productName = new Map((products ?? []).map((p) => [p.id as number, p.name as string]));
  return {
    items,
    itemById: new Map(items.map((i) => [i.id, i])),
    nameOf: (i: CzStockItem) => (i.productId != null ? productName.get(i.productId) : null) ?? i.name,
    moves,
    invoices,
    batches,
    recipes,
    prices,
    productName,
  };
}

type Ctx = Awaited<ReturnType<typeof context>>;

/** What one unit of a stock item cost, as at a date. */
function costerAt(moves: CzStockMove[], asOf?: string) {
  const upTo = asOf ? moves.filter((m) => m.onDate <= asOf) : moves;
  const cache = new Map<number, number | null>();
  return (itemId: number): number | null => {
    if (!cache.has(itemId)) cache.set(itemId, itemCostFromMoves(itemId, upTo).unitCost);
    return cache.get(itemId) ?? null;
  };
}

/**
 * What one unit of a PRODUCT cost — which is not the same question.
 *
 * ⚠️ A PRODUCT IS SOLD; A STOCK ITEM IS COUNTED, and one product can be a row on
 * two shelves (the shop's AMBER RABDI and the kitchen's). So the product's cost
 * is the weighted average across every item linked to it — matched by
 * `product_id`, never by name, which is fault #4.
 */
function productCoster(ctx: Ctx, asOf?: string) {
  const byItem = costerAt(ctx.moves, asOf);
  const itemsOfProduct = new Map<number, CzStockItem[]>();
  for (const i of ctx.items) {
    if (i.productId == null) continue;
    const bucket = itemsOfProduct.get(i.productId);
    if (bucket) bucket.push(i);
    else itemsOfProduct.set(i.productId, [i]);
  }
  const cache = new Map<number, number | null>();
  return (productId: number): number | null => {
    if (cache.has(productId)) return cache.get(productId) ?? null;
    const costs = (itemsOfProduct.get(productId) ?? []).map((i) => byItem(i.id)).filter((c): c is number => c != null);
    // ⚠️ Said as nothing, never as zero. A chocolate nobody has bought or made
    // at a known cost has no cost, and averaging a missing one in as free is how
    // a margin comes out looking wonderful.
    const value = costs.length === 0 ? null : Math.round((costs.reduce((t, c) => t + c, 0) / costs.length) * 10000) / 10000;
    cache.set(productId, value);
    return value;
  };
}

/**
 * What a product sells for, NET of VAT.
 *
 * ⚠️ NET, and this matters more than it looks. Costs are ex-VAT; a CocoZuri
 * invoice is VAT-INCLUSIVE by default. Comparing the two straight would inflate
 * every margin by the tax rate — money that was never the company's.
 *
 * ⚠️ AND IT PREFERS WHAT WAS ACTUALLY CHARGED over the price list. A list price
 * nobody pays is not what a bar is worth.
 */
function netPriceOf(ctx: Ctx) {
  const charged = new Map<number, { gross: number; qty: number; vatRate: number; inclusive: boolean }>();
  for (const inv of ctx.invoices) {
    if (inv.status !== "issued" || inv.docType !== "invoice") continue;
    for (const l of inv.lines) {
      if (l.productId == null || num(l.qty) <= 0) continue;
      const cur = charged.get(l.productId) ?? { gross: 0, qty: 0, vatRate: inv.vatRate, inclusive: inv.taxInclusive };
      cur.gross += num(l.qty) * num(l.unitPrice);
      cur.qty += num(l.qty);
      charged.set(l.productId, cur);
    }
  }
  const listByProduct = new Map<number, CzPrice>();
  for (const p of ctx.prices) {
    // The standard list price only — a customer's own price is not what the
    // product is worth in general.
    if (p.customerId != null) continue;
    const held = listByProduct.get(p.productId);
    if (!held || p.effectiveFrom > held.effectiveFrom) listByProduct.set(p.productId, p);
  }
  return (productId: number, vatRate: number): { net: number | null; source: "invoiced" | "list" | null } => {
    const c = charged.get(productId);
    if (c && c.qty > 0) {
      const unit = c.gross / c.qty;
      return { net: c.inclusive ? round4(unit - vatOf(unit, c.vatRate)) : round4(unit), source: "invoiced" };
    }
    const l = listByProduct.get(productId);
    if (l) {
      // ⚠️ A list price is quoted the way an invoice is — VAT included.
      return { net: round4(num(l.price) - vatOf(num(l.price), vatRate)), source: "list" };
    }
    return { net: null, source: null };
  };
}

/* ------------------------------------------------------------------ *
 * Per batch — the one the owner circled
 * ------------------------------------------------------------------ */

export type CzBatchProfit = {
  batchId: number;
  batchNo: string;
  itemName: string | null;
  madeOn: string | null;
  status: string;
  costing: CzBatchCosting;
  margin: CzBatchMargin;
  priceSource: "invoiced" | "list" | null;
  /** actual ÷ what the recipe expected before its loss. */
  yieldPercent: number | null;
  belowBenchmark: boolean;
  /** ⚠️ What the batch's cost is MADE OF — note #43. */
  distribution: CzCostShare[];
};

/**
 * What every closed batch cost, and what its bars are worth.
 *
 * ⚠️ WORTH, NOT EARNINGS. An invoice line names a product, not a batch, so what
 * THIS batch earned is not knowable — only what it cost and what its units sell
 * for. Tracing a sale to a batch is Stage 9. The screen says so.
 */
export async function batchProfits(): Promise<CzBatchProfit[]> {
  const ctx = await context();
  const vatRate = ctx.invoices[0]?.vatRate ?? 0;
  const price = netPriceOf(ctx);
  const recipeById = new Map(ctx.recipes.map((r) => [r.id, r]));

  return ctx.batches
    .filter((b) => b.status === "closed")
    .map((b) => {
      const cost = costerAt(ctx.moves, b.madeOn ?? undefined);
      const consumed = ctx.moves
        .filter((m) => m.batchId === b.id && m.reason === "consume" && m.qty < 0)
        .map((m) => {
          const item = ctx.itemById.get(m.itemId);
          return {
            itemId: m.itemId,
            itemName: item ? ctx.nameOf(item) : `Item #${m.itemId}`,
            qty: Math.abs(m.qty),
            // ⚠️ The movement's OWN cost wins where it has one — that is what
            // this batch actually paid. The average is the fallback.
            unitCost: m.unitCost ?? cost(m.itemId),
          };
        });

      const recipe = b.recipeId == null ? null : recipeById.get(b.recipeId) ?? null;
      // ⚠️ Gas and labour are not stock movements, so they can only come from
      // the recipe — scaled by how many times it was run.
      const otherCost = recipe ? num(recipe.otherCost) * (num(b.recipeMultiple) || 1) : 0;
      const costing = batchCosting(consumed, b.producedQty, otherCost);

      const item = b.itemId == null ? null : ctx.itemById.get(b.itemId) ?? null;
      const productId = item?.productId ?? null;
      const p = productId == null ? { net: null, source: null as null } : price(productId, vatRate);

      /* ⚠️ THE YIELD IS NOT RECOMPUTED HERE. Stage 4's `batchCheck` already
         defines it (actual ÷ the recipe's raw yield, scaled by the multiple) and
         the batch page shows that figure. A second definition on this page would
         eventually disagree with it, and two screens quoting different yields
         for the same batch is worse than neither. */
      const plan = recipe ? batchPlan(recipe, b.recipeMultiple) : null;
      const check = batchCheck(b, plan, []);
      const yieldPercent = check.yieldPercent;

      const costed = recipe ? costRecipe(recipe, (id) => cost(id)) : null;

      return {
        batchId: b.id,
        batchNo: b.batchNo,
        itemName: b.itemName,
        madeOn: b.madeOn,
        status: b.status,
        costing,
        margin: batchMargin(costing.unitCost, p.net, costing.complete),
        priceSource: p.source,
        yieldPercent,
        belowBenchmark: check.belowBenchmark,
        /* ⚠️ The distribution comes from the RECIPE, not the batch: it answers
           "what is a bar made of", which is a property of the design, while the
           batch answers "what did this run cost". Said on the screen. */
        distribution: costed
          ? costDistribution({
              rawMaterial: costed.rawMaterial,
              packaging: costed.packaging,
              finishing: costed.finishing,
              otherCost: costed.otherCost,
            })
          : [],
      };
    })
    .sort((a, b) => (b.madeOn ?? "").localeCompare(a.madeOn ?? ""));
}

/* ------------------------------------------------------------------ *
 * Per customer and per month
 * ------------------------------------------------------------------ */

function toProfitInvoice(inv: CzInvoice): ProfitInvoice {
  return {
    id: inv.id,
    number: inv.number,
    docType: inv.docType,
    status: inv.status,
    issueDate: inv.issueDate,
    customerId: inv.customerId,
    customerName: inv.customerName,
    vatRate: inv.vatRate,
    taxInclusive: inv.taxInclusive,
    lines: inv.lines.map((l) => ({
      productId: l.productId,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
    })),
  };
}

export async function profitBy(groupBy: "customer" | "month"): Promise<CzProfitRow[]> {
  const ctx = await context();
  const cost = productCoster(ctx);
  return profitRows(ctx.invoices.map(toProfitInvoice), cost, groupBy);
}

/* ------------------------------------------------------------------ *
 * Cost of sales for a month
 * ------------------------------------------------------------------ */

export async function costOfSalesFor(year: number, month: number): Promise<CzCostOfSales> {
  const ctx = await context();
  const { from, to } = periodBounds(year, month);
  // ⚠️ Valued at what things cost AS AT THE END OF THAT MONTH, not today.
  const cost = costerAt(ctx.moves, to);
  return costOfSales(
    ctx.moves,
    (id) => { const i = ctx.itemById.get(id); return i ? ctx.nameOf(i) : `Item #${id}`; },
    cost,
    from,
    to,
  );
}

/**
 * What a month's stock-takes were worth — Stage 8's other half.
 *
 * ⚠️ Valued at what things cost AS AT THE END OF THAT MONTH, exactly as the cost
 * of sales is. A bag bought in October must not change what September's count
 * was worth.
 */
export async function stocktakeValueFor(year: number, month: number): Promise<CzCostOfSales> {
  const ctx = await context();
  const { from, to } = periodBounds(year, month);
  const cost = costerAt(ctx.moves, to);
  return stocktakeValue(
    ctx.moves,
    (id) => { const i = ctx.itemById.get(id); return i ? ctx.nameOf(i) : `Item #${id}`; },
    cost, from, to,
  );
}

/** The months there is anything to report on, newest first. */
export async function profitMonths(): Promise<string[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  const [{ data: moveRows }, { data: invRows }] = await Promise.all([
    sb.from("cz_stock_moves").select("on_date").eq("company_id", company.id),
    sb.from("cz_invoices").select("issue_date").eq("company_id", company.id).eq("status", "issued"),
  ]);
  const months = new Set<string>();
  for (const r of moveRows ?? []) months.add(String(r.on_date).slice(0, 7));
  for (const r of invRows ?? []) months.add(String(r.issue_date).slice(0, 7));
  // ⚠️ This month always, even when nothing has happened in it — a report that
  // hides the month you are in looks broken rather than empty.
  months.add(todayInDar().slice(0, 7));
  return [...months].sort().reverse();
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
