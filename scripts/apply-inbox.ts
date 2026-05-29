/**
 * One-shot: applies migration 0009 (the inbox table) directly and records it as
 * applied in Drizzle's migration table. Used instead of `db:migrate` because the
 * Drizzle snapshot predates the hand-applied 0008 (meetings), so a full migrate
 * would try to recreate existing tables. The inbox DDL uses IF NOT EXISTS, so
 * this is safe to run more than once.
 *
 * Usage: npx tsx scripts/apply-inbox.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const TAG = "0009_volatile_molly_hayes";
const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  const content = readFileSync(path.join("drizzle", `${TAG}.sql`), "utf-8");
  const statements = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await sql.unsafe(stmt);
  }
  console.log("✓ inbox table ensured.");

  // Record as applied so future `db:migrate` skips it.
  await sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
  await sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
    )
  `;
  const journal = JSON.parse(
    readFileSync(path.join("drizzle", "meta", "_journal.json"), "utf-8")
  ) as { entries: { tag: string; when: number }[] };
  const when = journal.entries.find((e) => e.tag === TAG)?.when ?? Date.now();
  const hash = createHash("sha256").update(statements.join("")).digest("hex");

  const existing = await sql`SELECT id FROM "drizzle"."__drizzle_migrations" WHERE hash = ${hash}`;
  if (existing.length === 0) {
    await sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${when})`;
    console.log(`✓ Recorded ${TAG} as applied.`);
  } else {
    console.log(`✓ ${TAG} already recorded.`);
  }

  await sql.end();
}

main().catch(async (err) => {
  console.error("apply-inbox failed:", err);
  await sql.end();
  process.exit(1);
});
