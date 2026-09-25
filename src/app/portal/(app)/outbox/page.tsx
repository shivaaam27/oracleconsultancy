import { redirect } from "next/navigation";

/** The old portal Outbox, removed 26 Sept 2026. Directors and managers use the
 *  Studio Outbox (`/outbox` — the portal layout sends them there); staff have
 *  no Outbox. This address stays only so old links still land somewhere. */
export default function PortalOutboxRedirect() {
  redirect("/portal");
}
