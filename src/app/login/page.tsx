import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getAdminHash, isAdminSession } from "@/lib/admin-auth";
import { AuthTabs } from "./auth-tabs";
import { ForgetOfflineNotes } from "@/components/forget-offline-notes";

export const metadata = { title: "Sign in — Oracle Consultancy" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdminSession()) redirect("/");
  const firstRun = (await getAdminHash()) === null;

  return (
    <AuthShell kicker="Oracle Consultancy Limited">
      {/* Looking at this screen means this device should not be holding a
          readable copy of the notes. Clears the cache, never the writing that
          has not been sent. */}
      <ForgetOfflineNotes />
      <AuthTabs firstRun={firstRun} />
    </AuthShell>
  );
}
