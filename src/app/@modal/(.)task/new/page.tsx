import { sb } from "@/db/supabase";
import { NewTaskForm } from "@/app/task/new/new-task-form";
import { RouteModal } from "@/components/route-modal";

export const dynamic = "force-dynamic";

/**
 * Intercepting route: when /task/new is reached by in-app navigation, it renders
 * here as a modal over the current page (the @modal parallel slot) instead of a
 * full-page navigation. A direct visit / refresh falls through to the real
 * /task/new page.
 */
export default async function NewTaskModal({ searchParams }: { searchParams: Promise<{ companyId?: string; returnTo?: string }> }) {
  const sp = await searchParams;
  const { data: rows } = await sb.from("companies").select("id,name").order("name");
  const companies = (rows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const presetCompany = sp.companyId ? parseInt(sp.companyId, 10) : companies[0]?.id;

  return (
    <RouteModal title="New task" subtitle="Create an action item tracked across the portfolio.">
      <NewTaskForm companies={companies} presetCompany={presetCompany} returnTo={sp.returnTo} />
    </RouteModal>
  );
}
