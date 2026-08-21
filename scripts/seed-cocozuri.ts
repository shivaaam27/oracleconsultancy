/**
 * `npx tsx scripts/seed-cocozuri.ts <extract.json>`
 *
 * Loads CocoZuri's catalogue, customers and prices out of the 18 spreadsheets
 * and into `cz_products` / `cz_customers` / `cz_branches` / `cz_prices`.
 *
 * ⚠️ NOTHING IS INVENTED. Every row here came out of a workbook. Where a name in
 * one workbook does not match the same customer in another — and there are eight
 * such cases — the mapping is written out BELOW, by hand, with the two spellings
 * visible. Anything that cannot be mapped is REPORTED AND SKIPPED, never guessed
 * at, because a price attached to the wrong customer is worse than no price.
 *
 * ⚠️ SAFE TO RUN TWICE. Products and customers are matched by name and skipped if
 * already there; prices are only added when that product/customer pair has none.
 * It never updates and never deletes, so it cannot undo anything typed by hand
 * after the first run.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import { readFileSync } from "node:fs";
import postgres from "postgres";

/**
 * The price list's column headings, as typed, against the customer names in the
 * invoice master.
 *
 * ⚠️ THE LEFT-HAND SIDE IS COPIED EXACTLY, spaces and all — "VILLAGE SUPERMA
 * RKET" really is how that column is headed, and "SHREEJI"/"SHRIJEE" are the
 * same trader spelled two ways in two files. Normalising this in code would be
 * guesswork; writing it down is a decision somebody can check.
 */
const CUSTOMER_ALIASES: Record<string, string> = {
  "AIRPORT": "LAGARDERE TRAVEL",
  "SHOPPER S SUPER MARKET": "SHOPPERS SUPERMARKET LTD",
  "SHREEJI SUPER MARKET": "SHRIJEE TRADERS",
  "VILLAGE SUPERMA RKET": "VILLAGE SUPERMARKET",
  "ASHNA' S": "ASHNA'S SUPERMARKET",
  "PICK & PAY SUPERMARKET": "PIK & PAY SUPERMARKET",
  "GADGET SHOP LTD": "GADGET SHOP LIMITED",
  "SIYAAN": "SIYAAN GROCERY",
  "A TO Z": "A TO Z SUPERMARKET",
  "XING YAO CENTURY": "XING YAO CENTURY COMPANY LTD",
  "GARDEN MARKET LTD": "GARDEN MARKET LTD",
  "SD SUPERMARKET": "SD SUPERMARKET",
  "SIMBA SUPERMARKET": "SIMBA SUPERMARKET",
  // "ALEX" has a column on the price list and no invoice anywhere. Left out on
  // purpose — see the skipped report at the end of a run.
};

/** What the price list calls them, kept so the columns still make sense. */
const SHORT_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(CUSTOMER_ALIASES).map(([short, full]) => [full, short]),
);

type Seed = {
  products: { name: string; category: string | null; uom: string; where: string; brand?: string | null; packSize?: number | null; packUnit?: string | null }[];
  customers: { name: string; branches: string[]; invoiceSeries: string | null; vatRate: number | null }[];
  prices: { product: string; customer: string | null; price: number }[];
};

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

/**
 * The same name with a trailing pack size taken off.
 *
 * ⚠️ A STATED RULE, NOT A FUZZY MATCH. The price list writes the pack into the
 * item — "50% DARK CHOCOLATE (100 GM)" — while the stock sheets keep it in its
 * own column and call the item "50% DARK CHOCOLATE". Those are the same bar. So
 * a name is matched exactly first, and only then with a trailing parenthesised
 * pack removed. Nothing else is trimmed, and anything still unmatched is
 * reported rather than attached to the nearest-looking product.
 */
