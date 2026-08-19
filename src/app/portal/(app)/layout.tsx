import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { portalHeaderLabel } from "@/lib/portal-labels";
import { PortalPill } from "@/components/portal-pill";
import { PortalSidebar, RAIL_COOKIE } from "@/components/portal-sidebar";
import { PortalSessionKeeper, PortalSignOut } from "@/components/portal-session";
import { PageTransition } from "@/components/page-transition";
import { NotificationBell } from "@/components/notification-bell";
import { PortalSearch, PortalSearchTrigger } from "@/components/portal-search";
import { PortalCommand, PortalCommandTrigger } from "@/components/portal-command";
import { PortalInstallPrompt } from "@/components/portal-install-prompt";
import { PortalZoom } from "@/components/portal-zoom";
import { PortalNotifyPrompt } from "@/components/portal-notify-prompt";
import { AnnouncementTakeover } from "@/components/announcement-takeover";
import { getPortalPerson, isScopedDirector } from "@/lib/portal-auth";
import { sb } from "@/db/supabase";
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

  // Urgent "takeover" announcements block the portal until acknowledged, and the
  // unseen guided tours, are both best-effort and NON-essential — and independent
  // of each other, so run them together rather than one-after-another. Each sits
  // ABOVE the page error boundary, so a transient DB hiccup here would blank the
  // whole portal; guard each one independently so a failed lookup just means
  // "nothing right now", never a crash.
  const [takeovers, tours] = await Promise.all([
    (async (): Promise<Awaited<ReturnType<typeof takeoverFeedForPerson>>> => {
      try {
        const attrs = await getPersonAudienceAttrs(me.id);
        return attrs ? await takeoverFeedForPerson(attrs) : [];
      } catch {
        return [];
      }
    })(),
    (async (): Promise<Awaited<ReturnType<typeof unseenToursFor>>> => {
      try {
        return await unseenToursFor(audienceForRole(me.portalRole), me.id);
      } catch {
        return [];
      }
    })(),
  ]);

  // Everyone gets the room on a large screen (mobile/tablet keep the focused
  // max-w-3xl). Board-first operators (directors + managers) stay widest for
  // their two-column board.
  const wide = me.portalRole === "director" || me.portalRole === "manager";

  // A company-scoped director (e.g. MES Ltd) leads THEIR company, not Oracle — so
  // the header leads with that company (full legal name where set) and credits
  // Oracle as the platform. Everyone else keeps "Oracle Consultancy · <portal>".
  const scopedDirector = isScopedDirector(me);
  let scopedCompanyName: string | null = null;
  if (scopedDirector && me.directorCompanyIds.length > 0) {
    const { data } = await sb
      .from("companies")
      .select("name,legal_name")
      .in("id", me.directorCompanyIds)
      .order("name");
    const names = (data ?? []).map((c) => ((c.legal_name as string | null)?.trim() || (c.name as string | null)?.trim())).filter(Boolean) as string[];
    // One company → its (legal) name; several → the list, so the header reads
    // "By Oracle Consultancy / DSC Ltd & PES Ltd / Directors Board".
    scopedCompanyName = names.length === 0 ? null : names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
  }

  // The rail's width, decided HERE rather than after hydration. The gutter in
  // globals.css reads this custom property, so the very first paint already has
  // the right amount of room — no page ever starts underneath the rail, and a
  // slow or failed hydration cannot leave it that way.
  const railCollapsed = (await cookies()).get(RAIL_COOKIE)?.value === "1";

  return (
    <div
      data-portal-shell
      style={{ "--portal-sidebar": railCollapsed ? "56px" : "208px" } as React.CSSProperties}
      className={`flex flex-col gap-3 pb-28 md:pb-32 mx-auto ${wide ? "max-w-5xl lg:max-w-none" : "max-w-3xl lg:max-w-none"}`}
    >
      {/* The desktop rail. From lg up this replaces the floating pill, which
          hides itself at the same width — the same arrangement the command
          centre uses. Below lg nothing changes: the pill is still the
          navigation, because a fixed rail on a phone is dead weight. */}
      <PortalSidebar
        role={me.portalRole}
        canOri={me.caps.oriAsk}
        name={scopedDirector && scopedCompanyName ? scopedCompanyName : "Oracle Consultancy"}
        subtitle={scopedDirector ? "Directors Board" : portalHeaderLabel(me.portalRole, me.portalDesignation)}
        tabOverrides={{ tasks: me.caps.navTasks, outbox: me.caps.navOutbox, insights: me.caps.navInsights, cleaning: me.caps.cleaningLog || me.caps.cleaningOverview }}
        initialCollapsed={railCollapsed}
      />
      <header className="flex items-center justify-between gap-3 print-hidden">
        {/* Bell sits top-LEFT, deliberately far from Sign out (top-right) so it
            can't be mis-tapped. */}
        <div className="flex min-w-0 items-center gap-2.5">
          <NotificationBell to="/portal/task" align="left" />
          {/* ORI is the richer, capability-gated command surface; when the person
              can't use ORI, they still get the plain scoped search. Exactly one is
              mounted so the ⌘K / Ctrl+Space hotkey never double-fires. */}
          {me.caps.oriAsk ? <PortalCommandTrigger /> : <PortalSearchTrigger />}
          <div className="min-w-0">
            {scopedDirector && scopedCompanyName ? (
              <>
                <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-fg-subtle">By Oracle Consultancy</p>
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{scopedCompanyName}</p>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-fg-subtle">Directors Board</p>
                <p className="truncate text-sm font-semibold">{me.name}</p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted">
                  Oracle Consultancy · {portalHeaderLabel(me.portalRole, me.portalDesignation)}
                </p>
                <p className="truncate text-sm font-semibold">{me.name}</p>
              </>
            )}
          </div>
        </div>
        <PortalSignOut />
      </header>
      {/* Web-only 0.8 zoom for the whole portal (desktop; mobile/PWA stay 100%). */}
      <PortalZoom />
      {/* Cache a durable remember token so an installed PWA survives app-kill. */}
      <PortalSessionKeeper />
      <PortalInstallPrompt />
      <PortalNotifyPrompt />
      {/* Scoped command surface — mounted once so it persists across navigation.
          Opens on ⌘K / Ctrl+K / Ctrl+Space or the header/pill trigger. ORI (search
          + ask + optional act) when the person has oriAsk; otherwise the plain
          scoped search. Exactly one is mounted so the hotkey never double-fires. */}
      {me.caps.oriAsk ? <PortalCommand canAct={me.caps.oriAct} /> : <PortalSearch />}
      <PageTransition>{children}</PageTransition>
      <PortalPill
        canCreate={me.caps.createTasks || me.caps.createEvents}
        canOri={me.caps.oriAsk}
        role={me.portalRole}
        tabOverrides={{ tasks: me.caps.navTasks, outbox: me.caps.navOutbox, insights: me.caps.navInsights, cleaning: me.caps.cleaningLog || me.caps.cleaningOverview }}
      />
      {takeovers.length > 0 && <AnnouncementTakeover items={takeovers} />}
      <TourRunner tours={tours} onSeen={portalMarkTourSeen} fetchReplay={portalGetTour} />
    </div>
  );
}
