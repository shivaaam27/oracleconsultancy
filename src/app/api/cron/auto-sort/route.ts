import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { autoSortInboxAction } from "@/app/inbox/actions";

export const dynamic = "force-dynamic";

// Unattended inbox auto-sort: files confident documents, holds unclear ones in
// Quarantine, bins exact/format duplicates to Trash — so the owner's "drop a
// folder, it sorts itself" workflow happens without anyone pressing a button.
// Rule-based, so it still works when AI is off. Idempotent (only touches pending
// bundles), so a frequent schedule is safe.
export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  // DISABLED (Jul 2026, owner request): no unattended overnight sorting. New files
  // (Dropbox / chat / task attachments) simply wait in the Documents "To Sort" tab;
  // the owner reads them in with the "Sort now" button when they choose to. This
  // keeps the system from moving anything on its own. To restore, reinstate the
  // autoSortInboxAction() call below.
  await recordEvent("cron.auto-sort", "skip", { reason: "disabled — sort manually from Documents › To Sort" });
  return NextResponse.json({ ok: true, skipped: "auto-sort disabled" });
}

// Kept imported for the one-line re-enable above.
void autoSortInboxAction;
void reportError;
