import { NextResponse } from "next/server";
import { addSubscription, removeSubscription, addRecipientSubscription, removeRecipientSubscription } from "@/lib/push";
import { isAdminSession } from "@/lib/admin-auth";
import { getPortalPerson } from "@/lib/portal-auth";
import { personRecipient } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Resolve the push recipient from whichever session is present. */
async function resolveRecipient(): Promise<{ recipient: string; admin: boolean } | null> {
  if (await isAdminSession()) return { recipient: "admin", admin: true };
  const me = await getPortalPerson();
  return me ? { recipient: personRecipient(me.id), admin: false } : null;
}

export async function POST(req: Request) {
  const who = await resolveRecipient();
  if (!who) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  await addRecipientSubscription(who.recipient, { endpoint: sub.endpoint, keys: sub.keys });
  // Keep the owner's legacy blob in sync so existing overdue alerts still fire.
  if (who.admin) await addSubscription({ endpoint: sub.endpoint, keys: sub.keys });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const who = await resolveRecipient();
  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await removeRecipientSubscription(endpoint);
  if (who?.admin) await removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
