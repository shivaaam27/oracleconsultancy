import { sb } from "@/db/supabase";
import { MeetingExtractor } from "@/components/meeting-extractor";
import { WorkbookShell } from "@/components/workbook-shell";
import { NotesWorkspace } from "@/components/notes-workspace";
import { WorkbookTodo } from "@/components/workbook-todo";
import { listMeetings } from "../meeting/actions";
import { listNotes } from "../notes/actions";
import { getAppSettings } from "@/lib/settings";
import { getAllTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function WorkbookPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ data: rows }, meetings, notes, settings, allTasks, sp] = await Promise.all([
    sb.from("companies").select("id,name").order("name"),
    listMeetings(),
    listNotes(),
    getAppSettings(),
    getAllTasks(),
    searchParams,
  ]);
  const companies = (rows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const initialTab = sp.tab === "notes" ? "notes" : sp.tab === "todo" ? "todo" : "meetings";

  // Open tasks that carry a deadline become reminders/to-dos.
  const todoTasks = allTasks.filter((t) => t.deadline && t.status !== "Completed" && t.status !== "Closed");

  return (
    <WorkbookShell
      initialTab={initialTab}
      meetingsSlot={
        <MeetingExtractor companies={companies} meetings={meetings} voiceLanguage={settings.voiceLanguage} />
      }
      notesSlot={<NotesWorkspace initialNotes={notes} companies={companies} />}
      todoSlot={<WorkbookTodo tasks={todoTasks} />}
    />
  );
}
