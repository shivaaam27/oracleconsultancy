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
//   - manifest.json   (table list, row counts, when it ran)
//   - <table>.json    (every row of that table)
//
// Restore with `npm run db:restore -- <folder>` (see scripts/restore.ts).

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

async function main() {
  const sql = postgres(url as string, { prepare: false, max: 1, connect_timeout: 30 });

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
    const manifest: { table: string; rows: number }[] = [];
    let total = 0;

    for (const { table_name } of tables) {
      const rows = await sql`select * from ${sql(table_name)}`;
      writeFileSync(join(dir, `${table_name}.json`), JSON.stringify(rows, null, 2), "utf8");
      manifest.push({ table: table_name, rows: rows.length });
      total += rows.length;
      console.log(`  ✓ ${table_name} (${rows.length} rows)`);
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
    await sql.end({ timeout: 5 });
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
