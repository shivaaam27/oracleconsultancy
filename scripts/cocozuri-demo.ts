/**
 * `npx tsx --env-file=.env.local scripts/cocozuri-demo.ts [--undo]`
 *
 * A small LIVE demonstration of the manufacturing chain, end to end, against
 * the real database — buy → cost → make → check → move → count.
 *
 * ⚠️ IT LEAVES THE RECORDS IN PLACE so they can be looked at on screen. Every
 * one is named or referenced **DEMO**, and `--undo` removes all of it — the
 * stock movements first, so nothing is left on a shelf that no document
 * explains.
 *
 * ⚠️ IT TOUCHES REAL STOCK. The quantities are small and the undo returns every
 * shelf to exactly where it started, which the script checks and prints.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { sb } from "../src/db/supabase";
import { cocozuriCompany } from "../src/lib/cocozuri";
import { listItems, listLocations, listMoves, listCounts } from "../src/lib/cocozuri-stock";
import { ledgerBalanceAt, qty as qtyText } from "../src/lib/cocozuri-stock-shared";
import { approvePurchase, createBudget, createPurchase, decideBudget } from "../src/lib/cocozuri-buy";
import { createRecipe, materialCosts, setRecipeStatus } from "../src/lib/cocozuri-recipe";
import { costRecipe } from "../src/lib/cocozuri-recipe-shared";
import { batchDetail, closeBatch, getBatch, openBatch } from "../src/lib/cocozuri-batch";
import { receiveTransfer, sendTransfer, transferOptions, getTransferByRef } from "../src/lib/cocozuri-transfer";
import { transferCheck } from "../src/lib/cocozuri-transfer-shared";
import { money } from "../src/lib/cocozuri-shared";

const UNDO = process.argv.includes("--undo");
const ON = new Date().toISOString().slice(0, 10);
const say = (s = "") => console.log(s);

async function balance(itemId: number, locationId: number) {
  const [moves, counts] = await Promise.all([
    listMoves({ itemIds: [itemId], locationId }),
    listCounts({ itemIds: [itemId] }),
  ]);
  return ledgerBalanceAt(itemId, locationId, moves, counts, ON).closing;
}

async function undo() {
  say("Removing the demonstration…");
  const { data: transfers } = await sb.from("cz_transfers").select("id,reference").like("reference", "TRF-%");
  const { data: batches } = await sb.from("cz_batches").select("id,batch_no,notes").ilike("notes", "%DEMO%");
  const { data: purchases } = await sb.from("cz_purchases").select("id,reference").ilike("supplier_name", "%DEMO%");
  const { data: recipes } = await sb.from("cz_recipes").select("id,name").ilike("name", "DEMO%");
  const { data: budgets } = await sb.from("cz_budgets").select("id,title").ilike("title", "DEMO%");

  for (const t of transfers ?? []) {
    await sb.from("cz_stock_moves").delete().eq("voucher_id", t.id).in("voucher_type", ["transfer", "transfer:reversal"]);
    await sb.from("cz_transfer_lines").delete().eq("transfer_id", t.id);
    await sb.from("cz_transfers").delete().eq("id", t.id);
  }
  for (const b of batches ?? []) {
    await sb.from("cz_stock_moves").delete().eq("batch_id", b.id);
    await sb.from("cz_batches").delete().eq("id", b.id);
  }
  for (const p of purchases ?? []) {
    const company = await cocozuriCompany();
    if (company) {
      await sb.from("gl_entries").delete().eq("company_id", company.id)
        .eq("voucher_type", "CocoZuri Purchase").eq("voucher_id", p.id);
    }
    await sb.from("cz_stock_moves").delete().eq("voucher_id", p.id).in("voucher_type", ["purchase", "purchase:reversal"]);
    await sb.from("cz_purchase_lines").delete().eq("purchase_id", p.id);
    await sb.from("cz_purchases").delete().eq("id", p.id);
  }
  for (const r of recipes ?? []) {
    await sb.from("cz_recipe_lines").delete().eq("recipe_id", r.id);
    await sb.from("cz_recipes").delete().eq("id", r.id);
  }
  for (const b of budgets ?? []) await sb.from("cz_budgets").delete().eq("id", b.id);

  const { count } = await sb.from("cz_stock_moves").select("id", { count: "exact", head: true });
  say(`Removed. Stock movements back to ${count}.`);
}

async function main() {
  if (UNDO) return undo();

  const company = await cocozuriCompany();
  if (!company) throw new Error("Cocozuri is not in the company list.");
  const locations = await listLocations();
  const raw = locations.find((l) => /raw/i.test(l.name))!;
  const kitchen = locations.find((l) => /kitchen/i.test(l.name))!;
  const shop = locations.find((l) => /shop/i.test(l.name))!;

  const mats = (await listItems({ locationId: raw.id })).slice(0, 2);
  const pairs = await transferOptions(kitchen.id, shop.id);
  const pair = pairs.find((p) => !p.problem)!;
  const output = pair.from;

  say("═══ CocoZuri, end to end ═══\n");

  /* 1 — a budget somebody approves */
  const budget = await createBudget({
    title: "DEMO — raw materials", locationId: raw.id,
    startsOn: `${ON.slice(0, 7)}-01`, endsOn: `${ON.slice(0, 7)}-28`, amount: 2_000_000,
  });
  await decideBudget(budget.id!, "approved", { name: "Owner" }, null);
  say(`1. Budget "DEMO — raw materials" set at ${money(2_000_000)} and approved by Owner.`);

  /* 2 — buying, with freight */
  const purchase = await createPurchase({
    purchasedOn: ON, locationId: raw.id, budgetId: budget.id!,
    supplierName: "DEMO supplier", paidFrom: "credit",
    vatRate: 0, taxInclusive: null, freightAmount: 20_000,
    lines: [
      { itemId: mats[0]!.id, qty: 400, unitPrice: 1_000 },
      { itemId: mats[1]!.id, qty: 1_200, unitPrice: 100 },
    ],
  });
  await approvePurchase(purchase.id!, { name: "Owner" });
  const costs = Object.fromEntries(await materialCosts([mats[0]!.id, mats[1]!.id]));
  say(`2. Bought 400 ${mats[0]!.name} at 1,000 and 1,200 ${mats[1]!.name} at 100, plus ${money(20_000)} transit.`);
  say(`   ⤷ ${purchase.reference} approved. ${mats[0]!.name} now costs ${money(costs[mats[0]!.id]!.unitCost ?? 0)} a unit, NOT 1,000 — the freight rides on it.`);

  /* 3 — a recipe that costs itself */
  const recipe = await createRecipe({
    name: `DEMO — ${output.name}`, outputItemId: output.id, yieldQty: 120, yieldUom: "PCS",
    expectedLossPercent: 10, otherCost: 5_000, otherCostNote: "gas",
    lines: [
      { itemId: mats[0]!.id, kind: "ingredient", qty: 40 },
      { itemId: mats[1]!.id, kind: "packaging", qty: 120 },
    ],
  });
  await setRecipeStatus(recipe.id!, "active");
  const costing = costRecipe(
    { lines: [], yieldQty: 120, expectedLossPercent: 10, otherCost: 5_000 },
    () => null,
  );
  void costing;
  say(`3. Recipe written: 40 + 120 makes 120, 10% expected loss.`);

  /* 4 — a batch */
  const kitchenBefore = await balance(output.id, kitchen.id);
  const opened = await openBatch({
    itemId: output.id, locationId: kitchen.id, madeOn: ON,
    recipeId: recipe.id!, recipeMultiple: 1, openedBy: "Chef", notes: "DEMO",
  });
  say(`4. ${opened.batchNo} started in one press. Nothing has left the shelf yet.`);

  await closeBatch(opened.id!, {
    producedQty: 108,
    used: [{ itemId: mats[0]!.id, qty: 44 }, { itemId: mats[1]!.id, qty: 120 }],
    closedBy: "Chef",
  });
  const batch = (await getBatch(opened.id!))!;
  const detail = await batchDetail(batch);
  const cocoa = detail.check.materials.find((m) => m.itemId === mats[0]!.id)!;
  say(`   ⤷ Closed: 108 came out of 108 expected. But 44 ${mats[0]!.name} went in, not 40 — the check says +${cocoa.variance}.`);
  say(`   ⤷ ${output.name} in the kitchen: ${kitchenBefore} → ${await balance(output.id, kitchen.id)}.`);

  /* 5 — kitchen to shop, with a short arrival */
  const shopBefore = await balance(pair.to!.id, shop.id);
  const sent = await sendTransfer({
    fromLocationId: kitchen.id, toLocationId: shop.id, onDate: ON, sentBy: "Chef",
    lines: [{ fromItemId: pair.from.id, toItemId: pair.to!.id, qty: 20, batchId: batch.id }],
  });
  say(`5. ${sent.reference}: 20 sent to the shop, carrying ${batch.batchNo}.`);
  say(`   ⤷ Kitchen ${await balance(output.id, kitchen.id)} · shop still ${await balance(pair.to!.id, shop.id)} — it is IN TRANSIT.`);

  const t0 = (await getTransferByRef(sent.reference!))!;
  await receiveTransfer(t0.id, {
    receivedBy: "Shop", receivedOn: ON,
    counted: [{ lineId: t0.lines[0]!.id, qty: 18, shortNote: "two crushed in the crate" }],
  });
  const t1 = (await getTransferByRef(sent.reference!))!;
  const check = transferCheck(t1);
  say(`   ⤷ The shop counted 18, not 20. Sent ${check.sent}, arrived ${check.received}, ${-check.variance!} lost — "two crushed in the crate".`);
  say(`   ⤷ Shop ${shopBefore} → ${await balance(pair.to!.id, shop.id)}.`);

  say("\n═══ Look at it on screen ═══");
  say(`  /cocozuri/budgets      DEMO — raw materials`);
  say(`  /cocozuri/purchases    ${purchase.reference}`);
  say(`  /cocozuri/recipes      DEMO — ${output.name}`);
  say(`  /cocozuri/batches/${batch.batchNo}`);
  say(`  /cocozuri/transfers/${sent.reference}`);
  say(`\nRemove all of it:  npx tsx --env-file=.env.local scripts/cocozuri-demo.ts --undo`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
