import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ADMIN, getOrCreateDm, personParticipant } from "@/lib/chat";
import { AdminChat } from "./chat-page-inner";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ dm?: string }>;
}) {
  // `?dm=<personId>` (e.g. from a person's profile "Message in chat") opens — or
  // starts — a direct message with that person, instead of dumping you on the
  // chat home screen.
  const { dm } = await searchParams;
  if (dm) {
    const personId = Number(dm);
    if (Number.isFinite(personId) && personId > 0) {
      const threadId = await getOrCreateDm(ADMIN, personParticipant(personId), ADMIN);
      redirect(`/chat/${threadId}`);
    }
  }

  return (
    <div>
      <PageHeader title="Chat" sub="Message anyone across the portfolio" />
      <AdminChat initialThreadId={null} />
    </div>
  );
}
