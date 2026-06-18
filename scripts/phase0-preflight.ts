/**
 * Phase 0 migration pre-flight — diagnose (and with --fix, clean) the data that
 * would make migration 0086's constraints fail to apply. Read-only by default.
 *   tsx scripts/phase0-preflight.ts          # diagnose only
 *   tsx scripts/phase0-preflight.ts --fix    # null orphan pointers / delete orphan notifications
 * Letter-ref duplicates are only REPORTED (never auto-edited) — they need a human call.
 */
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { prepare: false, max: 1 });
const fix = process.argv.includes("--fix");

async function main() {
  const out: string[] = [];

  const dupRefs = await sql`
    SELECT ref, count(*)::int AS n FROM letters WHERE ref IS NOT NULL GROUP BY ref HAVING count(*) > 1`;
  out.push(`duplicate letter refs: ${dupRefs.length}` + (dupRefs.length ? " -> " + dupRefs.map((r) => `${r.ref}×${r.n}`).join(", ") : ""));

  const checks: Array<{ label: string; count: () => Promise<number>; fix: () => Promise<unknown> }> = [
    { label: "people.manager_id orphans",
      count: async () => (await sql`SELECT count(*)::int AS n FROM people WHERE manager_id IS NOT NULL AND manager_id NOT IN (SELECT id FROM people)`)[0].n,
      fix: () => sql`UPDATE people SET manager_id = NULL WHERE manager_id IS NOT NULL AND manager_id NOT IN (SELECT id FROM people)` },
    { label: "people.related_person_id orphans",
      count: async () => (await sql`SELECT count(*)::int AS n FROM people WHERE related_person_id IS NOT NULL AND related_person_id NOT IN (SELECT id FROM people)`)[0].n,
      fix: () => sql`UPDATE people SET related_person_id = NULL WHERE related_person_id IS NOT NULL AND related_person_id NOT IN (SELECT id FROM people)` },
    { label: "task_updates.parent_update_id orphans",
      count: async () => (await sql`SELECT count(*)::int AS n FROM task_updates WHERE parent_update_id IS NOT NULL AND parent_update_id NOT IN (SELECT id FROM task_updates)`)[0].n,
      fix: () => sql`UPDATE task_updates SET parent_update_id = NULL WHERE parent_update_id IS NOT NULL AND parent_update_id NOT IN (SELECT id FROM task_updates)` },
    { label: "task_updates.attachment_document_id orphans",
      count: async () => (await sql`SELECT count(*)::int AS n FROM task_updates WHERE attachment_document_id IS NOT NULL AND attachment_document_id NOT IN (SELECT id FROM documents)`)[0].n,
      fix: () => sql`UPDATE task_updates SET attachment_document_id = NULL WHERE attachment_document_id IS NOT NULL AND attachment_document_id NOT IN (SELECT id FROM documents)` },
    { label: "notifications.thread_id orphans",
      count: async () => (await sql`SELECT count(*)::int AS n FROM notifications WHERE thread_id IS NOT NULL AND thread_id NOT IN (SELECT id FROM chat_threads)`)[0].n,
      fix: () => sql`DELETE FROM notifications WHERE thread_id IS NOT NULL AND thread_id NOT IN (SELECT id FROM chat_threads)` },
    { label: "notifications.request_id orphans",
      count: async () => (await sql`SELECT count(*)::int AS n FROM notifications WHERE request_id IS NOT NULL AND request_id NOT IN (SELECT id FROM requests)`)[0].n,
      fix: () => sql`DELETE FROM notifications WHERE request_id IS NOT NULL AND request_id NOT IN (SELECT id FROM requests)` },
  ];

  let dirty = 0;
  for (const c of checks) {
    const n = await c.count();
    if (n > 0) dirty += n;
    if (n > 0 && fix) {
      await c.fix();
      out.push(`${c.label}: ${n} -> CLEANED`);
    } else {
      out.push(`${c.label}: ${n}`);
    }
  }

  console.log(out.join("\n"));
  console.log("---");
  if (dupRefs.length > 0) console.log("ACTION NEEDED: resolve duplicate letter refs by hand before applying.");
  if (dirty === 0 && dupRefs.length === 0) console.log("CLEAN: migration 0086 can be applied safely.");
  else if (!fix) console.log(`${dirty} orphan pointer(s) found — re-run with --fix to clean (safe; only nulls/deletes already-broken references).`);
  else console.log(`Orphans cleaned. ${dupRefs.length ? "Still resolve letter refs, then apply." : "Migration 0086 can be applied."}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
