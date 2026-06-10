import { redirect } from "next/navigation";
import { Panel } from "@/components/surface-kit";
import { getAdminHash, isAdminSession } from "@/lib/admin-auth";
import { AdminLoginForm } from "./login-form";

export const metadata = { title: "Sign in — Oracle Consultancy Operations" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdminSession()) redirect("/");
  const firstRun = (await getAdminHash()) === null;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center gap-6">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-fg-muted">Oracle Consultancy</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Command Centre</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {firstRun
            ? "First time here — create the owner password that protects the whole system."
            : "Owner sign-in."}
        </p>
      </div>
      <Panel glass className="p-5 sm:p-6">
        <AdminLoginForm firstRun={firstRun} />
      </Panel>
      <p className="text-center text-xs text-fg-subtle">
        Staff member? Your sign-in is at <a href="/portal/login" className="underline hover:text-fg">/portal</a>.
      </p>
    </div>
  );
}
