import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin-auth";
import { getPortalPerson } from "@/lib/portal-auth";
import { ADMIN, personParticipant, threadStamp, unreadTotalFor, viewerInThread } from "@/lib/chat";

/* Polling fallback for chat (used when the realtime socket isn't available —
 * no anon key, or a dropped connection). Mirrors /api/portal/sync. Excluded
 * from the admin middleware gate via the `api/portal` matcher exclusion, so it
 * checks BOTH cookie types itself. With ?threadId it returns that thread's
 * stamp; otherwise it returns the viewer's total unread (for the pill badge). */

export async function GET(req: NextRequest) {
  const admin = await isAdminSession();
  let viewer: string | null = null;
  if (admin) viewer = ADMIN;
  else {
    const me = await getPortalPerson();
    if (me) viewer = personParticipant(me.id);
  }
  if (!viewer) return NextResponse.json({ error: "no" }, { status: 403 });

  const threadIdParam = req.nextUrl.searchParams.get("threadId");
  if (threadIdParam) {
    const threadId = Number(threadIdParam);
    if (!Number.isFinite(threadId) || !(await viewerInThread(threadId, viewer))) {
      return NextResponse.json({ error: "no" }, { status: 403 });
    }
    const stamp = await threadStamp(threadId);
    return NextResponse.json({ stamp }, { headers: { "cache-control": "no-store" } });
  }

  const unread = await unreadTotalFor(viewer);
  return NextResponse.json({ unread }, { headers: { "cache-control": "no-store" } });
}
