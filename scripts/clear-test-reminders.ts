/**
 * clear-test-reminders.ts — remove the off-schedule "Task reminders" system
 * threads created while testing the cron, so the first real reminder lands fresh
 * at 9am. Deletes every reminders system thread (dm_key "sys:reminders:%");
 * chat_messages + chat_participants cascade off the thread. The thread is
 * re-created automatically on the next scheduled post.
 *
 *   npx tsx scripts/clear-test-reminders.ts            # preview
 *   npx tsx scripts/clear-test-reminders.ts --apply    # delete
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");

async function main() {
  const { sb } = await import("@/db/supabase");
  const { data, error } = await sb
    .from("chat_threads")
    .select("id,dm_key")
    .like("dm_key", "sys:reminders:%");
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => r.id as number);
  console.log(`Found ${ids.length} 'Task reminders' system thread(s).`);
  if (!APPLY) { console.log("Dry run — re-run with --apply to delete."); return; }
  if (ids.length === 0) { console.log("Nothing to delete."); return; }
  const { error: delErr } = await sb.from("chat_threads").delete().in("id", ids);
  if (delErr) throw new Error(delErr.message);
  console.log(`Deleted ${ids.length} thread(s) (messages + participants cascaded).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
