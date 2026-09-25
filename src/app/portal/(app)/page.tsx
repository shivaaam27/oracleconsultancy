import { redirect } from "next/navigation";
import { getPortalPerson } from "@/lib/portal-auth";
import { StaffStudioHome } from "./staff-home";

/**
 * The portal's front door. Directors AND managers are board-first (their board
 * is the shared Studio Home over their companies); everyone else — staff and
 * the receptionist — gets the Studio staff Home. The old portal home (hero,
 * task housing, HR shortcut) went with the HR role on 26 Sept 2026: nobody
 * could reach it any more.
 */
export default async function PortalHome() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole === "director" || me.portalRole === "manager") redirect("/portal/board");
  return <StaffStudioHome me={me} />;
}
