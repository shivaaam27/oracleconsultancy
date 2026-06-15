// Restore data from a backup folder created by scripts/backup.ts.
//
//   npm run db:restore -- backups/2026-06-15T09-30-00Z
//
// SAFETY: this OVERWRITES the current contents of each table it restores. It is
// a recovery tool, not an everyday command. For normal "go back in time" needs,
// prefer Supabase's Point-in-Time Recovery in the dashboard (see BACKUP.md) —
// it restores the full database including schema and relationships cleanly.
//
// This script is "best effort": it disables foreign-key checks for the session
// (works with a direct/service connection), truncates each table, and re-inserts
// the saved rows. It reports per-table success so a single failure never hides
// the rest. If a table fails, the others still restore.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: npm run db:restore -- <backup-folder>");
  console.error("Example: npm run db:restore -- backups/2026-06-15T09-30-00Z");
  process.exit(1);
}

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No database URL set (DIRECT_DATABASE_URL or DATABASE_URL).");
  process.exit(1);
}

async function main() {
  const sql = postgres(url as string, { prepare: false, max: 1, connect_timeout: 30 });

  const files = readdirSync(folder).filter((f) => f.endsWith(".json") && f !== "manifest.json");
  if (files.length === 0) {
    console.error(`No table files found in ${folder}`);
    process.exit(1);
  }

  console.log(`Restoring ${files.length} tables from ${folder}`);
  console.log("This OVERWRITES current table contents. Ctrl+C now to abort.\n");

  // Give a short grace period to abort.
  await new Promise((r) => setTimeout(r, 4000));

  let ok = 0;
  let failed = 0;

  try {
    // Disable FK enforcement for this session so insert order doesn't matter.
    // Requires a privileged connection; if it fails we continue and rely on
    // per-table error tolerance.
    await sql`set session_replication_role = replica`.catch(() => {
      console.warn("Could not disable FK checks (insufficient privilege) — continuing best-effort.\n");
    });

    for (const file of files) {
      const table = file.replace(/\.json$/, "");
      const rows = JSON.parse(readFileSync(join(folder, file), "utf8")) as Record<string, unknown>[];
      try {
        await sql`truncate table ${sql(table)} cascade`;
        if (rows.length > 0) {
          // Insert in chunks to stay well under parameter limits.
          for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500);
            await sql`insert into ${sql(table)} ${sql(chunk)}`;
          }
        }
        console.log(`  ✓ ${table} (${rows.length} rows)`);
        ok++;
      } catch (err) {
        console.error(`  ✗ ${table}: ${(err as Error).message}`);
        failed++;
      }
    }

    await sql`set session_replication_role = default`.catch(() => {});
    console.log(`\nRestore finished: ${ok} tables restored, ${failed} failed.`);
    await sql.end({ timeout: 5 });
  } catch (err) {
    await sql.end({ timeout: 5 }).catch(() => {});
    throw err;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nRestore failed:", err?.message ?? err);
    process.exit(1);
  });
