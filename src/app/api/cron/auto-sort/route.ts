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

  try {
    const res = await autoSortInboxAction();
    await recordEvent("cron.auto-sort", res.ok ? "ok" : "error", { ...res });
    return NextResponse.json(res);
  } catch (err) {
    await reportError(err, { route: "cron.auto-sort" });
    await recordEvent("cron.auto-sort", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "Auto-sort run failed." }, { status: 500 });
  }
}
