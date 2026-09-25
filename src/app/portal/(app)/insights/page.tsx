import { redirect } from "next/navigation";

/** The old portal Insights page, removed 26 Sept 2026. Directors and managers
 *  have Studio Home (the portal layout sends them to `/`); staff have no
 *  Insights. This address stays only so old links still land somewhere. */
export default function PortalInsightsRedirect() {
  redirect("/portal");
}
