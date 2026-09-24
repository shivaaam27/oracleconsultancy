import { redirect } from "next/navigation";
import { getPortalPerson } from "@/lib/portal-auth";
import { StudioSignIn } from "@/components/studio/auth/studio-sign-in";
import { getAdminHash, isAdminSession } from "@/lib/admin-auth";
import { PortalSessionRestore } from "@/components/portal-session";

export const metadata = { title: "Staff sign in — Oracle Consultancy" };

export default async function PortalLoginPage() {
  // Already signed in? Straight to the portal.
  const me = await getPortalPerson();
  if (me) redirect("/portal");
  if (await isAdminSession()) redirect("/");
  const firstRun = (await getAdminHash()) === null;

  // The SAME screen as /login (owner, 25 Sept 2026: the Administrator option
  // "at times" vanished — this address used to be staff-only).
  return (
    <>
      {/* If this device kept a durable remember token (PWA dropped the cookie on
          app-kill), silently re-mint the session and bounce back to the portal. */}
      <PortalSessionRestore />
      <StudioSignIn firstRun={firstRun} />
    </>
  );
}
