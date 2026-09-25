import { redirect } from "next/navigation";
import { getPortalPerson } from "@/lib/portal/portal-auth";
import { StudioSignIn } from "@/components/studio/auth/studio-sign-in";
import { ForgetOfflineNotes } from "@/components/notes/forget-offline-notes";
import { getAdminHash, isAdminSession } from "@/lib/auth/admin-auth";
import { PortalSessionRestore } from "@/components/portal/portal-session";

export const metadata = { title: "Staff sign in — Oracle Consultancy" };

export default async function PortalLoginPage() {
  // Already signed in? Straight to the portal.
  const me = await getPortalPerson();
  if (me) redirect(me.portalRole === "director" || me.portalRole === "manager" ? "/" : "/portal");
  if (await isAdminSession()) redirect("/");
  const firstRun = (await getAdminHash()) === null;

  // The SAME screen as /login (owner, 25 Sept 2026: the Administrator option
  // "at times" vanished — this address used to be staff-only).
  return (
    <>
      {/* If this device kept a durable remember token (PWA dropped the cookie on
          app-kill), silently re-mint the session and bounce back to the portal. */}
      <PortalSessionRestore />
      <ForgetOfflineNotes />
      <StudioSignIn firstRun={firstRun} />
    </>
  );
}
