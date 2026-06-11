import { PortalChat } from "../chat-page-inner";

export const dynamic = "force-dynamic";

export default async function PortalChatThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const id = Number(threadId);
  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold tracking-tight">Chat</h1>
      <PortalChat initialThreadId={Number.isFinite(id) ? id : null} />
    </div>
  );
}
