import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ADMIN, getOrCreateDm, personParticipant } from "@/lib/chat";
import { AdminChat } from "./chat-page-inner";
import { getViewer } from "@/lib/viewer";
import { StudioRebuilding } from "@/components/studio/rebuilding";

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
  const v = await getViewer();
  if (!v) redirect("/login");
  // A director chats as themselves, on the shared screens (mockup M_Chat).
  if (v.kind === "director") {
    if (dm) {
      const personId = Number(dm);
      if (Number.isFinite(personId) && personId > 0 && personId !== v.person.id) {
        const mine = personParticipant(v.person.id);
        redirect(`/chat/${await getOrCreateDm(mine, personParticipant(personId), mine)}`);
      }
    }
    // Closed to directors until it is rebuilt in the Studio design.
    return <StudioRebuilding title="Chat" />;
  }
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
