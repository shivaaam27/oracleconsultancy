import { redirect } from "next/navigation";
import { getPortalPerson } from "@/lib/portal-auth";
import { PortalChat } from "../chat-page-inner";

export const dynamic = "force-dynamic";

export default async function PortalChatThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const id = Number(threadId);
  if ((await getPortalPerson())?.portalRole === "director") redirect(`/chat/${threadId}`);
  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold tracking-tight">Chat</h1>
      <PortalChat initialThreadId={Number.isFinite(id) ? id : null} />
    </div>
  );
}
