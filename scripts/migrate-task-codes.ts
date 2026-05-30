/**
 * One-time migration: rename task codes to the company-prefixed "DS-001" scheme.
 *
 * - Each company is renumbered fresh from 001 in creation order (by id).
 * - The previous code is preserved in tasks.legacy_code so old /task/<code>
 *   links keep working.
 * - References that store the code as a string are rewritten: audit_log.task_code
 *   and inbox.filed_ref (filed_kind='task'). meeting_tasks / reminders use task_id
 *   and need no change. undo_tokens are ephemeral and are cleared.
 *
 * Safety: writes a full JSON backup of tasks/audit_log/inbox first, runs inside a
 * transaction, and refuses to run twice (aborts if any task already has a
 * legacy_code). Run with:  npx tsx scripts/migrate-task-codes.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";
import { writeFileSync, mkdirSync } from "node:fs";

// Map existing company code (CO01…) → new two-letter task prefix.
const PREFIX: Record<string, string> = {
  CO01: "DS", // Dar Spices
  CO02: "CC", // Cocozuri Chocolat
  CO03: "TG", // Terra Green
  CO04: "OC", // Oracle Consultancy
  CO05: "PE", // PES Ltd
  CO06: "ME", // MES Ltd
  CO07: "PP", // Pamoja Plus
};

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });

const pad = (n: number) => String(n).padStart(3, "0");

async function main() {
  // ---- Guard: refuse to run twice ----
  const [{ count: already }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM tasks WHERE legacy_code IS NOT NULL`;
  if (already > 0) {
    console.error(`Aborting: ${already} tasks already have a legacy_code — migration appears to have run already.`);
    await sql.end();
    process.exit(1);
  }

  // ---- Backup ----
  const tasks = await sql`SELECT * FROM tasks ORDER BY id`;
  const audit = await sql`SELECT * FROM audit_log`;
  const inbox = await sql`SELECT * FROM inbox`;
  mkdirSync("backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `backups/task-codes-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify({ tasks, audit_log: audit, inbox }, null, 2));
  console.log(`Backup written: ${backupPath} (tasks=${tasks.length}, audit=${audit.length}, inbox=${inbox.length})`);

  const companies = await sql<{ id: number; code: string; name: string }[]>`
    SELECT id, code, name FROM companies ORDER BY code`;

  const mapping: { old: string; next: string }[] = [];

  await sql.begin(async (tx) => {
    for (const c of companies) {
      const prefix = PREFIX[c.code];
      if (!prefix) { console.warn(`! No prefix for company ${c.code} (${c.name}) — skipping its tasks.`); continue; }
      await tx`UPDATE companies SET code_prefix = ${prefix} WHERE id = ${c.id}`;

      // Old-format codes only (e.g. CO01-008); new codes have no digits before the dash.
      const rows = await tx<{ id: number; code: string }[]>`
        SELECT id, code FROM tasks
        WHERE company_id = ${c.id} AND code ~ '^[A-Z]+[0-9]+-[0-9]+$'
        ORDER BY id`;

      let i = 0;
      for (const r of rows) {
        i += 1;
        const next = `${prefix}-${pad(i)}`;
        await tx`UPDATE tasks SET code = ${next}, legacy_code = ${r.code} WHERE id = ${r.id}`;
        mapping.push({ old: r.code, next });
      }
      console.log(`  ${c.code} ${c.name}: ${rows.length} task(s) → ${prefix}-001…${prefix}-${pad(rows.length)}`);
    }

    // Rewrite string references via the old→new map.
    let auditUpd = 0, inboxUpd = 0;
    for (const { old, next } of mapping) {
      const a = await tx`UPDATE audit_log SET task_code = ${next} WHERE task_code = ${old}`;
      auditUpd += a.count;
      const b = await tx`UPDATE inbox SET filed_ref = ${next} WHERE filed_kind = 'task' AND filed_ref = ${old}`;
      inboxUpd += b.count;
    }
    // Undo tokens embed codes in their payloads and are short-lived — clear them.
    const u = await tx`DELETE FROM undo_tokens`;
    console.log(`  audit_log rows updated: ${auditUpd}, inbox refs updated: ${inboxUpd}, undo_tokens cleared: ${u.count}`);
  });

  console.log(`Done. ${mapping.length} task code(s) renamed.`);
  await sql.end();
}

main().catch(async (err) => { console.error("Migration failed:", err); await sql.end(); process.exit(1); });
