import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

/**
 * `npm run mkt:bucket` — creates the private `marketing` storage bucket.
 *
 * ⚠️ PRIVATE, ALWAYS. `npm run db:check-security` fails on a public bucket, and
 * rightly: a public bucket is a permanent address anybody can pass around. Every
 * screen mints a short-lived signed link from the stored PATH instead.
 *
 * Safe to run twice — an existing bucket is left exactly as it is.
 */
export const MARKETING_BUCKET = "marketing";

async function main() {
  const { sb } = await import("@/db/supabase");
  const { data: buckets } = await sb.storage.listBuckets();
  const existing = buckets?.find((b) => b.name === MARKETING_BUCKET);

  if (existing) {
    console.log(`bucket "${MARKETING_BUCKET}" already exists · public: ${existing.public}`);
    if (existing.public) console.error("⚠️  IT IS PUBLIC. Make it private in Supabase — db:check-security will fail.");
    return;
  }

  // ⚠️ NO fileSizeLimit HERE. A per-bucket limit above the PROJECT's global
  // limit is refused outright ("the object exceeded the maximum allowed size"),
  // which reads like a file error rather than a settings one. The project's own
  // ceiling applies; raise that in Supabase if a video is ever turned away.
  const { error } = await sb.storage.createBucket(MARKETING_BUCKET, { public: false });
  if (error) { console.error(`could not create it: ${error.message}`); process.exit(1); }
  console.log(`created private bucket "${MARKETING_BUCKET}"`);
}
main();
