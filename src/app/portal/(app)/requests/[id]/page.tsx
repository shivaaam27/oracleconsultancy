import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { sb } from "@/db/supabase";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { directReportIds, getPortalPerson } from "@/lib/portal-auth";
import { getRequestDetail, isRecipient, markRequestSeen } from "@/lib/requests";
import { RequestConversation } from "@/components/request-conversation";
import {
  portalReplyRequest,
  portalDecideRequest,
  portalAdvanceRequest,
  portalCancelRequest,
  portalConvertRequest,
} from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request — Oracle Consultancy" };

export default async function PortalRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  // Requests visibility is owner-configurable per role (Settings → Portals).
  if (!me.caps.navRequests) redirect("/portal");
  const { id } = await params;
  const detail = await getRequestDetail(Number(id));
  if (!detail) redirect("/portal/requests");

  const isRequester = detail.requesterId === me.id;
  const recipient = await isRecipient(detail.id, me.id);
  // Never trust the URL — only the requester or a recipient may open a request.
  if (!isRequester && !recipient) redirect("/portal/requests");

  if (recipient && !detail.seenAt) {
    await markRequestSeen(detail.id);
    detail.seenAt = new Date().toISOString();
  }

  // Directors are redirected out above, so only manager / HR reach this.
  const canConvert = recipient && (me.portalRole === "manager" || me.portalRole === "hr");
  let convertOptions: { companies: { id: number; name: string }[]; people: { id: number; name: string }[] } | undefined;
  if (canConvert) {
    if (me.portalRole === "manager") {
      const reports = await directReportIds(me.id);
      const teamIds = Array.from(new Set([me.id, ...reports]));
      const { data: people } = await sb.from("people").select("id,name,company_id").in("id", teamIds);
      const companyIds = Array.from(new Set((people ?? []).map((p) => p.company_id as number).filter(Boolean)));
      const { data: companies } = companyIds.length
        ? await sb.from("companies").select("id,name").in("id", companyIds)
        : { data: [] as { id: number; name: string }[] };
      convertOptions = {
        companies: (companies ?? []).map((c) => ({ id: c.id as number, name: c.name as string })),
        people: (people ?? []).map((p) => ({ id: p.id as number, name: p.name as string })),
      };
    } else {
      const [{ data: companies }, { data: people }] = await Promise.all([
        sb.from("companies").select("id,name").eq("active", true).order("name"),
        sb.from("people").select("id,name").eq("active", true).order("name"),
      ]);
      convertOptions = {
        companies: (companies ?? []).map((c) => ({ id: c.id as number, name: c.name as string })),
        people: (people ?? []).map((p) => ({ id: p.id as number, name: p.name as string })),
      };
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={20} />
      <Link href="/portal/requests" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={15} /> All requests
      </Link>
      <Reveal delay={0}>
        <RequestConversation
          detail={detail}
          viewerIsOwner={false}
          caps={{ reply: true, decide: recipient, advance: recipient, cancel: isRequester, convert: Boolean(canConvert) }}
          onReply={portalReplyRequest}
          onDecide={portalDecideRequest}
          onAdvance={portalAdvanceRequest}
          onCancel={portalCancelRequest}
          onConvert={portalConvertRequest}
          convertOptions={convertOptions}
        />
      </Reveal>
    </div>
  );
}
