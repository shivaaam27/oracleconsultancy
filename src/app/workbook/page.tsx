import { sb } from "@/db/supabase";
import { MeetingExtractor } from "@/components/meeting-extractor";
import { WorkbookShell } from "@/components/workbook-shell";
import { listMeetings } from "../meeting/actions";
import { getAppSettings } from "@/lib/settings";
import { StickyNote } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WorkbookPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ data: rows }, meetings, settings, sp] = await Promise.all([
    sb.from("companies").select("id,name").order("name"),
    listMeetings(),
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
      notesSlot={<NotesPlaceholder />}
    />
  );
}

function NotesPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-bg-subtle py-16 text-center">
      <StickyNote size={28} className="mx-auto text-fg-subtle mb-3" />
      <p className="text-sm font-medium">Notes are coming next</p>
      <p className="text-xs text-fg-muted mt-1 max-w-sm mx-auto">
        A clean, Apple-Notes-style space for quick jottings — with a side list, instant search,
        and autosave. Your captured notes will live here.
      </p>
    </div>
  );
}
