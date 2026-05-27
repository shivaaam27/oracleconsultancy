import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { lt } from "drizzle-orm";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    const now = new Date();
    const deleted = await db
      .delete(schema.undoTokens)
      .where(lt(schema.undoTokens.expiresAt, now))
      .returning({ id: schema.undoTokens.id });

    await recordEvent("cron.cleanup", "ok", { undoTokensDeleted: deleted.length });
    await recordEvent("heartbeat", "ok");
    return NextResponse.json({ ok: true, undoTokensDeleted: deleted.length });
  } catch (err) {
    await reportError(err, { route: "cron.cleanup" });
    await recordEvent("cron.cleanup", "error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, message: "Cleanup run failed." }, { status: 500 });
  }
}
