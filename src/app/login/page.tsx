import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getAdminHash, isAdminSession } from "@/lib/admin-auth";
import { AdminLoginForm } from "./login-form";

export const metadata = { title: "Sign in — Oracle Consultancy Operations" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdminSession()) redirect("/");
  const firstRun = (await getAdminHash()) === null;

  return (
    <AuthShell
      kicker="Oracle Consultancy"
      title="Command Centre"
      subtitle={
        firstRun
          ? "First time here — create the owner password that protects the whole system."
          : "Owner sign-in."
      }
      footer={
        <>
          Staff member? Your sign-in is at{" "}
          <a href="/portal/login" className="underline hover:text-fg">
            /portal
          </a>
          .
        </>
      }
    >
      <AdminLoginForm firstRun={firstRun} />
    </AuthShell>
  );
}
