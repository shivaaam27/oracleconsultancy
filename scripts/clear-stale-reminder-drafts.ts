/**
 * clear-stale-reminder-drafts.ts — one-off cleanup of the Outbox draft pile-up.
 *
 * Auto-generated reminder/summary DRAFTS accumulated because every "WhatsApp
 * summary" / "Email summary" / per-task reminder used to insert a fresh draft
 * row and never replace the previous one. Going forward the app de-dups on
 * insert; this clears the historical backlog.
 *
 * Scope (deliberately narrow — only machine-generated, UNSENT reminder drafts):
 *   status = 'Draft'  AND  sent_at IS NULL  AND
 *   message_type IN ('TASK SUMMARY','TASK REMINDER','DAILY TASK REMINDER')
 * Composed/ad-hoc drafts and anything already sent are left untouched.
 *
 * Dry-run by default (prints the count, writes nothing). Apply with --apply.
 *   npm run db:backup          # take a snapshot first
 *   npx tsx scripts/clear-stale-reminder-drafts.ts            # preview
 *   npx tsx scripts/clear-stale-reminder-drafts.ts --apply    # delete
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");
const TYPES = ["TASK SUMMARY", "TASK REMINDER", "DAILY TASK REMINDER"];

async function main() {
  const { sb } = await import("@/db/supabase");

  const { data, error } = await sb
    .from("outbox")
    .select("id,recipient_name,message_type,channel,created_at")
    .eq("status", "Draft")
    .is("sent_at", null)
    .in("message_type", TYPES);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  console.log(`Found ${rows.length} stale unsent reminder draft(s).`);
  const byType = new Map<string, number>();
  for (const r of rows) {
    const k = (r.message_type as string) ?? "—";
    byType.set(k, (byType.get(k) ?? 0) + 1);
  }
  for (const [k, n] of byType) console.log(`  ${k}: ${n}`);

  if (!APPLY) {
    console.log("\nDry run — nothing deleted. Re-run with --apply to delete.");
    return;
  }
  if (rows.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  const ids = rows.map((r) => r.id as number);
  // Delete in chunks so the IN() list never gets too large.
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error: delErr } = await sb.from("outbox").delete().in("id", chunk);
    if (delErr) throw new Error(delErr.message);
    deleted += chunk.length;
  }
  console.log(`\nDeleted ${deleted} stale reminder draft(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
