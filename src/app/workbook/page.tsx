import { sb } from "@/db/supabase";
import { MeetingExtractor } from "@/components/meeting-extractor";
import { WorkbookShell } from "@/components/workbook-shell";
import { NotesWorkspace } from "@/components/notes-workspace";
import { listMeetings } from "../meeting/actions";
import { listNotes } from "../notes/actions";
import { getAppSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function WorkbookPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ data: rows }, meetings, notes, settings, sp] = await Promise.all([
    sb.from("companies").select("id,name").order("name"),
    listMeetings(),
    listNotes(),
    getAppSettings(),
    searchParams,
  ]);
  const companies = (rows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const initialTab = sp.tab === "notes" ? "notes" : "meetings";

  return (
    <WorkbookShell
      initialTab={initialTab}
      meetingsSlot={
        <MeetingExtractor companies={companies} meetings={meetings} voiceLanguage={settings.voiceLanguage} />
      }
      notesSlot={<NotesWorkspace initialNotes={notes} companies={companies} />}
    />
  );
}
