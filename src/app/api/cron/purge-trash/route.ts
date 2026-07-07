// /api/cron/purge-trash — hard-delete documents that have sat in Trash for more
// than 30 days. Trash is a 30-day grace bin: a wrongly-trashed doc can be restored
// within the window; after it, the row + its stored file + search vectors are gone
// for good (deleteDocumentForever). This is Tier-3 (delete) but SAFE by design — it
// only ever touches rows already trashed by the owner/intake and aged past the grace
// period, never live library docs. Batch-bounded + fail-open: one bad row is skipped,
// a whole-run failure logs and 200s so it never wedges the cron. DORMANT until
// scheduled — invoke with the cron secret.

import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { sb } from "@/db/supabase";
import { deleteDocumentForever } from "@/lib/documents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRACE_DAYS = 30;
const MAX_PER_RUN = 200; // batch bound — the next run mops up the rest

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  const cutoff = new Date(Date.now() - GRACE_DAYS * 86_400_000).toISOString();
  let purged = 0, failed = 0, eligible = 0;

  try {
    // Only rows still in the trash bin, trashed before the cutoff. Both guards so a
    // restored-then-cleared row (trashed_at set but intake_state moved on) is spared.
    const { data } = await sb
      .from("documents")
      .select("id")
      .eq("intake_state", "trash")
      .not("trashed_at", "is", null)
      .lte("trashed_at", cutoff)
      .order("trashed_at", { ascending: true })
      .limit(MAX_PER_RUN);

    const ids = ((data ?? []) as { id: number }[]).map((r) => r.id);
    eligible = ids.length;

    for (const id of ids) {
      try {
        await deleteDocumentForever(id);
        purged++;
      } catch (e) {
        failed++;
        await reportError(e, { route: "cron.purge-trash", step: "deleteDocumentForever", id });
      }
    }

    await recordEvent("cron.purge-trash", "ok", { graceDays: GRACE_DAYS, eligible, purged, failed });
    return NextResponse.json({ ok: true, graceDays: GRACE_DAYS, eligible, purged, failed });
  } catch (err) {
    await reportError(err, { route: "cron.purge-trash" });
    await recordEvent("cron.purge-trash", "error", { message: err instanceof Error ? err.message : String(err), purged, failed });
    // Fail-open: never surface a 500 that could wedge the scheduler.
    return NextResponse.json({ ok: true, purged, failed, note: "purge run errored — logged" });
  }
}
