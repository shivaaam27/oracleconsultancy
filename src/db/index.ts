import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local or your Vercel env vars.");
}

// Serverless + Supabase pooler: `max: 1` is load-bearing.
// We tried max:5 to parallelise Promise.all queries — fast on a fresh
// function, but warm invocations hung for 60s+ because Supabase silently
// closes idle sockets and postgres.js waits forever on the dead ones.
// `prepare: false` is also load-bearing (PgBouncer transaction mode).
const client = postgres(url, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export { schema };
