// Re-runnable backfill for semantic search (Phase 3b + advanced upgrade).
//
// Indexes every active task + meeting + document + person (chunked, hybrid,
// translated) and removes orphan/stale vectors — by calling the same reindexAll()
// the nightly cron uses, forcing past the on/off toggle. Run after the migration
// + the `embed` Edge Function are deployed:  npm run db:embed-backfill
// Re-running is safe — unchanged items (same content hash) are skipped.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  // Dynamic import AFTER dotenv: app modules read env at import time, but static
  // ESM imports run before the config() calls above.
  const { reindexAll } = await import("@/lib/embeddings-reindex");
  console.log("Backfilling all embeddings (tasks, meetings, documents, people; chunked)…");
  const { checked, orphansRemoved } = await reindexAll(true);
  console.log(`\nDone. ${checked} items processed, ${orphansRemoved} orphan vectors removed. Re-run any time; unchanged items are skipped.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
