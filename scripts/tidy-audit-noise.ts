/**
 * One-shot: soft-deletes the reason-less field-change noise in audit_log (mostly
 * xlsx-import residue) so the raw log matches what timelines already show. This
 * mirrors `suppressNoReasonAudits` in src/lib/timeline.ts.
 *
 * SAFE + REVERSIBLE: sets deleted_at (does not hard-delete). Preserves CREATE,
 * ESCALATION, Status/Escalation changes, update-meta rows, and anything with a
 * human change_reason.
 *
 * Usage: npx tsx scripts/tidy-audit-noise.ts          (dry run — counts only)
 *        npx tsx scripts/tidy-audit-noise.ts --apply  (performs the soft-delete)
 */
import { config } from "dotenv"; config({ path: ".env.local" }); config({ path: ".env" });
import postgres from "postgres";

const KEEP_FIELDS = ["Status", "Escalation", "Task created", "Task deleted", "Update deleted", "Update edited", "Update pinned", "Update unpinned"];

async function main() {
  const apply = process.argv.includes("--apply");
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const keep = sql`${KEEP_FIELDS}::text[]`;

  const [{ n }] = await sql`
    SELECT COUNT(*)::int AS n FROM audit_log
    WHERE deleted_at IS NULL
      AND entry_type IS DISTINCT FROM 'CREATE'
      AND entry_type IS DISTINCT FROM 'ESCALATION'
      AND (field IS NULL OR NOT (field = ANY(${keep})))
      AND (change_reason IS NULL OR btrim(change_reason) = '')
  `;
  console.log(`Reason-less field-change noise: ${n} row(s).`);

  if (!apply) {
    console.log("Dry run — pass --apply to soft-delete them (reversible via deleted_at = NULL).");
  } else {
    const res = await sql`
      UPDATE audit_log SET deleted_at = now()
      WHERE deleted_at IS NULL
        AND entry_type IS DISTINCT FROM 'CREATE'
        AND entry_type IS DISTINCT FROM 'ESCALATION'
        AND (field IS NULL OR NOT (field = ANY(${keep})))
        AND (change_reason IS NULL OR btrim(change_reason) = '')
    `;
    console.log(`✓ Soft-deleted ${res.count} row(s). Restore with: UPDATE audit_log SET deleted_at = NULL WHERE deleted_at > now() - interval '1 hour'`);
  }
  await sql.end();
}
main();
