import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { sb } from "@/db/supabase";
import { RecurringTasksPanel } from "@/components/portal-recurring-tasks";
import type { PickerCompany, PickerPerson } from "@/lib/portal-picker";
import {
  listRecurringTasks, createRecurringTask, updateRecurringTask, setRecurringTaskPaused, deleteRecurringTask,
} from "../recurring-actions";

export const dynamic = "force-dynamic";

/** The Administrator's recurring tasks — every standing rule, whoever set it up.
 *  Until Sept 2026 these were reachable only through System → ORI Automation,
 *  mixed in with every other automation, where a rule could be paused or
 *  cancelled but never edited. The portal had this panel; the administrator did
 *  not. Same panel, the administrator's door. */
export default async function RecurringTasksPage() {
  const [rules, companiesRes, peopleRes] = await Promise.all([
    listRecurringTasks(),
    sb.from("companies").select("id,name").order("name"),
    sb.from("people").select("id,name,company_id").eq("active", true).order("name"),
  ]);
  const companies: PickerCompany[] = ((companiesRes.data ?? []) as { id: number; name: string }[]).map((c) => ({ id: c.id, name: c.name }));
  const people: PickerPerson[] = ((peopleRes.data ?? []) as { id: number; name: string; company_id: number | null }[]).map((p) => ({
    id: p.id, name: p.name, companyId: p.company_id, companyIds: p.company_id != null ? [p.company_id] : [],
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-28">
      <HrmsCrumbs />
      <PageHeader
        title="Recurring tasks"
        sub="Tasks that recreate themselves on chosen days each week or month — every standing rule, whoever set it up. Switch one off to keep its settings without it firing."
      />
      <RecurringTasksPanel
        rules={rules}
        companies={companies}
        people={people}
        showCreator
        actions={{ create: createRecurringTask, update: updateRecurringTask, setPaused: setRecurringTaskPaused, remove: deleteRecurringTask }}
      />
    </main>
  );
}
