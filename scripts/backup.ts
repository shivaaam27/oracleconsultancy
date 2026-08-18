// Independent data backup — a belt-and-braces copy of every table you control.
//
// This does NOT replace Supabase's own automated backups (see BACKUP.md); it is
// a second, portable copy you own. It needs no extra software: it reuses the
// same database connection the app uses and writes one JSON file per table into
// a timestamped folder under ./backups.
//
//   npm run db:backup
//
// Each run creates ./backups/<UTC-timestamp>/ with:
//   - manifest.json   (table list, row counts, skipped columns, when it ran)
//   - <table>.json    (every row of that table)
//
// Restore with `npm run db:restore -- <folder>` (see scripts/restore.ts).

// WHY THIS SELECTS COLUMNS BY NAME AND NOT `select *` (fixed Aug 2026).
//
// `select *` KILLED THE BACKUP. The `embeddings` table is 22 MB across only 500
// rows, because `embedding` is a pgvector column — roughly 1,500 numbers per
// row. Asking for it renders every one of those as text and pushes the lot down
// a single pooled connection, which drops mid-transfer with
// `write CONNECTION_CLOSED`. `embeddings` sorts 38th of 98 alphabetically, so
// the run died there and THE 61 TABLES AFTER IT WERE NEVER WRITTEN — people,
// tasks, settings and notes among them. It read as slowness, so it went
// unnoticed. Do not go back to `select *`.
//
// Two kinds of column are skipped, worked out from the catalogue rather than
// named here, so a new table is handled without editing this file:
//
//   1. vector / tsvector  — search machinery, not data. Both are DERIVED and
//      rebuilt by /api/cron/reindex, so a copy has no value even when it fits.
//   2. GENERATED ALWAYS   — the database computes these itself and REJECTS an
//      insert that supplies one, so dumping them would break the restore.
//
// Everything else in those tables is still backed up, row for row.
//
// AND WHY IT RETRIES (Aug 2026). Skipping those columns was necessary but NOT
// sufficient. Measured from Dar es Salaam to Supabase in eu-west-1: pings all
// succeed (25/25, median 335ms) but sustained throughput is about
// **0.01 MB/s** - ten kilobytes a second. The link is reachable and slow, not
// broken, so a big read simply outlives the connection and dies with
// `write CONNECTION_CLOSED` - at a DIFFERENT table each run, which is what gave
// the false impression that one table was at fault.
//
// So each table is read on its own connection, retried up to three times, and
// anything sizeable is paged. A whole run still takes roughly fifteen minutes
// on this link; that is the network, not the script.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No database URL set (DIRECT_DATABASE_URL or DATABASE_URL).");
  process.exit(1);
}

/** A fresh connection. Cheap insurance: a dropped one never poisons the rest. */
function connect() {
  return postgres(url as string, { prepare: false, max: 1, connect_timeout: 30, idle_timeout: 0 });
}

const PAGE = 500;

/**
 * One table, read in pages, on its own connection, retried on failure.
 *
 * Paging is by OFFSET rather than by key because this must work for every table
 * including the join tables that have no single id column. Each page is ordered
 * the same way so the pages cannot overlap or leave a gap.
 */
async function readTable(table: string, cols: string[]): Promise<Record<string, unknown>[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const sql = connect();
    try {
      const out: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = await sql`
          select ${sql(cols)} from ${sql(table)}
          order by ${sql(cols[0])} nulls last
          limit ${PAGE} offset ${offset}
        `;
        out.push(...(page as unknown as Record<string, unknown>[]));
        if (page.length < PAGE) break;
      }
      await sql.end({ timeout: 5 }).catch(() => {});
      return out;
    } catch (err) {
      lastErr = err;
      await sql.end({ timeout: 5 }).catch(() => {});
      if (attempt < 3) console.log(`    retry ${attempt}/2 on ${table} (${(err as Error).message})`);
    }
  }
  throw lastErr;
}

async function main() {
  const sql = connect();

  // UTC timestamp, filesystem-safe: 2026-06-15T09-30-00Z
  const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "Z");
  const dir = join("backups", stamp);
  mkdirSync(dir, { recursive: true });

  try {
    // Every ordinary table in the public schema.
    const tables = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `;

    console.log(`Backing up ${tables.length} tables → ${dir}`);
    // Every column of every table, with the skip rule expressed in SQL where it
    // can be read. One query for the whole schema, not one per table.
    const cols = await sql<{ table_name: string; column_name: string; skip: boolean }[]>`
      select table_name, column_name,
             (udt_name in ('vector', 'tsvector') or is_generated = 'ALWAYS') as skip
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `;
    const keep = new Map<string, string[]>();
    const dropped = new Map<string, string[]>();
    for (const c of cols) {
      const into = c.skip ? dropped : keep;
      const list = into.get(c.table_name) ?? [];
      list.push(c.column_name);
      into.set(c.table_name, list);
    }

    // Catalogue read. Everything below uses its own short-lived connection, so
    // this one is closed rather than left open across a fifteen-minute run.
    await sql.end({ timeout: 5 }).catch(() => {});

    const manifest: { table: string; rows: number; skippedColumns?: string[] }[] = [];
    let total = 0;

    for (const { table_name } of tables) {
      const wanted = keep.get(table_name) ?? [];
      const omitted = dropped.get(table_name);
      if (!wanted.length) {
        console.log(`  - ${table_name} (no dumpable columns, skipped)`);
        continue;
      }
      const rows = await readTable(table_name, wanted);
      writeFileSync(join(dir, `${table_name}.json`), JSON.stringify(rows, null, 2), "utf8");
      manifest.push({ table: table_name, rows: rows.length, ...(omitted ? { skippedColumns: omitted } : {}) });
      total += rows.length;
      console.log(`  ✓ ${table_name} (${rows.length} rows)${omitted ? "  - skipped " + omitted.join(", ") : ""}`);
    }

    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify(
        { createdAt: new Date().toISOString(), tableCount: tables.length, totalRows: total, tables: manifest },
        null,
        2,
      ),
      "utf8",
    );

    console.log(`\nDone. ${tables.length} tables, ${total} rows saved to ${dir}`);
    const short = manifest.filter((m) => m.skippedColumns);
    if (short.length) {
      console.log(
        `Note: search/generated columns were skipped on ${short.length} table(s) - ` +
          `${short.map((m) => m.table).join(", ")}. They rebuild via /api/cron/reindex.`,
      );
    }
  } catch (err) {
    await sql.end({ timeout: 5 }).catch(() => {});
    throw err;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nBackup failed:", err?.message ?? err);
    process.exit(1);
  });
