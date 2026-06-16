import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { PortalPill } from "@/components/portal-pill";
import { AnnouncementTakeover } from "@/components/announcement-takeover";
import { getPortalPerson } from "@/lib/portal-auth";
import { getPersonAudienceAttrs, takeoverFeedForPerson } from "@/lib/announcements";
import { portalLogout } from "../actions";

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
  const attrs = await getPersonAudienceAttrs(me.id);
  const takeovers = attrs ? await takeoverFeedForPerson(attrs) : [];

  return (
    <div className="flex flex-col gap-5 pb-28 md:pb-32 max-w-3xl mx-auto">
      <header className="flex items-center justify-between gap-3 print-hidden">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted">
            Oracle Consultancy · {me.portalRole === "manager" ? "Manager portal" : me.portalRole === "hr" ? "HR / Admin portal" : me.portalRole === "director" ? "Director board" : "Staff portal"}
          </p>
          <p className="truncate text-sm font-semibold">{me.name}</p>
        </div>
        <form action={portalLogout}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-full bg-bg-elev ring-1 ring-border px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg transition-colors"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </form>
      </header>
      {children}
      <PortalPill canCreate={me.portalRole !== "staff"} role={me.portalRole} />
      {takeovers.length > 0 && <AnnouncementTakeover items={takeovers} />}
    </div>
  );
}
