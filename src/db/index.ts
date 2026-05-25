import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local or your Vercel env vars.");
}

// One pooled client for the lifetime of the server. Supabase Connection Pooler handles concurrency.
const client = postgres(url, { prepare: false, max: 10 });

export const db = drizzle(client, { schema });
export { schema };
