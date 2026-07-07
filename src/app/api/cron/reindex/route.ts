// Nightly semantic-search freshness sweep (S6). Re-indexes changed items and
// removes stale/orphan vectors. Cheap when nothing changed (content_hash skip).
// No-ops when semantic search is off. Scheduled in vercel.json.

import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent, lastSuccessfulEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { getAppSettings } from "@/lib/settings";
import { reindexAll } from "@/lib/embeddings-reindex";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// EGRESS GUARD — incremental (watermark) sweep. The nightly catch-all only exists
// to heal MISSED per-write reindexEntity() hook fires; those hooks keep the index
// fresh in the common case. So before paying for a full 12-table re-scan, probe the
// busiest tables for any row changed since our last successful run. If nothing has
// moved, skip the whole sweep (no PostgREST reads, no re-embed). `?full=1` forces it.
const WATERMARK_TABLES = [
  "tasks", "documents", "meetings", "people", "companies",
  "letters", "vendors", "assets", "pipeline", "commitments",
] as const;

/** True if any watermark table has a row with updated_at > since. One 1-row probe
 *  per table (cheap) vs. the full paged scan reindexAll() does. Fails OPEN (returns
 *  true) on any error so a probe hiccup never skips a real sweep. */
async function anyChangesSince(since: Date): Promise<boolean> {
  const iso = since.toISOString();
  for (const table of WATERMARK_TABLES) {
    try {
      const { data, error } = await sb
        .from(table)
        .select("updated_at")
        .gt("updated_at", iso)
        .limit(1)
        .maybeSingle();
      if (error) return true; // fail open — don't skip on a probe error
      if (data) return true;
    } catch {
      return true; // fail open
    }
  }
  return false;
}

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    const { semanticSearch } = await getAppSettings();
    if (!semanticSearch) {
      return NextResponse.json({ ok: true, skipped: "semantic search off" });
    }

    // Watermark: skip the full sweep when nothing changed since our last OK run.
    // First run ever (no watermark) always sweeps. `?full=1` overrides the guard.
    const force = new URL(req.url).searchParams.get("full") === "1";
    const since = force ? null : await lastSuccessfulEvent("cron.reindex");
    if (since && !(await anyChangesSince(since))) {
      await recordEvent("cron.reindex", "ok", { checked: 0, orphansRemoved: 0, skipped: "no changes" });
      return NextResponse.json({ ok: true, checked: 0, orphansRemoved: 0, skipped: "no changes since last run" });
    }

    const { checked, orphansRemoved } = await reindexAll();
    await recordEvent("cron.reindex", "ok", { checked, orphansRemoved });
    return NextResponse.json({ ok: true, checked, orphansRemoved });
  } catch (err) {
    await reportError(err, { route: "cron.reindex" });
    await recordEvent("cron.reindex", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "Reindex run failed." }, { status: 500 });
  }
}
