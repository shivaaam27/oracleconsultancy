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

// Helper that throws on error so calling code can `await` and get data directly.
export async function sbThrow<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  if (data == null) throw new Error("No data returned");
  return data;
}
