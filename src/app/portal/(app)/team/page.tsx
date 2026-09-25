import { redirect } from "next/navigation";

/** The old manager "team" page. Managers now use the owner's Studio screens (the
 *  portal layout sends them to `/outbox`); this address stays only so old links
 *  still land somewhere. */
export default function PortalTeamRedirect() {
  redirect("/portal");
}
