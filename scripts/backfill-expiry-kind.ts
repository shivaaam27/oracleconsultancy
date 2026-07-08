import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Zero-AI backfill: correct documents already saved as tracked-for-expiry that are
 * actually NON-expiring by their type (bills, control numbers, receipts, invoices,
 * incorporation certs…). Re-derives the type from the corrected catalogue (name +
 * title only — no file downloads, no AI) and sets expiry_kind="no" so deriveDocStatus
 * drops them off the Expiry Watch. Only flips a FLAG — never clears the date — so it's
 * lossless and reversible. Dry-run by default; pass --apply to write.
 *   npx tsx scripts/backfill-expiry-kind.ts            (plan only)
 *   npx tsx scripts/backfill-expiry-kind.ts --apply    (write)
 */
const APPLY = process.argv.includes("--apply");

// PRECISION over recall: only flip documents whose NAME unambiguously reads as a payment
// demand or admin printout that never carries a compliance expiry — bills, control
// numbers, invoices, quotations, registry searches. Deliberately does NOT use the fuzzy
// classifier (which can misfire on a name), so a passport / visa / permit / ID / contract
// is NEVER touched. The forward fixes (deriveDocStatus + two-way intake override) handle
// every new/re-scanned document; this only cleans up the existing bills already on file.
const NON_EXPIRING_NAME = /government bill|govt bill|control number|control no\b|demand note|demand notice|payment bill|bill for payment|assessment notice|namba ya kumbukumbu|gepg|tax invoice|proforma|\binvoice\b|\bquotation\b|company search|brela search|search report/i;

async function run() {
  const { sb } = await import("@/db/supabase");

  const rows: { id: number; title: string | null; file_name: string | null; expiry_kind: string | null; expiry_date: string | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("documents")
      .select("id,title,file_name,expiry_kind,expiry_date")
      .eq("archived", false)
      .neq("intake_state", "trash")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as typeof rows;
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const toFlip: typeof rows = [];
  for (const r of rows) {
    if (r.expiry_kind === "no") continue; // already correct
    // Only relevant if it could currently land on the watch (has a date or is marked yes).
    if (!r.expiry_date && r.expiry_kind !== "yes") continue;
    const name = `${r.title ?? ""} ${r.file_name ?? ""}`;
    if (NON_EXPIRING_NAME.test(name)) toFlip.push(r);
  }

  console.log(`\nScanned ${rows.length} active docs · ${toFlip.length} to mark non-expiring (expiry_kind → "no")`);
  for (const r of toFlip.slice(0, 40)) {
    console.log(`  #${r.id} [was ${r.expiry_kind ?? "null"}, exp=${r.expiry_date?.slice(0, 10) ?? "—"}] ${(r.title ?? r.file_name ?? "").slice(0, 58)}`);
  }
  if (toFlip.length > 40) console.log(`  …and ${toFlip.length - 40} more`);

  if (!APPLY) { console.log("\nDRY RUN — re-run with --apply to write. (Only flips the flag; the date is kept.)"); return; }

  let done = 0;
  for (const r of toFlip) {
    const { error } = await sb.from("documents").update({ expiry_kind: "no", updated_at: new Date().toISOString() }).eq("id", r.id);
    if (!error) done++;
  }
  console.log(`\nApplied: ${done}/${toFlip.length} documents set to non-expiring.`);
}

run().catch((e) => { console.error("BACKFILL FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
