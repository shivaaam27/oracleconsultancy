import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    const nowIso = new Date().toISOString();
    const { data: deleted, error } = await sb
      .from("undo_tokens")
      .delete()
      .lt("expires_at", nowIso)
      .select("id");
    if (error) throw new Error(error.message);

    // Spent MCP sign-in codes (stage 3). They live for a minute and are single-use,
    // so anything past its expiry is dead weight — but it is dead weight that grows
    // by one row per connection attempt forever if nobody sweeps it.
    let codesDeleted = 0;
    try {
      const { data: codes } = await sb
        .from("mcp_oauth_codes")
        .delete()
        .lt("expires_at", nowIso)
        .select("id");
      codesDeleted = (codes ?? []).length;
    } catch { /* the sweep is housekeeping — never fail the run over it */ }

    // Connections whose refresh token has also expired: the grant is finished and
    // cannot be revived. Revoked rows are KEPT — they are the record of what was
    // once connected, which is worth more than the space.
    let grantsDeleted = 0;
    try {
      const { data: grants } = await sb
        .from("mcp_oauth_tokens")
        .delete()
        .lt("refresh_expires_at", nowIso)
        .select("id");
      grantsDeleted = (grants ?? []).length;
    } catch { /* ditto */ }

    const count = (deleted ?? []).length;
    await recordEvent("cron.cleanup", "ok", { undoTokensDeleted: count, codesDeleted, grantsDeleted });
    await recordEvent("heartbeat", "ok");
    return NextResponse.json({ ok: true, undoTokensDeleted: count, codesDeleted, grantsDeleted });
  } catch (err) {
    await reportError(err, { route: "cron.cleanup" });
    await recordEvent("cron.cleanup", "error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, message: "Cleanup run failed." }, { status: 500 });
  }
}
