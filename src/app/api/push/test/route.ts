import { NextResponse } from "next/server";
import { sendToRecipient, configurePush } from "@/lib/messaging/push";
import { isAdminSession } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  /* ⚠️ THIS ROUTE HAD NO AUTHENTICATION AT ALL until 20 Aug 2026, and it sits
   * OUTSIDE the admin gate (src/proxy.ts excludes api/push, because the
   * subscribe route serves staff too and checks its own cookie). So anyone on
   * the internet could POST here and fire a notification at EVERY subscribed
   * device — the owner's and every member of staff's — as often as they liked.
   *
   * Owner-only: it sends to the owner's own devices, and its one caller is
   * Settings → Notifications. */
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!configurePush()) {
    return NextResponse.json({ error: "Push not configured (missing VAPID keys)" }, { status: 503 });
  }
  // The owner's devices as REAL alerts reach them — the push_subscriptions
  // table. The test used to go to the old settings list, which still held
  // devices real alerts never reach, so it said "sent to 4" while the iPhones
  // got nothing (audit 24 Sept 2026).
  const sent = await sendToRecipient("admin", {
    title: "Oracle Consultancy test alert",
    body: "Notifications are working. You'll be alerted about overdue and escalated tasks.",
    url: "/",
    tag: "cos-test",
  });
  if (sent === 0) {
    return NextResponse.json({ error: "No device received it. Press \"Turn on here\" on each device you want alerts on." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, sent });
}
