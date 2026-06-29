import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getPortalPerson } from "@/lib/portal-auth";
import { LoginForm } from "./login-form";
import { PortalSessionRestore } from "@/components/portal-session";

export const metadata = { title: "Staff sign in — Oracle Consultancy" };

export default async function PortalLoginPage() {
  // Already signed in? Straight to the portal.
  const me = await getPortalPerson();
  if (me) redirect("/portal");

  return (
    <AuthShell
      kicker="Oracle Consultancy"
      title="Staff portal"
      subtitle="Sign in to see your tasks and post updates."
      footer={<>No access yet? Ask your administrator to enable the portal for you.</>}
    >
      {/* If this device kept a durable remember token (PWA dropped the cookie on
          app-kill), silently re-mint the session and bounce back to the portal. */}
      <PortalSessionRestore />
      <LoginForm />
    </AuthShell>
  );
}
