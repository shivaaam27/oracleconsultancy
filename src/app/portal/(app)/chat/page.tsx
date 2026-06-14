import { redirect } from "next/navigation";
import { getOrCreateDm, personParticipant } from "@/lib/chat";
import { getPortalPerson } from "@/lib/portal-auth";
import { PortalChat } from "./chat-page-inner";

export const dynamic = "force-dynamic";

export default async function PortalChatPage({
  searchParams,
}: {
  searchParams: Promise<{ dm?: string }>;
}) {
  // `?dm=<personId>` (e.g. from a "My team" card) opens — or starts — a direct
  // message with that person, instead of dumping you on the chat home screen.
  // Mirrors the admin /chat behaviour.
  const { dm } = await searchParams;
  if (dm) {
    const personId = Number(dm);
    if (Number.isFinite(personId) && personId > 0) {
      const me = await getPortalPerson();
      if (me && personId !== me.id) {
        const mine = personParticipant(me.id);
        const threadId = await getOrCreateDm(mine, personParticipant(personId), mine);
        redirect(`/portal/chat/${threadId}`);
      }
    }
  }

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold tracking-tight">Chat</h1>
      <PortalChat initialThreadId={null} />
    </div>
  );
}
