import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalPill } from "@/components/portal-pill";
import { PortalSessionKeeper, PortalSignOut } from "@/components/portal-session";
import { PageTransition } from "@/components/page-transition";
import { NotificationBell } from "@/components/notification-bell";
import { PortalSearch, PortalSearchTrigger } from "@/components/portal-search";
import { PortalInstallPrompt } from "@/components/portal-install-prompt";
import { PortalNotifyPrompt } from "@/components/portal-notify-prompt";
import { AnnouncementTakeover } from "@/components/announcement-takeover";
import { getPortalPerson } from "@/lib/portal-auth";
import { portalCapabilities } from "@/lib/portal-capabilities";
import { getPersonAudienceAttrs, takeoverFeedForPerson } from "@/lib/announcements";
import { audienceForRole, unseenToursFor } from "@/lib/tours";
import { TourRunner } from "@/components/tour-guide";
import { portalMarkTourSeen, portalGetTour } from "../tour-actions";

// Staff who install from the portal get a portal-scoped app: portal start_url
// and portal shortcuts (My tasks / Messages / My profile) instead of the admin
// ones. Overrides the root manifest for /portal/(app) routes only.
export const metadata: Metadata = {
  manifest: "/portal.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Oracle Staff" },
};

/* Guarded shell for every staff-portal page. No admin chrome here — the
 * portal has its own minimal header + its own bottom pill (PortalPill);
 * the global admin pill/assistant hide themselves on /portal routes.
 *
 * The once-a-day attendance check-in lives on the home page only (not here) —
 * so it can't pop over the director board or run a query on every navigation. */

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  // Urgent "takeover" announcements block the portal until acknowledged.
  // This runs on every portal navigation and sits ABOVE the page error
  // boundary, so a transient DB hiccup here would blank the whole portal. Guard
  // it: a failed lookup just means "no takeovers right now", never a crash.
  let takeovers: Awaited<ReturnType<typeof takeoverFeedForPerson>> = [];
  try {
    const attrs = await getPersonAudienceAttrs(me.id);
    takeovers = attrs ? await takeoverFeedForPerson(attrs) : [];
  } catch {
    takeovers = [];
  }

  // Unseen guided tours for this person (first-run walkthrough / feature
  // spotlights). Best-effort and NON-essential — a failed lookup here must never
  // blank the whole portal shell, so guard it (mirrors the takeover guard above).
  let tours: Awaited<ReturnType<typeof unseenToursFor>> = [];
  try {
    tours = await unseenToursFor(audienceForRole(me.portalRole), me.id);
  } catch {
    tours = [];
  }

  // Everyone gets the room on a large screen (mobile/tablet keep the focused
  // max-w-3xl). Directors stay widest for their two-column board.
  const wide = me.portalRole === "director";

  return (
    <div className={`flex flex-col gap-5 pb-28 md:pb-32 mx-auto ${wide ? "max-w-5xl" : "max-w-3xl lg:max-w-5xl"}`}>
      <header className="flex items-center justify-between gap-3 print-hidden">
        {/* Bell sits top-LEFT, deliberately far from Sign out (top-right) so it
            can't be mis-tapped. */}
        <div className="flex min-w-0 items-center gap-2.5">
          <NotificationBell to="/portal/task" align="left" />
          <PortalSearchTrigger />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted">
              Oracle Consultancy · {me.portalRole === "manager" ? "Manager portal" : me.portalRole === "hr" ? "Admin portal" : me.portalRole === "director" ? "Director board" : "Staff portal"}
            </p>
            <p className="truncate text-sm font-semibold">{me.name}</p>
          </div>
        </div>
        <PortalSignOut />
      </header>
      {/* Cache a durable remember token so an installed PWA survives app-kill. */}
      <PortalSessionKeeper />
      <PortalInstallPrompt />
      <PortalNotifyPrompt />
      {/* Scoped portal search overlay — mounted once so it persists across
          navigation. Opens on ⌘K / Ctrl+K / Ctrl+Space or the header trigger. */}
      <PortalSearch />
      <PageTransition>{children}</PageTransition>
      <PortalPill canCreate={portalCapabilities(me.portalRole).canCreate} role={me.portalRole} />
      {takeovers.length > 0 && <AnnouncementTakeover items={takeovers} />}
      <TourRunner tours={tours} onSeen={portalMarkTourSeen} fetchReplay={portalGetTour} />
    </div>
  );
}
