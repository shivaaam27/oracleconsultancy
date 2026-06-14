/**
 * seed-live-data.ts — one-time reconcile-and-seed from the transfer-pack's
 * `live-data/` JSON (transfer-pack 09, Job 1). The site is NOT fresh, so this
 * RECONCILES rather than blindly inserts:
 *   - companies: match by alias → fill/correct identifiers (TIN/VRN/reg/prefix);
 *     create V1 Intertrade. Identifiers are authoritative from the pack; other
 *     fields fill blanks-only.
 *   - people: match by normalised name → enrich blanks-only; create unmatched.
 *   - facts: append all 118 to the ledger (created_by "seed-live-data", re-runnable).
 *   - governance / risks / decisions: load into the Area-B tables (delete seed
 *     rows then insert — these tables hold only seed data).
 *
 * The live-data JSON is HIGHLY CONFIDENTIAL and lives OUTSIDE the repo. This
 * script only reads it; it never copies it in.
 *
 *   Dry run (default, no writes):  npx tsx scripts/seed-live-data.ts
 *   Apply:                         npx tsx scripts/seed-live-data.ts --apply
 *   Custom data dir:               LIVE_DATA_DIR="C:\\path\\to\\live-data" npx tsx ...
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const DIR = process.env.LIVE_DATA_DIR || "C:\\Users\\User\\Documents\\Companies\\transfer-pack\\live-data";
const read = (f: string) => JSON.parse(readFileSync(join(DIR, f), "utf8").replace(/^﻿/, ""));
// Files may be a bare array or wrapped ({ _comment, companies: [...] }). Unwrap to the array.
const arr = (x: any, key: string): any[] => {
  if (Array.isArray(x)) return x;
  if (Array.isArray(x?.[key])) return x[key];
  const firstArray = Object.values(x).find((v) => Array.isArray(v));
  return (firstArray as any[]) ?? [];
};

// Pack company key → the live company's display name. Explicit for safety
// (alias matching alone could mis-map). V1 is created fresh.
const KEY_TO_NAME: Record<string, string | null> = {
  DarSpices: "DSC Ltd",
  Cocozuri: "Cocozuri Chocolat",
  MES: "MES Ltd",
  Oracle: "Oracle Consultancy Ltd",
  PES: "PES Ltd",
  Pamoja: "Pamoja Plus",
  TerraGreen: "Terra Green Ltd",
  V1: null, // create
};

const CREATE_PEOPLE = process.argv.includes("--create-people");
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const digits = (s: string | null | undefined) => (s ? s.replace(/[^\d]/g, "") : "");
const realVrn = (vat: string | null | undefined) => (vat && digits(vat).length >= 7 ? vat.trim() : null);
// Treat the local engine's placeholder strings as empty — never write them.
const PLACEHOLDER = /^(todo|n\/a|na|none|null|unknown|tbc|tbd|not registered|not vat-registered.*|not on file|not stated.*|-+)$/i;
const clean = (v: any): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return !s || PLACEHOLDER.test(s) ? null : s;
};
const log: string[] = [];
const L = (s: string) => { log.push(s); console.log(s); };

async function main() {
  const { sb } = await import("@/db/supabase");

  const companiesJson = arr(read("companies.json"), "companies");
  const peopleJson = arr(read("people.json"), "people");
  const factsJson = arr(read("facts.json"), "facts");
  const governance = read("governance.json") as any;
  const risksJson = arr(read("risks.json"), "risks");
  const decisionsJson = arr(read("decisions.json"), "decisions");

  L(`\n=== ${APPLY ? "APPLY" : "DRY RUN"} · reading ${DIR} ===`);

  // ---- Companies: match + build key→id map ----
  const { data: liveCompanies } = await sb.from("companies").select("id,name,tin,vrn,registration_no,code_prefix,email,phone,address,legal_name,authorised_shares,issued_shares");
  const byName = new Map((liveCompanies ?? []).map((c: any) => [norm(c.name), c]));
  const keyToId = new Map<string, number>();

  for (const c of companiesJson) {
    const liveName = KEY_TO_NAME[c.key];
    let live = liveName ? byName.get(norm(liveName)) : null;
    if (!live && liveName === null && c.key === "V1") {
      // Create V1 Intertrade.
      L(`  COMPANY create: V1 Intertrade (${c.legal_name})`);
      if (APPLY) {
        const { data, error } = await sb.from("companies").insert({
          name: "V1 Intertrade", code: "V1", code_prefix: "V1", active: true,
          legal_name: c.legal_name ?? null, tin: c.tin ?? null, registration_no: c.brela_reg_no ?? null,
          vrn: realVrn(c.vat_no), email: c.email ?? null, phone: c.phone ?? null, address: c.address ?? null,
        }).select("id").single();
        if (error) { L(`    ! ${error.message}`); continue; }
        keyToId.set(c.key, data.id as number);
      }
      continue;
    }
    if (!live) { L(`  COMPANY ⚠ no live match for pack key "${c.key}" (${liveName})`); continue; }
    keyToId.set(c.key, live.id);

    // Identifiers are authoritative from the pack; other fields blanks-only.
    const patch: Record<string, unknown> = {};
    const tin = clean(c.tin), reg = clean(c.brela_reg_no), legal = clean(c.legal_name);
    if (tin && norm(tin) !== norm(live.tin ?? "")) patch.tin = tin;
    if (reg && norm(reg) !== norm(live.registration_no ?? "")) patch.registration_no = reg;
    const vrn = realVrn(c.vat_no);
    if (vrn && norm(vrn) !== norm(live.vrn ?? "")) patch.vrn = vrn;
    else if (!vrn && live.vrn && digits(live.vrn).length < 7) patch.vrn = null; // clear garbage (e.g. PES had a name in vrn)
    if (!clean(live.email) && clean(c.email)) patch.email = clean(c.email);
    if (!clean(live.phone) && clean(c.phone)) patch.phone = clean(c.phone);
    if (!clean(live.address) && clean(c.address)) patch.address = clean(c.address);
    if (!clean(live.legal_name) && legal) patch.legal_name = legal;
    if (Object.keys(patch).length) {
      L(`  COMPANY enrich ${live.name}: ${JSON.stringify(patch)}`);
      if (APPLY) { const { error } = await sb.from("companies").update(patch).eq("id", live.id); if (error) L(`    ! ${error.message}`); }
    }
  }

  // ---- People: CONFIDENT match only → enrich blanks-only; never auto-create
  //      (the live table is messy: junk + partial duplicates). Unmatched are
  //      reported for manual handling, or created only with --create-people.
  const { data: livePeople } = await sb.from("people").select("id,name,nationality,passport_no,date_of_birth,role");
  const live = (livePeople ?? []) as any[];
  const tokens = (n: string) => norm(n).split(" ").filter(Boolean);
  // Confident match: exact normalised, else a UNIQUE same-first-AND-last-token live person.
  const findLive = (packName: string): any | null => {
    const n = norm(packName);
    const exact = live.filter((p) => norm(p.name) === n);
    if (exact.length === 1) return exact[0];
    const pt = tokens(packName);
    if (pt.length >= 2) {
      const first = pt[0], last = pt[pt.length - 1];
      const cand = live.filter((p) => { const lt = tokens(p.name); return lt.length >= 2 && lt[0] === first && lt[lt.length - 1] === last; });
      if (cand.length === 1) return cand[0];
    }
    return null;
  };
  let pEnrich = 0; const unmatched: string[] = []; const idByPack = new Map<string, number>();
  for (const p of peopleJson) {
    const m = findLive(p.name);
    const dob = /^\d{4}-\d{2}-\d{2}$/.test(p.dob ?? "") ? p.dob : null;
    if (m) {
      idByPack.set(norm(p.name), m.id);
      const patch: Record<string, unknown> = {};
      if (!clean(m.nationality) && clean(p.nationality)) patch.nationality = clean(p.nationality);
      if (!clean(m.passport_no) && clean(p.passport)) patch.passport_no = clean(p.passport);
      if (!m.date_of_birth && dob) patch.date_of_birth = new Date(dob).toISOString();
      if (!clean(m.role) && clean(p.role)) patch.role = clean(p.role);
      if (Object.keys(patch).length) { pEnrich++; L(`  PERSON enrich ${m.name} ← ${p.name}: ${Object.keys(patch).join(", ")}`); if (APPLY) await sb.from("people").update(patch).eq("id", m.id); }
    } else {
      unmatched.push(p.name);
      if (CREATE_PEOPLE && APPLY) {
        const type = p.category === "Expat" ? "expat" : "local_staff";
        const { data } = await sb.from("people").insert({ name: p.name, person_type: type, active: p.active !== false, nationality: clean(p.nationality), passport_no: clean(p.passport), date_of_birth: dob ? new Date(dob).toISOString() : null, role: clean(p.role) }).select("id").single();
        if (data) idByPack.set(norm(p.name), data.id as number);
      }
    }
  }
  L(`  people: ${pEnrich} enriched · ${unmatched.length} unmatched ${CREATE_PEOPLE ? "(created)" : "(NOT created — pass --create-people to add)"}`);
  if (unmatched.length) L(`    unmatched: ${unmatched.join(", ")}`);
  const personByName = idByPack; // facts use confidently-matched (or created) people only

  // ---- Facts: append all (re-runnable: clear our seed rows first) ----
  if (APPLY) await sb.from("facts").delete().eq("created_by", "seed-live-data");
  let fOk = 0, fSkip = 0;
  for (const f of factsJson) {
    const isCompany = f.entity_type === "company";
    const entityId = isCompany ? keyToId.get(f.entity) : personByName.get(norm(f.entity));
    if (!entityId) { fSkip++; continue; }
    const eff = /^\d{4}-\d{2}-\d{2}$/.test(f.effective_date ?? "") ? f.effective_date : f.recorded;
    fOk++;
    if (APPLY) {
      await sb.from("facts").insert({
        entity_type: f.entity_type, person_id: isCompany ? null : entityId, company_id: isCompany ? entityId : null,
        field: String(f.field).slice(0, 60), value: String(f.value), display: String(f.value).slice(0, 300),
        effective_date: new Date((eff ?? "2026-06-13") + "T00:00:00Z").toISOString(),
        source: f.source ?? null, source_hash: f.source_hash ?? null,
        verified: !!f.verified, verified_at: f.verified ? new Date().toISOString() : null,
        note: f.note || null, created_by: "seed-live-data", created_at: new Date().toISOString(),
      });
    }
  }
  L(`  facts: ${fOk} to load, ${fSkip} skipped (no entity match)`);

  // ---- Governance: cap table / UBO / key persons / signatories / resolutions ----
  if (APPLY) { await sb.from("cap_table").delete().neq("id", -1); await sb.from("beneficial_owners").delete().neq("id", -1); await sb.from("key_persons").delete().neq("id", -1); await sb.from("signatories").delete().neq("id", -1); await sb.from("resolutions").delete().neq("id", -1); }
  let capRows = 0;
  for (const [key, ct] of Object.entries(governance.captable ?? {})) {
    const id = keyToId.get(key); if (!id) continue;
    const c = ct as any;
    if (APPLY) await sb.from("companies").update({ authorised_shares: c.authorised ?? null, issued_shares: c.issued ?? null }).eq("id", id);
    for (const h of c.holders ?? []) { capRows++; if (APPLY) await sb.from("cap_table").insert({ company_id: id, holder: h.holder, shares: h.shares ?? null, pct: h.pct ?? null, holder_type: h.type ?? null }); }
  }
  let uboRows = 0;
  for (const u of governance.ubo ?? []) { uboRows++; if (APPLY) await sb.from("beneficial_owners").insert({ person_name: u.person, interests: u.interests ?? null, flag: u.flag ?? null, complete: !/incomplete|look-through|need/i.test(u.flag ?? "") }); }
  let kpRows = 0;
  for (const k of governance.keyPersons ?? []) { kpRows++; if (APPLY) await sb.from("key_persons").insert({ name: k.name, director_of: k.directorOf ?? null, secretary_of: k.secretaryOf ?? null, shareholder_of: k.shareholderOf ?? null, signatory_of: k.signatoryOf ?? null, risk: k.risk ?? null, note: k.note ?? null }); }
  let sigRows = 0;
  for (const [key, names] of Object.entries(governance.signatories ?? {})) { const id = keyToId.get(key); if (!id) continue; for (const n of names as string[]) { sigRows++; if (APPLY) await sb.from("signatories").insert({ company_id: id, name: n }); } }
  let resRows = 0;
  for (const r of governance.resolutions ?? []) { const id = keyToId.get(r.company); resRows++; if (APPLY) await sb.from("resolutions").insert({ company_id: id ?? null, date: r.date ? new Date(r.date + "T00:00:00Z").toISOString() : null, type: r.type ?? null, summary: r.summary, file: r.file ?? null }); }
  L(`  governance: ${capRows} cap-table, ${uboRows} UBO, ${kpRows} key-persons, ${sigRows} signatories, ${resRows} resolutions`);

  // ---- Risks ----
  if (APPLY) await sb.from("risks").delete().neq("id", -1);
  for (const r of risksJson) {
    if (APPLY) await sb.from("risks").insert({ code: r.id, category: r.category ?? null, title: r.title, description: r.description ?? null, likelihood: r.likelihood ?? null, impact: r.impact ?? null, owner: r.owner ?? null, mitigation: r.mitigation ?? null, status: r.status ?? "Open", linked: r.linked ?? null });
  }
  L(`  risks: ${risksJson.length}`);

  // ---- Decisions ----
  if (APPLY) await sb.from("decisions").delete().neq("id", -1);
  for (const d of decisionsJson) {
    const id = keyToId.get(d.company);
    if (APPLY) await sb.from("decisions").insert({ code: d.id, title: d.title, company_id: id ?? null, type: d.type ?? null, raised_by: d.raisedBy ?? null, due: d.due ? new Date(d.due + "T00:00:00Z").toISOString() : null, status: d.status ?? "Pending", context: d.context ?? null, decision: d.decision || null, decided_on: d.decidedOn ? new Date(d.decidedOn + "T00:00:00Z").toISOString() : null });
  }
  L(`  decisions: ${decisionsJson.length}`);

  L(`\n=== ${APPLY ? "APPLIED" : "DRY RUN COMPLETE — re-run with --apply to write"} ===`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
