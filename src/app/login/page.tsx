import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getAdminHash, isAdminSession } from "@/lib/admin-auth";
import { AuthTabs } from "./auth-tabs";

export const metadata = { title: "Sign in — Oracle Consultancy" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdminSession()) redirect("/");
  const firstRun = (await getAdminHash()) === null;

  return (
    <AuthShell kicker="Oracle Consultancy Limited">
      <AuthTabs firstRun={firstRun} />
    </AuthShell>
  );
}
