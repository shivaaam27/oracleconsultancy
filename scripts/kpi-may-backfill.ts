/**
 * kpi-may-backfill.ts — one-off: merge the "Command Centre"/duplicate person rows
 * into the real active people, then create Shivam's completed-May tasks.
 * Dry-run by default; apply with `--apply`. See memory/kpi_task_attribution.md.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");
const SHIVAM = 71;
const MAY = "2026-05-31"; // deadline + closed_date for every backfilled task
const MAY_ISO = "2026-05-31T12:00:00.000Z";

// person merges: [loserId, keeperId, label]
const MERGES: Array<[number, number, string]> = [
  [1, SHIVAM, "Command Centre → Shivam"],
  [46, 70, "Nayan (dup) → Mr Nayan Vaghela"],
  [52, 22, "Sanjay (dup) → Mr Sanjay Kaushik"],
];

type NewTask = {
  prefix: string;
  companyId: number;
  title: string;
  desc: string;
  update: string;
  /** working assignees besides Shivam (who is always the accountable lead). */
  also?: number[];
};

const NEW_TASKS: NewTask[] = [
  { prefix: "OC", companyId: 4, title: "Expat housing & permits set-up (May)",
    desc: "Arranged expat housing (tenancy contracts, internet installation, domestic help) and drove permit processing for incoming expats (Abinash, Sanjay), including permit pricing and facilitation-fee information gathered via immigration contacts Beka and Sulleiman. Coordinated arrival, insurance and logistics.",
    update: "Housing arranged and permit processing progressed for incoming expat staff through May." },
  { prefix: "OC", companyId: 4, title: "Contracts & compliance update — all companies (May)",
    desc: "Created and updated employment and commercial contracts across all companies; reviewed and updated documents/compliance records; organised the shared Dropbox document library.",
    update: "Contracts and compliance records refreshed across the portfolio." },
  { prefix: "OC", companyId: 4, title: "COS / HR system development (May)",
    desc: "Researched and built the in-house COS/HR admin system: web-development research, Claude AI tooling understanding, and iterative HR system development.",
    update: "HR/COS system development progressed through May." },
  { prefix: "OC", companyId: 4, title: "Insurance & labour-law research (May)",
    desc: "Followed up and researched insurance options; studied Tanzanian labour law (ELRA) to ground HR policy.",
    update: "Insurance options and labour-law grounding researched." },
  { prefix: "OC", companyId: 4, title: "Uknowva HRMS evaluation (May)",
    desc: "Evaluated the Uknowva HRMS — coordinated with Hiral to understand the platform, trialled and followed up until the package was ultimately cancelled.",
    update: "Uknowva evaluated and trialled; package cancelled.", also: [54] },
  { prefix: "OC", companyId: 4, title: "Travel & ticketing (May)",
    desc: "Handled staff travel and ticketing — Rakesh Rathod ticket and follow-up, Blueberry ticket processing for Rakesh and Dipto plus dummy-ticket follow-up; coordinated with Joemar on travel.",
    update: "Staff tickets processed and travel coordinated." },
  { prefix: "OC", companyId: 4, title: "Juned creative communications (May)",
    desc: "Directed Juned on creative deliverables — photography, illustrations, business cards, product visuals and Terra Green materials.",
    update: "Creative deliverables directed with Juned.", also: [9] },
  { prefix: "OC", companyId: 4, title: "TRA / Idrass letter drafting (May)",
    desc: "Drafted formal letters for TRA / Idrass portal communications.",
    update: "Formal TRA/Idrass letters drafted.", also: [4] },
  { prefix: "OC", companyId: 4, title: "Company licences & key documents verified (May)",
    desc: "Verified and progressed key company licences and documents — Dar Spices and V1 business licences confirmed up to date, Oracle Consultancy lease renewed, business visa reviewed (expiring July), Dipto flight and arrival requirements completed, Shoppers statements collated.",
    update: "Key licences and documents verified and updated." },
  { prefix: "OC", companyId: 4, title: "OC cleaning management set-up (May)",
    desc: "Set up and organised Oracle Consultancy office cleaning management.",
    update: "Office cleaning management set up." },
  { prefix: "OC", companyId: 4, title: "Yellow-fever cards — Gangadhar & Dipto",
    desc: "Identified that Gangadhar and Dipto were missing yellow-fever vaccination cards; actioned.",
    update: "Missing yellow-fever cards identified and actioned." },
  { prefix: "CC", companyId: 2, title: "Cocozuri stock, business development & photography (May)",
    desc: "Visited Cocozuri to understand stock and operational issues; progressed business development and reporting; carried out photography at the kitchen and shop. Coordinated with Dhruvi on Cocozuri matters.",
    update: "Cocozuri stock/issues reviewed; BD and photography completed." },
  { prefix: "DS", companyId: 1, title: "Dar Spices IT — internet, printer & camera (May)",
    desc: "Followed up Dar Spices internet installation and query resolution; resolved printer and camera issues.",
    update: "Dar Spices internet, printer and camera issues resolved." },
  { prefix: "DS", companyId: 1, title: "Expat employment contract after permit — Sanjay",
    desc: "Prepared the expat employment contract to follow permit issuance for Sanjay.",
    update: "Expat employment contract prepared." },
  { prefix: "ME", companyId: 6, title: "MES staff welfare (May)",
    desc: "Utensil shopping for MES staff, food-allowance follow-up, and MES to-do list updates.",
    update: "MES staff welfare items handled." },
  { prefix: "ME", companyId: 6, title: "MES first machine payment",
    desc: "First payment toward the MES TRA machine (provisions paid first); urgent item. Originally tracked with Jitesh and Vishal.",
    update: "First MES machine payment actioned." },
];

