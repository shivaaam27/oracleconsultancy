import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { getRequestDetail, markRequestSeen } from "@/lib/requests";
import { RequestConversation } from "@/components/request-conversation";
import { adminReplyRequest, adminDecideRequest, adminAdvanceRequest } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request — Oracle Consultancy" };

export default async function AdminRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getRequestDetail(Number(id));
  if (!detail) redirect("/requests");

  // The owner is the addressee for owner-directed requests — mark seen.
  if (detail.toOwner && !detail.seenAt) {
    await markRequestSeen(detail.id);
    detail.seenAt = new Date().toISOString();
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <AutoRefresh seconds={20} />
      <Link href="/requests" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={15} /> All requests
      </Link>
      <Reveal delay={0}>
        <RequestConversation
          detail={detail}
          caps={{ reply: true, decide: detail.toOwner, advance: true, cancel: false }}
          onReply={adminReplyRequest}
          onDecide={adminDecideRequest}
          onAdvance={adminAdvanceRequest}
        />
      </Reveal>
    </div>
  );
}
