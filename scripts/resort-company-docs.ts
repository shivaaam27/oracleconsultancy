/**
 * resort-company-docs.ts — re-file an already-uploaded company's documents through
 * the doc-catalogue brain: fix category/shelf/type, trust the filename's expiry,
 * knock out `-OLD` copies to Trash, route person documents to the person, and
 * re-link company compliance DETERMINISTICALLY (type → requirement) so a business
 * licence can never verify "VAT" again.
 *
 *   npx tsx scripts/resort-company-docs.ts "DSC Ltd"          # dry run
 *   npx tsx scripts/resort-company-docs.ts "DSC Ltd" --yes    # apply
 */
import { config } from "dotenv"; config({ path: ".env.local" });

const NAME = process.argv[2] || "DSC Ltd";
const APPLY = process.argv.includes("--yes");

const nameTokens = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, " ").split(/\s+/).filter((t) => t.length >= 3);

async function run() {
  const { sb } = await import("@/db/supabase");
  const { deriveFiling } = await import("@/lib/doc-catalog");
  const { buildDocTitle } = await import("@/lib/documents-shared");

  const { data: co } = await sb.from("companies").select("id,file_prefix").eq("name", NAME).maybeSingle();
  if (!co) { console.log("company not found"); return; }
  const companyId = co.id as number;
  const prefix = (co.file_prefix as string | null) ?? null;

  const { data: people } = await sb.from("people").select("id,name").eq("active", true);
  const peopleList = (people ?? []).map((p) => ({ id: p.id as number, name: p.name as string, tokens: nameTokens(p.name as string) }));

  const { data: docs } = await sb.from("documents").select("id,file_name,title,category,doc_type,expiry_date,person_id,intake_state,extracted_text").eq("company_id", companyId);
  const rows = docs ?? [];
  console.log(`${NAME}: ${rows.length} company docs · ${APPLY ? "APPLYING" : "DRY RUN"}\n`);

  let trashed = 0, movedToPerson = 0, recategorised = 0, expiryFixed = 0;

  for (const d of rows) {
    const f = deriveFiling(d.file_name as string, d.title as string, String(d.extracted_text ?? "").slice(0, 300));
    if (!f.typeKey) { console.log(`#${d.id} ${String(d.file_name).slice(0, 40)} — UNCLASSIFIED (left as-is)`); continue; }

    const patch: Record<string, unknown> = {};
    // Category / type from the catalogue
    if (f.category && f.category !== d.category) { patch.category = f.category; recategorised++; }
    if (f.typeLabel && f.typeLabel !== d.doc_type) patch.doc_type = f.typeLabel;
    // Trust the filename expiry
    const curExp = d.expiry_date ? new Date(d.expiry_date as string).toISOString().slice(0, 10) : null;
    if (f.expiry && f.expiry !== curExp) { patch.expiry_date = new Date(`${f.expiry}T00:00:00Z`).toISOString(); expiryFixed++; }
    if (f.expires) patch.expiry_kind = "yes";
    // Route person documents to the person (match a name token in the filename)
    let owner = `company ${NAME}`;
    if (f.ownerType === "person") {
      const nm = nameTokens(`${d.file_name} ${d.title}`);
      const match = peopleList.find((p) => p.tokens.filter((t) => nm.includes(t)).length >= 2);
      if (match) { patch.person_id = match.id; patch.company_id = null; owner = `person ${match.name}`; movedToPerson++; }
    } else if (f.ownerType === "company" && d.person_id) {
      // A company document that was wrongly attributed to a person on the first
      // (bad) upload — put it back on the company.
      patch.person_id = null; patch.company_id = companyId;
    }
    // Rebuild the title in house format from the reliable type
    const newTitle = buildDocTitle({ prefix, owner: null, type: f.typeLabel, ref: f.ref, expiry: f.expiry });
    if (newTitle && newTitle !== "Document" && newTitle !== d.title) patch.title = newTitle;

    if (f.isOld && d.intake_state !== "trash") {
      console.log(`#${d.id} ${String(f.typeLabel)} — KNOCK OUT (-OLD) → Trash`);
      if (APPLY) await sb.from("documents").update({ intake_state: "trash", archived: true, trashed_at: new Date().toISOString(), title: patch.title ?? d.title }).eq("id", d.id);
      trashed++;
      continue;
    }

    console.log(`#${d.id} → ${f.typeLabel} · ${f.shelf} · ${owner}${f.expiry ? ` · exp ${f.expiry}` : ""}`);
    if (APPLY && Object.keys(patch).length) await sb.from("documents").update(patch).eq("id", d.id);
  }

  // ── Deterministic compliance re-link ──────────────────────────────────────
  console.log("\n── Compliance (type → requirement) ──");
  const { data: reqs } = await sb.from("company_requirements").select("id,source_key,label").eq("company_id", companyId);
  const { data: filedDocs } = await sb.from("documents").select("id,file_name,title,expiry_date,extracted_text").eq("company_id", companyId).eq("intake_state", "filed");
  const nowMs = Date.now();
  for (const req of reqs ?? []) {
    const key = req.source_key as string;
    // Best filed, non-expired doc whose catalogue type satisfies THIS requirement.
    const match = (filedDocs ?? []).map((d) => ({ d, f: deriveFiling(d.file_name as string, d.title as string, String(d.extracted_text ?? "").slice(0, 200)) }))
      .find(({ d, f }) => {
        if (f.companyReqKey !== key || f.isOld) return false;
        // Use the RELIABLE filename expiry, not the stale mis-read DB date.
        const effExp = f.expiry ? new Date(`${f.expiry}T00:00:00Z`).getTime() : (d.expiry_date ? new Date(d.expiry_date as string).getTime() : null);
        return effExp === null || effExp > nowMs;
      });
    if (match) {
      console.log(`  ✓ ${req.label}  ←  #${match.d.id} ${match.f.typeLabel}`);
      if (APPLY) await sb.from("company_requirements").update({ status: "received", document_id: match.d.id }).eq("id", req.id);
    } else {
      if (APPLY) await sb.from("company_requirements").update({ status: "missing", document_id: null }).eq("id", req.id);
    }
  }

  console.log(`\nSummary: ${recategorised} recategorised · ${expiryFixed} expiry-fixed · ${movedToPerson} → person · ${trashed} knocked out`);
  if (!APPLY) console.log("DRY RUN — re-run with --yes to apply.");
}
run().catch((e) => console.log("FAIL", e instanceof Error ? e.message : e));
