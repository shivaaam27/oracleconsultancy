import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { AskOri } from "@/components/ask-ori";

export const dynamic = "force-dynamic";

/**
 * Ask ORI — routed through the cloud-agent engine (ai_jobs queue), answered by the
 * ORI worker on the Max plan. No external AI service. (The legacy ⌘K "Ask COS"
 * assistant still uses the old synchronous /api/ask; this is the new async path.)
 */
export default function AskPage() {
  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <HrmsCrumbs />
      <PageHeader
        title="Ask ORI"
        sub="Ask about your tasks, documents, people, companies and governance. ORI answers grounded in your live data — powered by the cloud agent, no external AI service."
      />
      <AskOri />
    </div>
  );
}
