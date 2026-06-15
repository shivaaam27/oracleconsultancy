// Nightly semantic-search freshness sweep (S6). Re-indexes changed items and
// removes stale/orphan vectors. Cheap when nothing changed (content_hash skip).
// No-ops when semantic search is off. Scheduled in vercel.json.

import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { getAppSettings } from "@/lib/settings";
import { reindexAll } from "@/lib/embeddings-reindex";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    const { semanticSearch } = await getAppSettings();
    if (!semanticSearch) {
      return NextResponse.json({ ok: true, skipped: "semantic search off" });
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
