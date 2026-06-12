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
const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No database URL set (DIRECT_DATABASE_URL or DATABASE_URL).");
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client);

async function main() {
  console.log("Running migrations from ./drizzle …");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
