import { redirect } from "next/navigation";
import { getAdminHash, isAdminSession } from "@/lib/auth/admin-auth";
import { StudioSignIn } from "@/components/studio/auth/studio-sign-in";
import { getPortalPerson } from "@/lib/portal/portal-auth";
import { ForgetOfflineNotes } from "@/components/notes/forget-offline-notes";

export const metadata = { title: "Sign in — Oracle Consultancy" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdminSession()) redirect("/");
  const me = await getPortalPerson();
  if (me) redirect(me.portalRole === "director" || me.portalRole === "manager" ? "/" : "/portal");
  const firstRun = (await getAdminHash()) === null;

  return (
    <>
      {/* Looking at this screen means this device should not be holding a
          readable copy of the notes. Clears the cache, never the writing that
          has not been sent. */}
      <ForgetOfflineNotes />
      <StudioSignIn firstRun={firstRun} />
    </>
  );
}
