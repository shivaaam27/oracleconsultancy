import { sb } from "@/db/supabase";
import { QuickCapture } from "@/components/quick-capture";
import { PageHeader, Card } from "@/components/ui";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const { data: rows } = await sb.from("companies").select("id,name");
  const companies = (rows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Capture"
        sub="Turn rough notes into structured tasks"
      />

      <QuickCapture companies={companies} />

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Sparkles size={16} className="text-accent" />
          </div>
          <div className="space-y-2 text-sm text-fg-muted">
            <p className="font-medium text-fg">How it works</p>
            <ul className="space-y-1.5 list-disc pl-4">
              <li>Type free-form notes — mention company, person, deadline, priority.</li>
              <li>The parser detects fields automatically; you can edit anything before saving.</li>
              <li>Use the ✦ button to polish the action item with AI.</li>
              <li>Saved tasks appear in the Registry and on the Dashboard immediately.</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
