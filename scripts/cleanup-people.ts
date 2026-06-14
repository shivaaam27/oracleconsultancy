/**
 * cleanup-people.ts — reviewed cleanup of the messy people table.
 *   - MERGE: move a duplicate's references (tasks, docs, facts, todos, reports…)
 *     onto the real person, then delete the duplicate. No history is lost.
 *   - DELETE: remove confirmed junk/test entries that have ZERO references.
 *
 * Dry-run by default (prints the plan, writes nothing). Apply with --apply.
 * The id pairs/lists below were derived from a full reference audit and are
 * meant to be reviewed before applying.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");

// [loserId, keeperId, "loser → keeper"] — the loser's refs move to the keeper.
const MERGES: Array<[number, number, string]> = [
  [55, 13, "Pulin → Pulin Manek"],
  [37, 2, "Jitesh → Jitesh Solanki"],
  [5, 54, "Hiral → Hiral Borsadiya"],
  [56, 11, "Amal → Amal Somaiya"],
  [20, 1, "Shvam → Shivam Alpeshkumar Parmar"],
  [39, 4, "Visha;l → Vishal Pragji"],
  [10, 35, "Hanisha → Hanisha Parmar"],
  [51, 1, "Shivam → Shivam Alpeshkumar Parmar"],
];

// Pure junk / test entries with ZERO references — safe to delete outright.
const DELETE_IDS: Array<[number, string]> = [
  [32, "Ahmed Hassan"], [23, "Benja"], [34, "David Chen"], [27, "dvd"], [29, "Fire"],
  [15, "Jigna"], [33, "Maria Torres"], [21, "Mona"], [30, "Pankaj"], [24, "Sahel"],
  [36, "Sarah Johnson"], [25, "Yuvi"], [17, "Vishak"],
];

// person_id columns to repoint on a merge. Composite tables list their OTHER
// key column so we can drop a loser row that would collide with the keeper.
const REF_TABLES: Array<{ table: string; col: string; otherKey?: string }> = [
  { table: "task_assignees", col: "person_id", otherKey: "task_id" },
  { table: "person_companies", col: "person_id", otherKey: "company_id" },
  { table: "attendance", col: "person_id", otherKey: "date" },
  { table: "person_requirements", col: "person_id", otherKey: "item_id" },
  { table: "facts", col: "person_id" },
  { table: "documents", col: "person_id" },
  { table: "asset_assignments", col: "person_id" },
  { table: "leave_requests", col: "person_id" },
  { table: "todos", col: "person_id" },
  { table: "person_events", col: "person_id" },
  { table: "pipeline", col: "person_id" },
  { table: "reporting_lines", col: "person_id", otherKey: "manager_id" },
  { table: "reporting_lines", col: "manager_id", otherKey: "person_id" },
];

async function main() {
  const { sb } = await import("@/db/supabase");
  console.log(`\n=== ${APPLY ? "APPLY" : "DRY RUN"} · people cleanup ===\n`);

  console.log("MERGES (move references, then delete the duplicate):");
  for (const [loser, keeper, label] of MERGES) {
    let moved = 0, dropped = 0;
    for (const { table, col, otherKey } of REF_TABLES) {
      const { data: loserRows, error } = await sb.from(table).select("*").eq(col, loser);
      if (error || !loserRows?.length) continue;
      if (!otherKey) {
        moved += loserRows.length;
        if (APPLY) await sb.from(table).update({ [col]: keeper }).eq(col, loser);
        continue;
      }
      const { data: keeperRows } = await sb.from(table).select(otherKey).eq(col, keeper);
      const keeperSet = new Set((keeperRows ?? []).map((r: any) => String(r[otherKey])));
      for (const row of loserRows as any[]) {
        const key = row[otherKey];
        const isNull = key == null;
        const collides = !isNull && keeperSet.has(String(key));
        // Use .is() for SQL NULL (supabase .eq(col, null) emits the literal string "null").
        const sel = (q: any) => (isNull ? q.is(otherKey, null) : q.eq(otherKey, key));
        if (collides) { dropped++; if (APPLY) await sel(sb.from(table).delete().eq(col, loser)); }
        else { moved++; if (APPLY) await sel(sb.from(table).update({ [col]: keeper }).eq(col, loser)); }
      }
    }
    // People/rows that point AT the loser via other FK columns → repoint.
    for (const fk of ["manager_id"]) {
      const { data: rows } = await sb.from("people").select("id").eq(fk, loser);
      if (rows?.length) { moved += rows.length; if (APPLY) await sb.from("people").update({ [fk]: keeper }).eq(fk, loser); }
    }
    // tasks.owner_id is a FK with ON DELETE no action — repoint or the delete fails.
    const { data: ownedTasks } = await sb.from("tasks").select("id").eq("owner_id", loser);
    if (ownedTasks?.length) { moved += ownedTasks.length; if (APPLY) await sb.from("tasks").update({ owner_id: keeper }).eq("owner_id", loser); }
    if (APPLY) {
      const { error } = await sb.from("people").delete().eq("id", loser);
      if (error) { console.log(`  ⚠ ${label}: DELETE FAILED for id ${loser} — ${error.message} (references moved, loser still present)`); continue; }
    }
    console.log(`  ${label}: moved ${moved} ref(s), dropped ${dropped} duplicate-ref(s), deleted id ${loser}`);
  }

  // MEANINGFUL references that should block a delete (i.e. real history/data).
  // Derived rows — person_requirements (auto checklist), person_events (audit),
  // attendance — are excluded: they're auto-generated and cascade-delete with the
  // person, so they don't make an entry "real".
  const MEANINGFUL = REF_TABLES.filter((t) => !["person_requirements", "person_events", "attendance"].includes(t.table));
  console.log("\nDELETES (junk, no meaningful references):");
  for (const [id, name] of DELETE_IDS) {
    let refs = 0; const where: string[] = [];
    for (const { table, col } of MEANINGFUL) { const { count } = await sb.from(table).select(col, { count: "exact", head: true }).eq(col, id); if (count) { refs += count; where.push(`${table}:${count}`); } }
    const { count: rep } = await sb.from("people").select("id", { count: "exact", head: true }).eq("manager_id", id);
    if (rep) { refs += rep; where.push(`reports:${rep}`); }
    if (refs > 0) { console.log(`  ⚠ SKIP ${name} (id ${id}) — has real references (${where.join(", ")})`); continue; }
    if (APPLY) await sb.from("people").delete().eq("id", id); // cascade clears its auto checklist/events/attendance
    console.log(`  ${name} (id ${id}): deleted${APPLY ? "" : " (would delete)"}`);
  }

  console.log(`\n=== ${APPLY ? "DONE" : "DRY RUN — re-run with --apply to write"} ===`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
