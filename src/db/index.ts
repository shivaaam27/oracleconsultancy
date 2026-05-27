import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local or your Vercel env vars.");
}

// Serverless: each function instance only handles one request at a time, so
// keep the per-instance pool tiny. Supabase's pooler (transaction mode, port
// 6543) handles concurrency across instances. `prepare: false` is required
// because PgBouncer transaction mode does not support prepared statements.
const client = postgres(url, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export { schema };
