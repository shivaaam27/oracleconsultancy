// S0 — semantic-search evaluation harness.
//
// Runs each query in eval/search-golden.json through the SAME hybrid search Ask
// COS uses, and reports Recall@k + MRR so we can prove each upgrade phase helps
// (and doesn't regress — especially on the non-English queries). Run:
//   npm run eval:search
// Requires semantic search to be ON and backfilled.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
// hybridSearch is imported lazily inside main() — app modules read env at import
// time, but static ESM imports run before dotenv config() above.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

type Case = { query: string; expect: string[] };
const K = 10;

async function main() {
  const { hybridSearch } = await import("@/lib/embeddings");
  const parsed = JSON.parse(readFileSync("eval/search-golden.json", "utf8")) as { cases: Case[] };
  const cases = parsed.cases ?? [];
  if (!cases.length) { console.log("No cases in eval/search-golden.json — add some."); process.exit(0); }

  // Resolve task source-ids to their codes for nicer labels + matching.
  const { data: tasks } = await sb.from("tasks").select("id,code");
  const codeById = new Map((tasks ?? []).map((t) => [t.id as number, t.code as string]));

  let recallHits = 0, mrrSum = 0;
  for (const c of cases) {
    const hits = await hybridSearch(c.query, { limit: K });
    const labelled = hits.map((h) => ({
      type: h.sourceType,
      label: h.sourceType === "task" ? codeById.get(h.sourceId) ?? `task#${h.sourceId}` : `${h.sourceType}#${h.sourceId}`,
      content: h.content ?? "",
    }));
    const exp = c.expect.map((e) => e.toLowerCase());
    let rank = -1;
    for (let i = 0; i < labelled.length; i++) {
      const hay = `${labelled[i].label} ${labelled[i].content}`.toLowerCase();
      if (exp.some((e) => hay.includes(e))) { rank = i + 1; break; }
    }
    if (rank > 0) { recallHits++; mrrSum += 1 / rank; }
    console.log(`\nQ: ${c.query}`);
    console.log(`   expect [${c.expect.join(" | ")}] -> ${rank > 0 ? `HIT @${rank}` : "MISS"}`);
    labelled.slice(0, 5).forEach((l, i) => console.log(`   ${i + 1}. [${l.type}] ${l.label} — ${l.content.slice(0, 60).replace(/\s+/g, " ")}`));
  }

  const n = cases.length;
  console.log(`\n==== Recall@${K}: ${((recallHits / n) * 100).toFixed(0)}% (${recallHits}/${n})   MRR: ${(mrrSum / n).toFixed(3)} ====`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
