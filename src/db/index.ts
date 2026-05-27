import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local or your Vercel env vars.");
}

// Per-request client + immediate close.
// We tried various pool configs (max:1 with idle_timeout 5/20, max_lifetime
// 10/30) — every config eventually hung warm invocations because Supabase
// closes idle sockets server-side and postgres.js waits forever on the dead
// socket. Switching to a no-pool model: each query opens its own connection
// and closes it. The ~150ms TCP+TLS handshake cost is worth eliminating the
// random 30-60s page hangs.

// `prepare: false` is still required for PgBouncer transaction mode.

function makeClient() {
  return postgres(url!, {
    prepare: false,
    max: 1,
    idle_timeout: 1,
    max_lifetime: 5,
    connect_timeout: 10,
  });
}

// Proxy that creates a fresh underlying client on first property access per
// request, then closes it shortly after via `idle_timeout: 1`. Drizzle calls
// methods on `db` synchronously to build a query, then `await` runs it — by
// the time the second query in the same request fires, the connection still
// exists in the pool (used within 1s of the previous one). Once the request
// finishes and the lambda goes idle for >1s, the connection auto-closes.
const client = makeClient();
export const db = drizzle(client, { schema });
export { schema };

export const DEPLOY_TAG = process.env.VERCEL_DEPLOYMENT_ID || "local";
