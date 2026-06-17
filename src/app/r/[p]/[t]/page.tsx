// Per-person reminder link. WhatsApp's crawler reads the Open-Graph tags below
// (the Aurora summary card + that person's live open/overdue counts + top-3
// overdue), so a pasted reminder renders a rich preview. Real visitors are
// redirected straight to the staff portal. Signed (see lib/wa-card.ts) and Node
// runtime (uses node:crypto + postgres.js).
import type { Metadata } from "next";
import { sb } from "@/db/supabase";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { verifyWaCardToken, waCardImageUrl } from "@/lib/wa-card";
import { appBaseUrl } from "@/lib/app-url";
import { PortalRedirect } from "./redirect";

export const runtime = "nodejs";

type Params = { p: string; t: string };

/** Load the live summary a person's link should advertise. Returns null if the
 *  signature doesn't check out. */
async function summary(params: Params) {
  const personId = Number(params.p);
  if (!Number.isInteger(personId) || personId < 0 || !verifyWaCardToken(personId, decodeURIComponent(params.t))) {
    return null;
  }
  const { data: person } = await sb.from("people").select("id,name").eq("id", personId).maybeSingle();
  const first = (person?.name as string | undefined)?.split(" ")[0] ?? "You";
  const mine = (await getAllTasks()).filter((t) => isOpen(t.status) && t.assigneeIds.includes(personId));
  const overdue = mine.filter((t) => t.daysToDeadline != null && Number(t.daysToDeadline) < 0);
  const top3 = [...overdue]
    .sort((a, b) => Number(a.daysToDeadline) - Number(b.daysToDeadline))
    .slice(0, 3)
    .map((t) => t.actionItem);
  return { personId, first, open: mine.length, overdue: overdue.length, top3 };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const s = await summary(await params);
  const portal = `${appBaseUrl()}/portal`;
  if (!s) {
    return { title: "Oracle Consultancy · Staff portal", openGraph: { url: portal } };
  }
  const title = `${s.open} open · ${s.overdue} overdue — ${s.first}'s tasks`;
  const description = s.top3.length
    ? `Top overdue: ${s.top3.join(" · ")}. Tap to open your staff portal.`
    : "You're all caught up. Tap to open your staff portal.";
  const image = waCardImageUrl(s.personId);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: portal,
      siteName: "Oracle Consultancy",
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ReminderRedirectPage({ params }: { params: Promise<Params> }) {
  await params; // touch params so the route stays dynamic per person
  const portal = `${appBaseUrl()}/portal`;
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", textAlign: "center", color: "#9cc0e8" }}>
      <PortalRedirect to={portal} />
      <p>Opening your staff portal…</p>
      <p>
        <a href={portal} style={{ color: "#4aa3ff" }}>Tap here if it doesn&apos;t open automatically.</a>
      </p>
    </main>
  );
}
