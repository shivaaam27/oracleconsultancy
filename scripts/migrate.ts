import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Prefer a direct (session-mode) connection for migrations when provided.
// Supabase's transaction pooler (port 6543) is meant for app queries, not DDL;
// set DIRECT_DATABASE_URL to the session pooler / direct connection (5432) in
// Vercel so build-time migrations are reliable. Falls back to DATABASE_URL.
const url: string | undefined = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No database URL set (DIRECT_DATABASE_URL or DATABASE_URL).");
  process.exit(1);
}
const dbUrl: string = url;

// A transient connection blip (ECONNRESET / cold pooler) shouldn't fail a whole
// deploy — only a genuine migration error should. So retry connection-level
// failures a few times before giving up.
const TRANSIENT = ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "CONNECT_TIMEOUT", "ENOTFOUND", "EAI_AGAIN"];
const isTransient = (err: unknown) => {
  const code = (err as { code?: string })?.code ?? "";
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT.includes(code) || /econnreset|timeout|terminating connection|connection closed/i.test(msg);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = postgres(dbUrl, { prepare: false, max: 1, connect_timeout: 30 });
    try {
      console.log(`Running migrations from ./drizzle … (attempt ${attempt}/${maxAttempts})`);
      await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
      console.log("Migrations applied.");
      await client.end({ timeout: 5 });
      return;
    } catch (err) {
      await client.end({ timeout: 5 }).catch(() => {});
      if (isTransient(err) && attempt < maxAttempts) {
        const wait = attempt * 2000;
        console.warn(`Transient DB error (attempt ${attempt}): ${(err as Error).message}. Retrying in ${wait}ms…`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
