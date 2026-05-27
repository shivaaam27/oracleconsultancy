import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local or your Vercel env vars.");
}

// Serverless: each function instance handles one request, but a single
// request often issues several queries (especially `Promise.all` ones).
// `max: 5` lets those parallelise instead of serialising on one socket.
// `prepare: false` is the load-bearing setting — required by PgBouncer
// transaction mode and must not be removed.
const client = postgres(url, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export { schema };
