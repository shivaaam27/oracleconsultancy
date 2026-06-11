import { getAppSettings } from "@/lib/settings";
import { ChatSurface } from "@/components/chat-surface";
import {
  deleteChatMessage,
  editChatMessage,
  listMyThreads,
  listPeople,
  muteThread,
  newGroup,
  openThread,
  postMessage,
  signChatAttachment,
  startDm,
} from "./actions";
import { ADMIN } from "@/lib/chat";

/* Shared body for /chat and /chat/[threadId] — wires the admin server actions
 * into the shared ChatSurface. The owner can create groups freely; "Owner" is
 * themselves, so there's no owner DM option. */
export async function AdminChat({ initialThreadId }: { initialThreadId: number | null }) {
  const [people, settings] = await Promise.all([listPeople(), getAppSettings()]);
  return (
    <ChatSurface
      me={ADMIN}
      meName="Owner"
      people={people}
      canCreateGroup
      ownerOption={false}
      initialThreadId={initialThreadId}
      taskBase="/task"
      voiceLang={settings.voiceLanguage}
      actions={{
        listMyThreads,
        openThread,
        startDm,
        newGroup,
        postMessage,
        editChatMessage,
        deleteChatMessage,
        muteThread,
        signChatAttachment,
      }}
    />
  );
}
