import { redirect } from "next/navigation";
import { Panel } from "@/components/surface-kit";
import { getPortalPerson } from "@/lib/portal-auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Staff sign in — Oracle Consultancy" };

export default async function PortalLoginPage() {
  // Already signed in? Straight to the portal.
  const me = await getPortalPerson();
  if (me) redirect("/portal");

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center gap-6">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-fg-muted">Oracle Consultancy</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Staff portal</h1>
        <p className="mt-1 text-sm text-fg-muted">Sign in to see your tasks and post updates.</p>
      </div>
      <Panel glass className="p-5 sm:p-6">
        <LoginForm />
      </Panel>
      <p className="text-center text-xs text-fg-subtle">
        No access yet? Ask your administrator to enable the portal for you.
      </p>
    </div>
  );
}
