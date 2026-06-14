import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { PortalPill } from "@/components/portal-pill";
import { getPortalPerson } from "@/lib/portal-auth";
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

  return (
    <div className="flex flex-col gap-5 pb-28 max-w-3xl mx-auto">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted">
            Oracle Consultancy · {me.portalRole === "manager" ? "Manager portal" : me.portalRole === "director" ? "Director board" : "Staff portal"}
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
      <PortalPill canCreate={me.portalRole === "manager" || me.portalRole === "director"} role={me.portalRole} />
    </div>
  );
}
