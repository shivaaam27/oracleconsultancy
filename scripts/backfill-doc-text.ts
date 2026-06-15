// DR1 — read the full body text out of every stored document and index it, so
// ORI can search INSIDE files (clauses, amounts), not just by their labels.
// Typed PDFs / Word / Excel yield text now (free); scans yield none until the OCR
// phase (DR2). Re-runnable — documents that already have text are skipped.
//   npm run db:doc-text-backfill

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  // Dynamic import AFTER dotenv (app modules read env at import time).
  const { backfillDocumentText } = await import("@/app/documents/actions");
  console.log("Reading full text from stored documents (typed PDFs/Office now; scans wait for OCR)…");
  const { done, skipped, none } = await backfillDocumentText();
  console.log(`\nDone. ${done} got body text, ${skipped} already had it, ${none} had no readable text (scans / no file).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
