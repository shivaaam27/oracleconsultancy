import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson } from "@/lib/portal-auth";
import { getRequestDetail, markRequestSeen } from "@/lib/requests";
import { RequestConversation } from "@/components/request-conversation";
import {
  portalReplyRequest,
  portalDecideRequest,
  portalAdvanceRequest,
  portalCancelRequest,
} from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request — Oracle Consultancy" };

export default async function PortalRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const { id } = await params;
  const detail = await getRequestDetail(Number(id));
  if (!detail) redirect("/portal/requests");

  const isRequester = detail.requesterId === me.id;
  const isAddressee = detail.addresseeId === me.id;
  // Never trust the URL — only the two participants may open a request.
  if (!isRequester && !isAddressee) redirect("/portal/requests");

  if (isAddressee && !detail.seenAt) {
    await markRequestSeen(detail.id);
    detail.seenAt = new Date().toISOString();
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
          caps={{ reply: true, decide: isAddressee, advance: isAddressee, cancel: isRequester }}
          onReply={portalReplyRequest}
          onDecide={portalDecideRequest}
          onAdvance={portalAdvanceRequest}
          onCancel={portalCancelRequest}
        />
      </Reveal>
    </div>
  );
}
