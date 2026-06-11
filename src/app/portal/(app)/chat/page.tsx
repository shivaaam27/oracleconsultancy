import { PortalChat } from "./chat-page-inner";

export const dynamic = "force-dynamic";

export default function PortalChatPage() {
  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold tracking-tight">Chat</h1>
      <PortalChat initialThreadId={null} />
    </div>
  );
}
