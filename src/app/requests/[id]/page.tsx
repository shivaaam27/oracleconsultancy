import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { sb } from "@/db/supabase";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { getRequestDetail, markRequestSeen } from "@/lib/requests";
import { RequestConversation } from "@/components/request-conversation";
import {
  adminReplyRequest,
  adminDecideRequest,
  adminAdvanceRequest,
  adminCancelRequest,
  adminConvertRequest,
} from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request — Oracle Consultancy" };

export default async function AdminRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getRequestDetail(Number(id));
  if (!detail) redirect("/requests");

  if (detail.recipients.some((p) => p.isOwner) && !detail.seenAt) {
    await markRequestSeen(detail.id);
    detail.seenAt = new Date().toISOString();
  }

  const [{ data: companies }, { data: people }] = await Promise.all([
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  const convertOptions = {
    companies: (companies ?? []).map((c) => ({ id: c.id as number, name: c.name as string })),
    people: (people ?? []).map((p) => ({ id: p.id as number, name: p.name as string })),
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <AutoRefresh seconds={20} />
      <Link href="/requests" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={15} /> All requests
      </Link>
      <Reveal delay={0}>
        <RequestConversation
          detail={detail}
          viewerIsOwner
          caps={{ reply: true, decide: true, advance: true, cancel: true, convert: !detail.convertedTaskCode }}
          onReply={adminReplyRequest}
          onDecide={adminDecideRequest}
          onAdvance={adminAdvanceRequest}
          onCancel={adminCancelRequest}
          onConvert={adminConvertRequest}
          convertOptions={convertOptions}
        />
      </Reveal>
    </div>
  );
}