async function main() {
  const { sb } = await import("@/db/supabase");
  console.log(`\n=== ${APPLY ? "APPLY" : "DRY RUN"} · KPI May backfill ===\n`);

  // ---- 1. Person merges -------------------------------------------------
  const REF: Array<{ table: string; col: string; otherKey?: string }> = [
    { table: "task_assignees", col: "person_id", otherKey: "task_id" },
    { table: "person_companies", col: "person_id", otherKey: "company_id" },
    { table: "facts", col: "person_id" },
    { table: "documents", col: "person_id" },
    { table: "asset_assignments", col: "person_id" },
    { table: "leave_requests", col: "person_id" },
    { table: "todos", col: "person_id" },
    { table: "outbox", col: "person_id" },
    { table: "person_events", col: "person_id" },
    { table: "attendance", col: "person_id", otherKey: "date" },
    { table: "person_requirements", col: "person_id", otherKey: "item_id" },
    { table: "reporting_lines", col: "person_id", otherKey: "manager_id" },
    { table: "reporting_lines", col: "manager_id", otherKey: "person_id" },
  ];
  for (const [loser, keeper, label] of MERGES) {
    let moved = 0, dropped = 0;
    for (const { table, col, otherKey } of REF) {
      const { data: rows } = await sb.from(table).select("*").eq(col, loser);
      if (!rows?.length) continue;
      if (!otherKey) { moved += rows.length; if (APPLY) await sb.from(table).update({ [col]: keeper }).eq(col, loser); continue; }
      const { data: keep } = await sb.from(table).select(otherKey).eq(col, keeper);
      const set = new Set((keep ?? []).map((r: any) => String(r[otherKey])));
      for (const row of rows as any[]) {
        const k = row[otherKey]; const isNull = k == null; const collide = !isNull && set.has(String(k));
        const sel = (q: any) => (isNull ? q.is(otherKey, null) : q.eq(otherKey, k));
        if (collide) { dropped++; if (APPLY) await sel(sb.from(table).delete().eq(col, loser)); }
        else { moved++; if (APPLY) await sel(sb.from(table).update({ [col]: keeper }).eq(col, loser)); }
      }
    }
    // repoint people.manager_id and tasks.owner_id pointing AT the loser
    const { data: rep } = await sb.from("people").select("id").eq("manager_id", loser);
    if (rep?.length) { moved += rep.length; if (APPLY) await sb.from("people").update({ manager_id: keeper }).eq("manager_id", loser); }
    const { data: own } = await sb.from("tasks").select("id").eq("owner_id", loser);
    if (own?.length) { moved += own.length; if (APPLY) await sb.from("tasks").update({ owner_id: keeper }).eq("owner_id", loser); }
    if (APPLY) { const { error } = await sb.from("people").delete().eq("id", loser); if (error) console.log(`  ⚠ ${label}: delete failed — ${error.message}`); }
    console.log(`  MERGE ${label}: moved ${moved}, dropped ${dropped} dup-ref(s)`);
  }

  // ---- 2. Create the May completed tasks --------------------------------
  // next code number per prefix
  const { data: existing } = await sb.from("tasks").select("code");
  const maxN: Record<string, number> = {};
  for (const t of existing ?? []) { const m = String(t.code).match(/^([A-Z]+)-(\d+)$/); if (m) maxN[m[1]] = Math.max(maxN[m[1]] ?? 0, +m[2]); }

  console.log("\n  NEW TASKS:");
  for (const t of NEW_TASKS) {
    const n = (maxN[t.prefix] ?? 0) + 1; maxN[t.prefix] = n;
    const code = `${t.prefix}-${String(n).padStart(3, "0")}`;
    const leads = [SHIVAM, ...(t.also ?? [])];
    console.log(`   ${code} [Closed] ${t.title}  :: lead 71${t.also ? " + working " + t.also.join(",") : ""}`);
    if (!APPLY) continue;
    const { data: ins, error } = await sb.from("tasks").insert({
      code, company_id: t.companyId, action_item: t.title, status: "Closed",
      priority: "Medium", category: "Admin", comments: t.desc, latest_update: t.update,
      deadline: MAY, created_date: MAY_ISO, last_updated_at: MAY_ISO, closed_date: MAY,
      created_by_person_id: SHIVAM, archived: false, requires_attachment: false,
    }).select("id").single();
    if (error || !ins) { console.log(`     ⚠ insert failed: ${error?.message}`); continue; }
    const taskId = ins.id as number;
    // Shivam is the accountable lead; any "also" are working contributors.
    const rows = [{ task_id: taskId, person_id: SHIVAM, role: "accountable" },
      ...(t.also ?? []).map((pid) => ({ task_id: taskId, person_id: pid, role: "working" }))];
    await sb.from("task_assignees").insert(rows);
    await sb.from("tasks").update({ owner_id: SHIVAM }).eq("id", taskId);
    await sb.from("task_updates").insert({ task_id: taskId, body: t.update, created_at: MAY_ISO, created_by: "web-ui" });
    void leads;
  }

  console.log(`\n=== ${APPLY ? "DONE" : "DRY RUN — re-run with --apply"} ===`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
