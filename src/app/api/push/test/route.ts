import { NextResponse } from "next/server";
import { sendToAll, configurePush, getSubscriptions } from "@/lib/push";
import { isAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  /* ⚠️ THIS ROUTE HAD NO AUTHENTICATION AT ALL until 20 Aug 2026, and it sits
   * OUTSIDE the admin gate (src/proxy.ts excludes api/push, because the
   * subscribe route serves staff too and checks its own cookie). So anyone on
   * the internet could POST here and fire a notification at EVERY subscribed
   * device — the owner's and every member of staff's — as often as they liked.
   *
   * Owner-only, not "admin or staff": sendToAll goes to everybody's devices, so
   * a member of staff testing their own notifications would buzz the whole
   * company. Its one caller is Settings → Notifications. */
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!configurePush()) {
    return NextResponse.json({ error: "Push not configured (missing VAPID keys)" }, { status: 503 });
  }
  const subs = await getSubscriptions();
  if (subs.length === 0) {
    return NextResponse.json({ error: "No devices subscribed yet" }, { status: 400 });
  }
  const res = await sendToAll({
    title: "Oracle Consultancy test alert",
    body: "Notifications are working. You'll be alerted about overdue and escalated tasks.",
    url: "/",
    tag: "cos-test",
  });
  // Surface delivery failures so the UI can explain why a device got nothing.
  if (res.sent === 0 && res.errors.length > 0) {
    return NextResponse.json(
      { error: `Delivery failed: ${res.errors.map((e) => `${e.host} (${e.code ?? "?"})`).join(", ")}`, ...res },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, ...res });
}
