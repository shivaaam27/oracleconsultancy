// /api/activity/ping — records an app "open" for engagement analytics (Phase 3).
// Called once on load by the admin + portal shells. Dedups to at most one "open"
// per identity per hour. Owner-only analytics; the event itself carries no PII
// beyond who + when + path.

import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getPortalPerson } from "@/lib/portal-auth";
import { isAdminSession } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-telemetry";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const path = (await req.json().catch(() => ({})))?.path as string | undefined;

    let who: string | null = null;
    let personId: number | null = null;
    const person = await getPortalPerson().catch(() => null);
    if (person) { who = `person:${person.id}`; personId = person.id; }
    else if (await isAdminSession()) who = "admin";
    if (!who) return NextResponse.json({ ok: false }, { status: 401 });

    // Dedup: skip if we already logged an open for this identity in the last hour.
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await sb.from("activity_events")
      .select("id", { count: "exact", head: true })
      .eq("who", who).eq("kind", "open").gte("at", hourAgo);
    if (!count) await logActivity({ who, personId, kind: "open", path: path ?? null });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
