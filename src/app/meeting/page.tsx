import { db, schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { MeetingExtractor } from "@/components/meeting-extractor";
import { NotebookPen } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MeetingPage() {
  const companies = await db
    .select({ id: schema.companies.id, name: schema.companies.name })
    .from(schema.companies)
    .orderBy(schema.companies.name);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Meeting Mode"
        sub="Paste raw meeting notes — action items are extracted and created automatically"
      />

      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: "📋", title: "Paste anything", desc: "Raw minutes, bullet points, voice transcripts, rough notes — any format works" },
          { icon: "✦", title: "Auto-extracted", desc: "Action verbs, assignees, deadlines, priorities and companies detected instantly" },
          { icon: "✅", title: "Review & save", desc: "Edit any field before bulk-creating all tasks directly into the registry" },
        ].map(s => (
          <div key={s.title} className="card p-4 space-y-1">
            <div className="text-lg">{s.icon}</div>
            <div className="text-sm font-medium">{s.title}</div>
            <div className="text-xs text-fg-muted leading-relaxed">{s.desc}</div>
          </div>
        ))}
      </div>

      <MeetingExtractor companies={companies} />
    </div>
  );
}
