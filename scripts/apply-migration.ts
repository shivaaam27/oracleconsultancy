/**
 * Apply a single migration file by tag and record it as applied, bypassing
 * `db:migrate` (whose snapshot predates the hand-applied meetings table and
 * would try to recreate existing tables). Use only with idempotent SQL
 * (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS), so re-runs are safe.
 *
 * Usage: npx tsx scripts/apply-migration.ts <tag-without-.sql>
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const url = process.env.DATABASE_URL;
const TAG = process.argv[2];
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
if (!TAG) { console.error("Usage: tsx scripts/apply-migration.ts <tag>"); process.exit(1); }

const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  const content = readFileSync(path.join("drizzle", `${TAG}.sql`), "utf-8");
  const statements = content.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) await sql.unsafe(stmt);
  console.log(`✓ Applied ${TAG} (${statements.length} statement(s)).`);

  await sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
  await sql`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
  const hash = createHash("sha256").update(statements.join("")).digest("hex");
  const existing = await sql`SELECT id FROM "drizzle"."__drizzle_migrations" WHERE hash = ${hash}`;
  if (existing.length === 0) {
    await sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${Date.now()})`;
    console.log(`✓ Recorded ${TAG} as applied.`);
  } else {
    console.log(`✓ ${TAG} already recorded.`);
  }
  await sql.end();
}

main().catch(async (err) => { console.error("apply-migration failed:", err); await sql.end(); process.exit(1); });
