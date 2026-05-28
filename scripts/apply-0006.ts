/**
 * One-shot: applies the 0006 migration (audit_log.deleted_at) directly,
 * then re-baselines so future drizzle migrate runs are in sync.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  // 1) Apply 0006 if the column doesn't exist yet
  const exists = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'deleted_at'
  `;
  if (exists.length === 0) {
    console.log("Adding audit_log.deleted_at …");
    await sql.unsafe(`ALTER TABLE "audit_log" ADD COLUMN "deleted_at" timestamp;`);
    console.log("✓ Column added.");
  } else {
    console.log("✓ Column already exists.");
  }

  // 2) Re-baseline so __drizzle_migrations records every file in drizzle/
  await sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
  await sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;
  const journal = JSON.parse(
    readFileSync(path.join("drizzle", "meta", "_journal.json"), "utf-8")
  ) as { entries: { tag: string; when: number }[] };

  const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const tag = file.replace(/\.sql$/, "");
    const entry = journal.entries.find((e) => e.tag === tag);
    if (!entry) continue;
    const content = readFileSync(path.join("drizzle", file), "utf-8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim()).filter(Boolean);
    const hash = createHash("sha256").update(statements.join("")).digest("hex");
    const existing = await sql`SELECT id FROM "drizzle"."__drizzle_migrations" WHERE hash = ${hash}`;
    if (existing.length > 0) { console.log(`✓ ${tag} already baselined.`); continue; }
    await sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${entry.when})`;
    console.log(`✓ Baselined ${tag}.`);
  }

  await sql.end();
}

main().catch(async (err) => {
  console.error(err); await sql.end(); process.exit(1);
});
