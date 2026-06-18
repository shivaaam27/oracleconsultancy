import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin-auth";
import { getPortalPerson } from "@/lib/portal-auth";
import {
  listNotifications,
  unreadCount,
  markAllRead,
  deleteNotification,
  deleteAllNotifications,
  personRecipient,
} from "@/lib/notifications";

/* The bell's data endpoint, for BOTH the admin owner and portal users.
 * Resolves the recipient from whichever session is present. Excluded from
 * the admin middleware gate (see src/middleware.ts). */

async function resolveRecipient(): Promise<string | null> {
  if (await isAdminSession()) return "admin";
  const me = await getPortalPerson();
  return me ? personRecipient(me.id) : null;
}

export async function GET() {
  const recipient = await resolveRecipient();
  if (!recipient) return NextResponse.json({ count: 0, items: [] });
  const [count, items] = await Promise.all([unreadCount(recipient), listNotifications(recipient)]);
  return NextResponse.json({ count, items }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const recipient = await resolveRecipient();
  if (!recipient) return NextResponse.json({ ok: false }, { status: 401 });
  const action = req.nextUrl.searchParams.get("action");
  if (action === "read") {
    await markAllRead(recipient);
  } else if (action === "clear") {
    await deleteAllNotifications(recipient);
  } else if (action === "dismiss") {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (Number.isFinite(id)) await deleteNotification(recipient, id);
  }
  return NextResponse.json({ ok: true });
}
