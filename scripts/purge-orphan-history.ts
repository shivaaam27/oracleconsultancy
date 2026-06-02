/**
 * One-shot: permanently deletes orphaned history — audit_log / task_updates rows
 * whose task no longer exists. These are tombstones from past deletes (audit_log
 * only nulled task_id, never removed the rows) and show up as phantom companies /
 * task codes in the timeline.
 *
 * Usage: npx tsx scripts/purge-orphan-history.ts          (dry run — counts only)
 *        npx tsx scripts/purge-orphan-history.ts --apply  (hard-deletes them)
 */
import { config } from "dotenv"; config({ path: ".env.local" }); config({ path: ".env" });
import postgres from "postgres";

async function main() {
  const apply = process.argv.includes("--apply");
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  // An audit row is orphaned when neither its task_id nor its task_code maps to a live task.
  const orphanAudit = sql`
    NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = a.task_id)
    AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.code = a.task_code OR t.legacy_code = a.task_code)
  `;
  const orphanUpdate = sql`NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = u.task_id)`;

  const [{ a }] = await sql`SELECT COUNT(*)::int AS a FROM audit_log a WHERE ${orphanAudit}`;
  const [{ u }] = await sql`SELECT COUNT(*)::int AS u FROM task_updates u WHERE ${orphanUpdate}`;
  console.log(`Orphaned audit_log rows:    ${a}`);
  console.log(`Orphaned task_updates rows: ${u}`);

  if (!apply) {
    console.log("Dry run — pass --apply to permanently delete them.");
  } else {
    // Clear corrections that reference orphan audit rows (FK), then delete.
    await sql`DELETE FROM corrections WHERE audit_log_id IN (SELECT a.id FROM audit_log a WHERE ${orphanAudit})`;
    await sql`DELETE FROM corrections WHERE corrected_by_entry_id IN (SELECT a.id FROM audit_log a WHERE ${orphanAudit})`;
    const da = await sql`DELETE FROM audit_log a WHERE ${orphanAudit}`;
    const du = await sql`DELETE FROM task_updates u WHERE ${orphanUpdate}`;
    console.log(`✓ Deleted ${da.count} audit rows and ${du.count} update rows. Gone for good.`);
  }
  await sql.end();
}
main();
