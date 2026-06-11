import { PageHeader } from "@/components/ui";
import { AdminChat } from "./chat-page-inner";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div>
      <PageHeader title="Chat" sub="Message anyone across the portfolio" />
      <AdminChat initialThreadId={null} />
    </div>
  );
}
