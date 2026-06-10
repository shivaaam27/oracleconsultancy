"use client";

import { usePathname } from "next/navigation";

/** Renders nothing on staff-portal routes and the sign-in screens. Keeps the
 *  admin chrome (nav pill, drawers, assistant, capture wizard) out of those
 *  pages — both for the standalone look and so visitors who are not signed
 *  in cannot reach admin data through it. */
export function HideOnPortal({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  if (pathname.startsWith("/portal") || pathname.startsWith("/e/") || pathname === "/login") return null;
  return <>{children}</>;
}
