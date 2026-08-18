import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

// Server-side client using the service-role key (bypasses RLS). Safe because
// every consumer of this file is a server-only path (server components, server
// actions, API routes). Never import this from a client component.
//
// HTTP under the hood → no persistent socket → no warm-pool hangs.
export const sb = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: { schema: "public" },
});

// Convenience: type for a Supabase response error shape.
export type SbError = { message: string };

/**
 * Read EVERY row, however many there are.
 *
 * ⚠️ PostgREST stops at 1,000 rows and says nothing about it. A `select()` with
 * no range silently returns the first thousand, so a list function looks
 * perfectly healthy until the table grows past that — and then quietly reports
 * on a fraction of the data.
 *
 * Found the hard way: importing the PES workbook put 2,600 enquiries in, and
 * `listEnquiries()` returned 1,000 of them. The Funnel showed 1,000, computed
 * every conversion figure from the newest 1,000, and the whole of 2025
 * disappeared without a single error anywhere.
 *
 * ⚠️ **A list function that can hold more than a thousand rows must go through
 * this.** Pass a factory that builds the query for one page — the builder
 * cannot be reused once awaited, so it has to be rebuilt each time.
 *
 *   const rows = await fetchAllRows((from, to) =>
 *     sb.from("ops_enquiries").select(COLS).eq("company_id", id).range(from, to));
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) {
      console.error("[fetchAllRows]", error.message);
      break;
    }
    const rows = data ?? [];
    out.push(...rows);
    // A short page is the last page. Equal-length means there may be more.
    if (rows.length < pageSize) break;
    // Belt and braces against a query that never shortens.
    if (out.length > 200_000) {
      console.error("[fetchAllRows] stopped at 200,000 rows — check the query");
      break;
    }
  }
  return out;
}

// Helper that throws on error so calling code can `await` and get data directly.
export async function sbThrow<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  if (data == null) throw new Error("No data returned");
  return data;
}
