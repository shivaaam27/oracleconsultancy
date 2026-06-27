// Per-person reminder link. Two jobs:
//   1. WhatsApp's crawler reads the Open-Graph tags (the summary card + that
//      person's live open/overdue counts + top overdue) so a pasted reminder
//      renders a rich preview.
//   2. A real visitor sees a branded light-Aurora landing card (ReminderCard) —
//      server-rendered for an instant paint, then kept current client-side — with
//      a big "Open your tasks" button through to the staff portal.
// Public but HMAC-signed (see lib/wa-card.ts); excluded from the admin gate in
// src/proxy.ts. Node runtime (uses node:crypto + postgres.js).
import type { Metadata } from "next";
import { verifyWaCardToken, waCardImageUrl, sanitizeFrom } from "@/lib/wa-card";
import { loadWaSummary } from "@/lib/wa-summary";
import { appBaseUrl } from "@/lib/app-url";
import { ReminderCard } from "./reminder-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // live, per-person counts — never cache

type Params = { p: string; t: string };
// `from` is now OPTIONAL/back-compat only: new reminder links no longer carry it
// (the sender label lives in the message text). Already-sent links may still pass it.
type Search = { from?: string };

/** Validate the signature and resolve { personId, sig } (sig normalised). */
function verify(params: Params): { personId: number; sig: string } | null {
  const personId = Number(params.p);
  const sig = decodeURIComponent(params.t);
  if (!Number.isInteger(personId) || personId < 0 || !verifyWaCardToken(personId, sig)) return null;
  return { personId, sig };
}

export async function generateMetadata(
  { params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> },
): Promise<Metadata> {
  const v = verify(await params);
  const portal = `${appBaseUrl()}/portal`;
  if (!v) return { title: "Oracle Consultancy · Staff portal", openGraph: { url: portal } };

  const from = sanitizeFrom((await searchParams).from);
  const s = await loadWaSummary(v.personId);
  const title = `${s.open} open · ${s.overdue} overdue — ${s.first}'s tasks`;
  const description = s.top.length
    ? `Top overdue: ${s.top.slice(0, 3).map((t) => t.title).join(" · ")}. Tap to open your staff portal.`
    : "You're all caught up. Tap to open your staff portal.";
  const image = waCardImageUrl(v.personId, from);
  return {
    title,
    description,
    openGraph: { title, description, url: portal, siteName: "Oracle Consultancy", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ReminderLandingPage(
  { params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> },
) {
  const v = verify(await params);
  const portal = `${appBaseUrl()}/portal`;
  const logo = `${appBaseUrl()}/icon-512.png`;
  const from = sanitizeFrom((await searchParams).from);

  // Invalid/expired link → a friendly fallback card (no per-person data, no refresh).
  if (!v) {
    return (
      <ReminderCard
        initial={{ first: "You", open: 0, overdue: 0, top: [], notices: [] }}
        personId={0}
        sig=""
        portalUrl={portal}
        logoUrl={logo}
      />
    );
  }

  const initial = await loadWaSummary(v.personId);
  return <ReminderCard initial={initial} personId={v.personId} sig={v.sig} from={from} portalUrl={portal} logoUrl={logo} />;
}
