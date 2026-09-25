"use client";

/**
 * Which frame a portal page wears (26 Sept 2026). A member of STAFF on a page
 * rebuilt in Studio gets the Studio footer and none of the old rail, header or
 * pill; every other page (and everyone else) keeps the old chrome until its
 * turn.
 *
 * ⚠️ DECIDED HERE, ON THE CLIENT, FROM THE ADDRESS — NOT IN THE LAYOUT. A
 * layout is not re-rendered when you move between the pages under it, so a
 * choice made there from the request headers stays whatever the FIRST page
 * was: Home would have kept the Studio frame all the way into Chat. The layout
 * renders both sets of chrome on the server and this picks one.
 */
import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/page-transition";
import { isStaffStudioPath } from "@/lib/director-routes";

export function PortalFrame({ staff, studioRole = false, studioChrome, classicTop, classicBottom, common, style, className, children }: {
  staff: boolean;
  /** A director or manager: their portal pages (Profile, a manager's Cleaning) are Studio too. */
  studioRole?: boolean;
  studioChrome: React.ReactNode;
  classicTop: React.ReactNode;
  classicBottom: React.ReactNode;
  common: React.ReactNode;
  style: React.CSSProperties;
  className: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/portal";
  const p = pathname.replace(/\/+$/, "");
  if ((staff && isStaffStudioPath(pathname)) || (studioRole && (p === "/portal/profile" || p === "/portal/cleaning"))) {
    return (
      <div className="flex flex-col">
        {common}
        {children}
        {studioChrome}
      </div>
    );
  }
  return (
    <div data-portal-shell style={style} className={className}>
      {classicTop}
      {common}
      <PageTransition>{children}</PageTransition>
      {classicBottom}
    </div>
  );
}
