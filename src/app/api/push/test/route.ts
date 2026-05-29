import { NextResponse } from "next/server";
import { sendToAll, configurePush, getSubscriptions } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!configurePush()) {
    return NextResponse.json({ error: "Push not configured (missing VAPID keys)" }, { status: 503 });
  }
  const subs = await getSubscriptions();
  if (subs.length === 0) {
    return NextResponse.json({ error: "No devices subscribed yet" }, { status: 400 });
  }
  const res = await sendToAll({
    title: "COS test alert",
    body: "Notifications are working. You'll be alerted about overdue and escalated tasks.",
    url: "/",
    tag: "cos-test",
  });
  return NextResponse.json({ ok: true, ...res });
}
