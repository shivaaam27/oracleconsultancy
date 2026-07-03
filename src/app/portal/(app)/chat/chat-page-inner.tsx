import { redirect } from "next/navigation";
import { getAppSettings } from "@/lib/settings";
import { getPortalPerson } from "@/lib/portal-auth";
import { ChatSurface } from "@/components/chat-surface";
import { personParticipant } from "@/lib/chat";
import {
  deleteChatMessage,
  deleteThreadForEveryone,
  editChatMessage,
  hideChatMessage,
  hideThread,
  listMyThreads,
  listPeople,
  markThreadRead,
  muteThread,
  newGroup,
  openThread,
  postMessage,
  purgeChatMessage,
  refreshThread,
  signChatAttachment,
  startDm,
} from "./actions";

/* Shared body for /portal/chat and /portal/chat/[threadId]. Staff can DM
 * anyone (including the Owner); managers and directors may create ad-hoc groups. */
export async function PortalChat({ initialThreadId }: { initialThreadId: number | null }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const [people, settings] = await Promise.all([listPeople(), getAppSettings()]);
  return (
    <ChatSurface
      me={personParticipant(me.id)}
      meName={me.name}
      people={people}
      canCreateGroup={me.portalRole === "manager" || me.portalRole === "director"}
      ownerOption
      initialThreadId={initialThreadId}
      taskBase="/portal/task"
      voiceLang={settings.voiceLanguage}
      actions={{
        listMyThreads,
        openThread,
        refreshThread,
        markThreadRead,
        startDm,
        newGroup,
        postMessage,
        editChatMessage,
        deleteChatMessage,
        hideChatMessage,
        purgeChatMessage,
        hideThread,
        deleteThreadForEveryone,
        muteThread,
        signChatAttachment,
      }}
    />
  );
}
