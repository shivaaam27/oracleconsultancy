import { PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import { AdminChat } from "../chat-page-inner";
import { getViewer } from "@/lib/viewer";
import { StudioRebuilding } from "@/components/studio/rebuilding";

export const dynamic = "force-dynamic";

export default async function ChatThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const id = Number(threadId);
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.kind === "director") {
    return <StudioRebuilding title="Chat" />;
  }
  return (
    <div>
      <PageHeader title="Chat" sub="Message anyone across the portfolio" />
      <AdminChat initialThreadId={Number.isFinite(id) ? id : null} />
    </div>
  );
}
