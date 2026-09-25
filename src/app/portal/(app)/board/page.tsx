import { redirect } from "next/navigation";

/** The old director/manager board. Directors and managers now use the owner's
 *  Studio Home (the portal layout sends them to `/`); this address stays only so
 *  old links and notifications still land somewhere. */
export default function PortalBoardRedirect() {
  redirect("/portal");
}
