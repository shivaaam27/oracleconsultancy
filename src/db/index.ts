import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local or your Vercel env vars.");
}

// Serverless + Supabase pooler tuning. Two settings are load-bearing:
//   - `prepare: false` — required by PgBouncer transaction mode.
//   - `max: 1` — one socket per function instance; larger pools hang
//     on warm invocations after Supabase closes idle sockets server-side.
//
// `idle_timeout: 5` + `max_lifetime: 30` aggressively recycle so we
// don't try to write to a socket Supabase has already killed.
const client = postgres(url, {
  prepare: false,
  max: 1,
  idle_timeout: 5,
  max_lifetime: 30,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export { schema };

// Build-time marker so each deploy spawns fresh lambdas (avoids warm
// instances from prior deploys holding stale connection pools).
export const DEPLOY_TAG = process.env.VERCEL_DEPLOYMENT_ID || "local";
