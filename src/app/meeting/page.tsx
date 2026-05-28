import { sb } from "@/db/supabase";
import { MeetingExtractor } from "@/components/meeting-extractor";
import { ClipboardPaste, ListChecks, Wand2 } from "lucide-react";
import { listMeetings } from "./actions";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: ClipboardPaste, title: "Capture notes", desc: "Type, paste, or dictate the meeting" },
  { icon: Wand2, title: "Generate minutes", desc: "Turn rough notes into clean minutes" },
  { icon: ListChecks, title: "Create tasks", desc: "Review actions, then save to the registry" },
];

export default async function MeetingPage() {
  const [{ data: rows }, meetings] = await Promise.all([
    sb.from("companies").select("id,name").order("name"),
    listMeetings(),
  ]);
  const companies = (rows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Meeting Workspace</h1>
        <span className="text-xs text-fg-muted">Save notes, generate minutes, and create action items</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.title} className="flex items-center gap-2.5 rounded-xl border border-border bg-bg-elev px-3 py-2.5">
              <div className="w-7 h-7 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
                <Icon size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium flex items-center gap-1.5">
                  <span className="text-fg-subtle tabular">{i + 1}.</span> {s.title}
                </div>
                <div className="text-[11px] text-fg-muted truncate">{s.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      <MeetingExtractor companies={companies} meetings={meetings} />
    </div>
  );
}
