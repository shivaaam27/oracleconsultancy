/**
 * `npx tsx scripts/backfill-cocozuri-stock-ledger.ts [--write]`
 *
 * Manufacturing Stage 1: turn every existing day-sheet row into stock-ledger
 * movements, so `cz_stock_moves` becomes the truth without anything being
 * dropped or retyped.
 *
 * ⚠️ IT CHECKS BEFORE IT CLAIMS. After writing, it re-reads every item's balance
 * BOTH ways — from the old day book and from the new ledger — and reports any
 * that disagree. A migration that says "done" without proving the two readings
 * match is how a stock system quietly starts lying.
 *
 * ⚠️ DRY RUN BY DEFAULT. Pass `--write` to actually write.
 *
 * ⚠️ SAFE TO RUN TWICE. It clears the `day_sheet` movements for each item/date
 * it is about to write, so a second run rewrites the same rows rather than
 * doubling them. It never touches a movement from any other document.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import postgres from "postgres";

const WRITE = process.argv.includes("--write");

type DayRow = { id: number; item_id: number; on_date: string; qty_in: string; qty_out: string; qty_third: string };

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const [co] = await sql<{ id: number; name: string }[]>`
    select id, name from companies where code_prefix = 'CC' limit 1`;
  if (!co) { console.error("Cocozuri (code_prefix CC) is not in the company list."); process.exit(1); }
  console.log(`${co.name} · ${WRITE ? "WRITING" : "DRY RUN — pass --write to apply"}\n`);

  const items = await sql<{ id: number; location_id: number; name: string }[]>`
    select id, location_id, name from cz_stock_items where company_id = ${co.id}`;
  const locOf = new Map(items.map((i) => [i.id, i.location_id]));

  const days = await sql<DayRow[]>`
    select id, item_id, on_date::text as on_date, qty_in, qty_out, qty_third
    from cz_stock_days where company_id = ${co.id} order by on_date, item_id`;
  console.log(`${days.length} day-sheet rows across ${items.length} items.`);

  // Build the movements. ⚠️ IN adds; OUT and the third column take away — the
  // workbook's own formula, and the one thing in those sheets never in doubt.
  const moves: { item: number; loc: number; date: string; qty: number; reason: string }[] = [];
  let orphaned = 0;
  for (const d of days) {
    const loc = locOf.get(d.item_id);
    if (loc == null) { orphaned++; continue; }
    const push = (qty: number, reason: string) => {
      if (qty !== 0) moves.push({ item: d.item_id, loc, date: d.on_date, qty, reason });
    };
    push(Number(d.qty_in), "day_in");
    push(-Number(d.qty_out), "day_out");
    push(-Number(d.qty_third), "day_third");
  }
  console.log(`→ ${moves.length} movements${orphaned ? ` · ⚠️ ${orphaned} rows skipped: item has no location` : ""}`);

  if (!WRITE) {
    const byReason = moves.reduce<Record<string, number>>((m, x) => ({ ...m, [x.reason]: (m[x.reason] ?? 0) + 1 }), {});
    console.log("   by reason:", JSON.stringify(byReason));
    console.log("\nNothing written. Re-run with --write.");
    await sql.end();
    return;
  }

  // ⚠️ Clear only the DAY-SHEET movements. A movement from a purchase, a batch
  // or a transfer is a document that has been acted on and is never erased.
  const cleared = await sql`
    delete from cz_stock_moves
    where company_id = ${co.id} and voucher_type = 'day_sheet' returning id`;
  console.log(`cleared ${cleared.length} existing day-sheet movements`);

  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < moves.length; i += CHUNK) {
    const slice = moves.slice(i, i + CHUNK);
    await sql`
      insert into cz_stock_moves ${sql(
        slice.map((m) => ({
          company_id: co.id, item_id: m.item, location_id: m.loc,
          on_date: m.date, qty: m.qty, reason: m.reason,
          voucher_type: "day_sheet", created_by: "backfill:stage1",
        })),
      )}`;
    written += slice.length;
    process.stdout.write(`\r  written ${written}/${moves.length}`);
  }
  console.log(`\n${written} movements written.\n`);

  /* ---------------------------------------------------------------- *
   * ⚠️ THE PROOF. Both readings, item by item, and any disagreement named.
   * ---------------------------------------------------------------- */
  console.log("Checking the ledger against the day book…");
  const check = await sql<{ item_id: number; name: string; day_total: string; ledger_total: string }[]>`
    with day as (
      select item_id, sum(qty_in - qty_out - qty_third) as total
      from cz_stock_days where company_id = ${co.id} group by item_id
    ), led as (
      select item_id, sum(qty) as total
      from cz_stock_moves where company_id = ${co.id} and voucher_type = 'day_sheet' group by item_id
    )
    select i.id as item_id, i.name,
           coalesce(day.total, 0)::text as day_total,
           coalesce(led.total, 0)::text as ledger_total
    from cz_stock_items i
    left join day on day.item_id = i.id
    left join led on led.item_id = i.id
    where i.company_id = ${co.id}`;

  const off = check.filter((r) => Number(r.day_total) !== Number(r.ledger_total));
  if (off.length === 0) {
    console.log(`✅ All ${check.length} items agree — the ledger reproduces the day book exactly.`);
  } else {
    console.log(`❌ ${off.length} items DISAGREE:`);
    for (const r of off.slice(0, 20)) {
      console.log(`   ${r.name}: day book ${r.day_total}, ledger ${r.ledger_total}`);
    }
  }
  await sql.end();
  if (off.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