const withoutPack = (s: string) => norm(s).replace(/\s*\([^)]*\)\s*$/, "").trim();

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Give me the extract: npx tsx scripts/seed-cocozuri.ts <extract.json>");
    process.exit(1);
  }
  const seed = JSON.parse(readFileSync(path, "utf8")) as Seed;
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  // Cocozuri is Furaha Innovation Ltd, prefix CC. Looked up, never hard-coded.
  const [company] = await sql`
    select id, name from companies
    where code_prefix = 'CC' or name ilike '%Cocozuri%' or name ilike '%Furaha%' limit 1`;
  if (!company) {
    console.error("Cocozuri (code_prefix CC) is not in the companies table. Nothing done.");
    await sql.end();
    process.exit(1);
  }
  console.log(`Company: ${company.name} (id ${company.id})\n`);

  const skipped: string[] = [];

  /* ---------------------------- customers ---------------------------- */
  const custId = new Map<string, number>();
  let newCustomers = 0;
  for (const c of seed.customers) {
    const [existing] = await sql`
      select id from cz_customers where company_id = ${company.id} and name = ${c.name} limit 1`;
    let id = existing?.id as number | undefined;
    if (!id) {
      const [row] = await sql`
        insert into cz_customers (company_id, name, short_name, invoice_series, vat_rate, created_by)
        values (${company.id}, ${c.name}, ${SHORT_NAMES[c.name] ?? null},
                ${c.invoiceSeries}, ${c.vatRate}, 'seed:workbooks')
        returning id`;
      id = row.id as number;
      newCustomers++;
    }
    custId.set(norm(c.name), id!);
    for (const b of c.branches) {
      await sql`
        insert into cz_branches (customer_id, name) values (${id!}, ${b})
        on conflict do nothing`;
    }
  }
  console.log(`Customers: ${newCustomers} added, ${seed.customers.length - newCustomers} already there.`);

  /* ---------------------------- products ---------------------------- */
  const prodId = new Map<string, number>();
  let newProducts = 0;
  for (const p of seed.products) {
    const [existing] = await sql`
      select id from cz_products where company_id = ${company.id} and name = ${p.name} limit 1`;
    let id = existing?.id as number | undefined;
    if (!id) {
      const [row] = await sql`
        insert into cz_products (company_id, name, category, brand, uom, pack_size, pack_unit, notes, created_by)
        values (${company.id}, ${p.name}, ${p.category}, ${p.brand ?? null}, ${p.uom || "PCS"},
                ${p.packSize ?? null}, ${p.packUnit ?? null},
                ${`From the ${p.where} sheet`}, 'seed:workbooks')
        returning id`;
      id = row.id as number;
      newProducts++;
    }
    prodId.set(norm(p.name), id!);
  }
  console.log(`Products:  ${newProducts} added, ${seed.products.length - newProducts} already there.`);

  /* ----------------------------- prices ----------------------------- */
  let newPrices = 0;
  // Built once: the same products keyed by their name minus a trailing pack.
  // Only names that are UNAMBIGUOUS without it — if two products collapse to the
  // same stem, neither is matched that way, because a coin toss is not a match.
  const stemCount = new Map<string, number>();
  for (const key of prodId.keys()) stemCount.set(withoutPack(key), (stemCount.get(withoutPack(key)) ?? 0) + 1);
  const byStem = new Map<string, number>();
  for (const [key, id] of prodId) {
    const stem = withoutPack(key);
    if (stemCount.get(stem) === 1) byStem.set(stem, id);
  }

  for (const pr of seed.prices) {
    const pid = prodId.get(norm(pr.product)) ?? byStem.get(withoutPack(pr.product));
    if (!pid) { skipped.push(`price for unknown product "${pr.product}"`); continue; }

    let cid: number | null = null;
    if (pr.customer) {
      const mapped = CUSTOMER_ALIASES[norm(pr.customer)] ?? pr.customer;
      cid = custId.get(norm(mapped)) ?? null;
      if (cid == null) { skipped.push(`price for unmapped customer "${pr.customer}"`); continue; }
    }

    // Only if that product/customer pair has no price at all — so a price typed
    // by hand after the first run is never overwritten by a second.
    const [has] = cid == null
      ? await sql`select 1 from cz_prices where product_id = ${pid} and customer_id is null limit 1`
      : await sql`select 1 from cz_prices where product_id = ${pid} and customer_id = ${cid} limit 1`;
    if (has) continue;

    await sql`
      insert into cz_prices (product_id, customer_id, price, currency, effective_from, note, created_by)
      values (${pid}, ${cid}, ${pr.price}, 'TZS', now(), 'From the February 2026 price list', 'seed:workbooks')`;
    newPrices++;
  }
  console.log(`Prices:    ${newPrices} added.`);

  if (skipped.length) {
    console.log(`\n⚠️  SKIPPED ${skipped.length} — nothing was guessed at:`);
    const counted = new Map<string, number>();
    for (const s of skipped) counted.set(s, (counted.get(s) ?? 0) + 1);
    for (const [s, n] of [...counted.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${n}× ${s}`);
    }
  }

  await sql.end();
}

main();
