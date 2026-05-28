import { sb } from "@/db/supabase";
import { MeetingExtractor } from "@/components/meeting-extractor";
import { ClipboardPaste, Wand2, ListChecks } from "lucide-react";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: ClipboardPaste, title: "Paste anything", desc: "Minutes, bullets, transcripts — any format" },
  { icon: Wand2, title: "Auto-extracted", desc: "Assignees, deadlines, priorities detected" },
  { icon: ListChecks, title: "Review & save", desc: "Edit, then bulk-create into the registry" },
];

export default async function MeetingPage() {
  const { data: rows } = await sb.from("companies").select("id,name").order("name");
  const companies = (rows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Meeting Mode</h1>
        <span className="text-xs text-fg-muted">Paste notes — action items extracted automatically</span>
      </div>

      {/* Slim step strip */}
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

      <MeetingExtractor companies={companies} />
    </div>
  );
}
