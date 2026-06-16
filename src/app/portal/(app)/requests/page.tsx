import { redirect } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson } from "@/lib/portal-auth";
import { listRequestsForPortal, requestRecipientsFor } from "@/lib/requests";
import { RequestComposer } from "@/components/request-composer";
import { RequestList } from "@/components/request-list";
import { portalRaiseRequest } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Requests — Oracle Consultancy" };

export default async function PortalRequestsPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const [rows, { people }] = await Promise.all([listRequestsForPortal(me.id), requestRecipientsFor(me.id)]);

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={30} />
      <Reveal delay={0}>
        <Hero title="Requests" subtitle="Ask for what you need — equipment, HR, admin or anything else — without leaving your desk.">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <MessageSquareText size={15} />
            {rows.length} request{rows.length === 1 ? "" : "s"} in view
          </div>
        </Hero>
      </Reveal>
      <Reveal delay={0.05}>
        <RequestComposer recipients={people} action={portalRaiseRequest} allowOwner />
      </Reveal>
      <Reveal delay={0.1}>
        <RequestList rows={rows} base="/portal/requests" meId={me.id} scope="portal" />
      </Reveal>
    </div>
  );
}
