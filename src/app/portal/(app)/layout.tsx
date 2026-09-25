import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { usesStudio } from "@/lib/viewer";
import { studioPathForDirector, isStaffLikeRole } from "@/lib/director-routes";
import { StaffShellServer } from "@/components/studio/staff-shell-server";
import { StudioShellServer } from "@/components/studio/shell-server";
import { PortalSessionKeeper } from "@/components/portal-session";
import { PortalSearch } from "@/components/portal-search";
import { PortalCommand } from "@/components/portal-command";
import { PortalInstallPrompt } from "@/components/portal-install-prompt";
import { PortalNotifyPrompt } from "@/components/portal-notify-prompt";
import { AnnouncementTakeover } from "@/components/announcement-takeover";
import { getPortalPerson } from "@/lib/portal-auth";
import { takeoverFeedForPersonId } from "@/lib/announcements";

// Staff who install from the portal get a portal-scoped app: portal start_url
// and portal shortcuts (My tasks / Messages / My profile) instead of the admin
// ones. Overrides the root manifest for /portal/(app) routes only.
export const metadata: Metadata = {
  manifest: "/portal.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Oracle Staff" },
};

/* Guarded shell for every staff-portal page. Every page under it is Studio
 * (26 Sept 2026): a member of staff or the receptionist wears the staff Studio
 * footer (StaffShellServer), a director or manager the shared Studio footer
 * (StudioShellServer) on the two portal pages they still use, Profile and
 * Cleaning. The old rail, header and pill were deleted with the last pages
 * that used them (/portal/outbox and /portal/insights). The owner's own
 * drawers and assistant hide themselves on /portal routes.
 *
 * The once-a-day attendance check-in lives on the home page only (not here) —
 * so it cannot run a query on every navigation. */

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  // A director or manager uses the owner's Studio screens: send them on HERE,
  // before anything paints, from any portal address that has a Studio twin.
  const at = (await headers()).get("x-cos-path");
  const [atPath, atSearch = ""] = (at ?? "").split("?");
  if (await usesStudio(me)) {
    const to = at ? studioPathForDirector(atPath, atSearch) : null;
    if (to) redirect(to);
  }

  // Urgent "takeover" announcements block the portal until acknowledged. The
  // lookup is best-effort and NON-essential, and it sits ABOVE the page error
  // boundary, so a transient DB hiccup here would blank the whole portal; a
  // failed lookup just means "nothing right now", never a crash.
  let takeovers: Awaited<ReturnType<typeof takeoverFeedForPersonId>> = [];
  try {
    // Cached per request — a page underneath that shows the feed reuses it.
    takeovers = await takeoverFeedForPersonId(me.id);
  } catch {
    takeovers = [];
  }

  return (
    <div className="flex flex-col">
      {/* Cache a durable remember token so an installed PWA survives app-kill. */}
      <PortalSessionKeeper />
      <PortalInstallPrompt />
      <PortalNotifyPrompt />
      {/* Scoped command surface — mounted once so it persists across navigation.
          Opens on ⌘K / Ctrl+K / Ctrl+Space. ORI (search + ask + optional act)
          when the person has oriAsk; otherwise the plain scoped search. Exactly
          one is mounted so the hotkey never double-fires. */}
      {me.caps.oriAsk ? <PortalCommand canAct={me.caps.oriAct} /> : <PortalSearch />}
      {takeovers.length > 0 && <AnnouncementTakeover items={takeovers} />}
      {children}
      {isStaffLikeRole(me.portalRole) ? <StaffShellServer me={me} /> : <StudioShellServer />}
    </div>
  );
}
