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

    const count = (deleted ?? []).length;
    await recordEvent("cron.cleanup", "ok", { undoTokensDeleted: count });
    await recordEvent("heartbeat", "ok");
    return NextResponse.json({ ok: true, undoTokensDeleted: count });
  } catch (err) {
    await reportError(err, { route: "cron.cleanup" });
    await recordEvent("cron.cleanup", "error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, message: "Cleanup run failed." }, { status: 500 });
  }
}
