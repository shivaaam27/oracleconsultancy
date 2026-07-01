import { config } from "dotenv"; config({ path: ".env.local" });
async function run(){
  const { backfillDocumentText } = await import("@/app/documents/actions");
  console.log("[backfill] starting — reading + indexing all un-read documents…");
  const t0 = Date.now();
  const res = await backfillDocumentText();
  console.log(`[backfill] done in ${Math.round((Date.now()-t0)/1000)}s — read(done)=${res.done} alreadyDone(skip)=${res.skipped} unreadable(none)=${res.none}`);
  try { const { disposeOcr } = await import("@/lib/ocr-engines"); await disposeOcr(); } catch {}
}
run().catch(e=>console.log("[backfill] FAIL "+e.message));
