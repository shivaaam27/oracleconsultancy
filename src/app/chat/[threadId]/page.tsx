import { PageHeader } from "@/components/ui";
import { AdminChat } from "../chat-page-inner";

export const dynamic = "force-dynamic";

export default async function ChatThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const id = Number(threadId);
  return (
    <div>
      <PageHeader title="Chat" sub="Message anyone across the portfolio" />
      <AdminChat initialThreadId={Number.isFinite(id) ? id : null} />
    </div>
  );
}
