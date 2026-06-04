/**
 * Create the private "documents" storage bucket used by the Compliance &
 * Documents centre for in-app file uploads. Idempotent — safe to re-run.
 *
 * Usage: npx tsx scripts/create-documents-bucket.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error("Supabase env vars not set."); process.exit(1); }

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
const BUCKET = "documents";

async function main() {
  const { data: existing } = await sb.storage.getBucket(BUCKET);
  if (existing) {
    console.log(`✓ Bucket "${BUCKET}" already exists (public=${existing.public}).`);
    return;
  }
  const { error } = await sb.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: "20MB",
    allowedMimeTypes: [
      "application/pdf",
      "image/png", "image/jpeg", "image/webp", "image/heic",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  });
  if (error) { console.error("createBucket failed:", error.message); process.exit(1); }
  console.log(`✓ Created private bucket "${BUCKET}" (20MB limit).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
