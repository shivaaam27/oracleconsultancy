import { sb } from "@/db/supabase";
import { MeetingExtractor } from "@/components/meeting-extractor";
import { WorkbookShell } from "@/components/workbook-shell";
import { NotesWorkspace } from "@/components/notes-workspace";
import { WorkbookTodo } from "@/components/workbook-todo";
import { listMeetings } from "../meeting/actions";
import { listNotes } from "../notes/actions";
import { listTodos } from "../todos/actions";
import { getAppSettings } from "@/lib/settings";
import { getAllTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function WorkbookPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; open?: string }>;
}) {
  const [{ data: rows }, meetings, notes, todos, settings, allTasks, sp] = await Promise.all([
    sb.from("companies").select("id,name").order("name"),
    listMeetings(),
    listNotes(),
    listTodos(),
    getAppSettings(),
    getAllTasks(),
    searchParams,
  ]);
  const companies = (rows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const initialTab = sp.tab === "notes" ? "notes" : sp.tab === "todo" ? "todo" : "meetings";
  const openId = sp.open ? Number(sp.open) : undefined;

  // Open tasks that carry a deadline are the company reminders (By company view).
  const companyTasks = allTasks.filter((t) => t.deadline && t.status !== "Completed" && t.status !== "Closed");

  return (
    <WorkbookShell
      initialTab={initialTab}
      meetingsSlot={
        <MeetingExtractor companies={companies} meetings={meetings} voiceLanguage={settings.voiceLanguage} openId={initialTab === "meetings" ? openId : undefined} />
      }
      notesSlot={<NotesWorkspace initialNotes={notes} companies={companies} openId={initialTab === "notes" ? openId : undefined} />}
      todoSlot={<WorkbookTodo companyTasks={companyTasks} todos={todos} companies={companies} voiceLanguage={settings.voiceLanguage} />}
    />
  );
}
